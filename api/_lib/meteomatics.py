"""
Segunda fonte (Meteomatics, ERA5) só para validação cruzada: nunca substitui a NASA POWER.

 - GET https://api.meteomatics.com/<início>--<fim>:P1D/<parâmetro>/<lat>,<lon>/json?source=ecmwf-era5
 - autenticação básica; credenciais em METEOMATICS_USER / METEOMATICS_PASS
   (local: .env.local na raiz do projeto; Vercel: variáveis de ambiente do projeto)
 - não há agregação mensal pronta (P1M é amostra instantânea): busca diária e a média mensal sai aqui
 - parâmetros *_24h são "right-bounded": o valor de 00 UTC do dia D+1 cobre o dia D, daí o deslocamento de -1 dia
"""
from __future__ import annotations

import os
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

import httpx

from .env import load_local_env

BASE_URL = "https://api.meteomatics.com"
SOURCE = "ecmwf-era5"
TIMEOUT_S = 25.0
MIN_DAYS_PER_MONTH = 25
CREDITS = "Cross-check data: Meteomatics Weather API (ECMWF ERA5 reanalysis)."

# pista -> (parâmetro Meteomatics, unidade exibida, só_sinal)
# só_sinal: a grandeza não é a mesma da NASA (outra definição/escala), então só o sinal é comparável.
# IMERG_PRECTOT não tem equivalente na Meteomatics.
PARAMS: dict[str, tuple[str, str, bool]] = {
    "T2M": ("t_mean_2m_24h:C", "°C", False),
    "T2M_MIN": ("t_min_2m_24h:C", "°C", False),
    "T2M_MAX": ("t_max_2m_24h:C", "°C", False),
    "PRECTOTCORR": ("precip_24h:mm", "mm/dia", False),
    "GWETROOT": ("soil_moisture_index_-50cm:idx", "índice 0–1", True),
}
# Sem EVPTRNS de propósito: evapotranspiration_24h leva ~5,5 s POR ANO (45 anos ≈ 4 min) e a API
# devolve HTTP 429 se a busca for fatiada em paralelo. Não cabe nos 30 s da função na Vercel.


def _credentials() -> tuple[str, str] | None:
    load_local_env()
    user, pw = os.environ.get("METEOMATICS_USER"), os.environ.get("METEOMATICS_PASS")
    return (user, pw) if user and pw else None


def daily_to_monthly(dates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """[{date: ISO, value}] diários (right-bounded) -> registros mensais {date, year, month, value}."""
    by_month: dict[tuple[int, int], list[float]] = defaultdict(list)
    for d in dates:
        v = d["value"]
        if v is None or v <= -600:  # -666 / -999 = sem dado
            continue
        day = datetime.fromisoformat(d["date"].replace("Z", "+00:00")) - timedelta(days=1)
        by_month[(day.year, day.month)].append(float(v))
    return [
        {"date": f"{y:04d}-{m:02d}", "year": y, "month": m,
         "value": sum(vs) / len(vs) if len(vs) >= MIN_DAYS_PER_MONTH else None}
        for (y, m), vs in sorted(by_month.items())
    ]


async def _fetch_daily(client: httpx.AsyncClient, auth: tuple[str, str], param: str,
                       lat: float, lon: float, y0: int, y1: int) -> list[dict[str, Any]]:
    rng = f"{y0}-01-02T00:00:00Z--{y1 + 1}-01-01T00:00:00Z:P1D"
    r = await client.get(f"{BASE_URL}/{rng}/{param}/{lat:.4f},{lon:.4f}/json",
                         params={"source": SOURCE}, auth=auth)
    r.raise_for_status()
    return r.json()["data"][0]["coordinates"][0]["dates"]


async def fetch_monthly(pid: str, lat: float, lon: float, start_year: int, end_year: int) -> list[dict[str, Any]]:
    """Série mensal da pista na Meteomatics. Levanta RuntimeError com motivo legível se não der."""
    auth = _credentials()
    if auth is None:
        raise RuntimeError("credenciais da Meteomatics ausentes (METEOMATICS_USER / METEOMATICS_PASS)")
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            dates = await _fetch_daily(client, auth, PARAMS[pid][0], lat, lon, start_year, end_year)
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(f"Meteomatics respondeu HTTP {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Meteomatics indisponível ({type(exc).__name__})") from exc
    return daily_to_monthly(dates)


def agreement(nasa: dict[str, Any], other: dict[str, Any], sign_only: bool, any_significant: bool = True) -> str:
    """'both_noise' | 'diverge' | 'sign_only' | 'magnitude' | 'agree'.
    Sem nenhuma tendência significativa, o sinal de taxas ~0 é ruído: não se compara."""
    if not any_significant:
        return "both_noise"
    if nasa["slope_per_decade"] * other["slope_per_decade"] < 0:
        return "diverge"
    if sign_only:
        return "sign_only"
    overlap = nasa["ci95_low"] <= other["ci95_high"] and other["ci95_low"] <= nasa["ci95_high"]
    return "agree" if overlap else "magnitude"


_TEXT = {
    "both_noise": ("Nenhuma das duas fontes encontra tendência estatisticamente significativa: as duas concordam que não há evidência suficiente.",
                   "Neither source finds a statistically significant trend: both agree there is not enough evidence."),
    "agree": ("Concorda com outra fonte (ERA5 via Meteomatics): mesmo sinal e intervalos de confiança que se sobrepõem.",
              "Agrees with another source (ERA5 via Meteomatics): same sign and overlapping confidence intervals."),
    "magnitude": ("Mesmo sinal que a outra fonte (ERA5 via Meteomatics), mas as taxas diferem além do intervalo de confiança.",
                  "Same sign as the other source (ERA5 via Meteomatics), but the rates differ beyond the confidence interval."),
    "sign_only": ("Mesmo sinal que a outra fonte (ERA5 via Meteomatics). A variável é definida de outra forma nas duas fontes: só o sinal é comparável.",
                  "Same sign as the other source (ERA5 via Meteomatics). The variable is defined differently in each source: only the sign is comparable."),
    "diverge": ("As fontes divergem: sinais opostos.",
                "The sources disagree: opposite signs."),
}
_NOT_SIG = (" Ao menos uma das fontes não é estatisticamente significativa.",
            " At least one source is not statistically significant.")


def verdict_text(verdict: str, both_significant: bool, lang: str) -> str:
    i = 0 if lang == "pt" else 1
    return _TEXT[verdict][i] + ("" if both_significant or verdict == "both_noise" else _NOT_SIG[i])

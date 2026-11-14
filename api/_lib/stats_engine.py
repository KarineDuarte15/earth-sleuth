"""
Motor científico do Earth Sleuths (determinístico, sem IA, só NumPy + math).

Pipeline por pista e por cena:
 1. Controle de qualidade (RN03): < 15 anos, > 20% de meses ausentes ou < 144 meses
    válidos -> DADOS_INSUFICIENTES; a tendência não é calculada.
 2. Anomalias mensais em relação à climatologia do próprio período (baseline explícito).
 3. Seasonal Mann-Kendall (Hirsch, Slack & Smith, 1982): compara só janeiro com janeiro,
    fevereiro com fevereiro etc., o que remove o ciclo sazonal do teste.
 4. Dependência serial: correção de covariância entre estações de Hirsch & Slack (1984).
    Postura conservadora: a variância usada nunca é menor que a variância sob
    independência (a correção só pode deixar o teste mais exigente).
 5. Inclinação de Sen sazonal (mediana das inclinações intra-mês), convertida para
    unidade/década, com IC 95% não paramétrico usando a variância corrigida.
 6. Carimbo (RN01/RN02) e narrativa por template; todo número da narrativa é
    conferido contra o JSON (RN04).

Referências:
 - Hirsch, R. M., Slack, J. R., Smith, R. A. (1982). Water Resources Research 18(1).
 - Hirsch, R. M., Slack, J. R. (1984). Water Resources Research 20(6).
 - Sen, P. K. (1968). JASA 63(324).
"""
from __future__ import annotations

import math
import re
from typing import Any

import numpy as np

ALPHA = 0.05
Z_975 = 1.959963984540054
MIN_YEARS = 15.0
MAX_MISSING_PCT = 20.0
MIN_VALID_MONTHS = 144


# --------------------------------------------------------------------------- utilidades

def _norm_sf_two_sided(z: float) -> float:
    """p-valor bilateral da normal padrão, sem SciPy."""
    return math.erfc(abs(z) / math.sqrt(2.0))


def _tie_term(values: np.ndarray) -> float:
    _, counts = np.unique(values, return_counts=True)
    t = counts[counts > 1].astype(float)
    return float(np.sum(t * (t - 1) * (2 * t + 5)))


def _sign_matrix(col: np.ndarray) -> np.ndarray:
    """D[i, j] = sgn(x_j - x_i) para i < j; 0 quando faltar valor ou fora do triângulo."""
    diff = col[None, :] - col[:, None]
    d = np.sign(diff)
    d[np.isnan(d)] = 0.0
    return np.triu(d, k=1)


def lag1_autocorrelation(series: np.ndarray) -> float | None:
    """Autocorrelação lag-1 das anomalias (diagnóstico exibido no laudo)."""
    x = np.asarray(series, dtype=float)
    pairs = ~np.isnan(x[:-1]) & ~np.isnan(x[1:])
    if pairs.sum() < 24:
        return None
    mu = np.nanmean(x)
    a = x[:-1][pairs] - mu
    b = x[1:][pairs] - mu
    den = float(np.nansum((x[~np.isnan(x)] - mu) ** 2))
    if den == 0:
        return 0.0
    n_valid = int((~np.isnan(x)).sum())
    return float(np.sum(a * b) / den * n_valid / pairs.sum())


def seasonal_mann_kendall(matrix: np.ndarray) -> dict[str, float]:
    """
    matrix: (anos × 12), NaN onde faltar.
    Retorna S, variância sob independência, variância Hirsch-Slack e a usada.
    """
    n_years, n_seasons = matrix.shape
    signs = [_sign_matrix(matrix[:, g]) for g in range(n_seasons)]

    s_total = 0.0
    var_indep = 0.0
    n_pairs = 0
    n_valid_season = []
    ranks = []
    for g in range(n_seasons):
        col = matrix[:, g]
        valid = col[~np.isnan(col)]
        n_g = len(valid)
        n_valid_season.append(n_g)
        s_total += float(signs[g].sum())
        if n_g >= 2:
            var_indep += (n_g * (n_g - 1) * (2 * n_g + 5) - _tie_term(valid)) / 18.0
            n_pairs += n_g * (n_g - 1) // 2
        # Postos de Hirsch-Slack: R_ig = (n_g + 1 + Σ_j sgn(x_ig - x_jg)) / 2 ; ausente -> (n_g+1)/2
        full = signs[g] - signs[g].T          # full[i, j] = sgn(x_j - x_i) para todo i≠j
        r = (n_g + 1 - full.sum(axis=1)) / 2.0  # Σ_j sgn(x_i - x_j) = -Σ_j full[i, j]
        r[np.isnan(col)] = (n_g + 1) / 2.0
        ranks.append(r)

    cov_sum = 0.0
    for g in range(n_seasons):
        for h in range(n_seasons):
            if g == h:
                continue
            k_gh = float(np.sum(signs[g] * signs[h]))
            cov = (k_gh + 4.0 * float(np.dot(ranks[g], ranks[h]))
                   - n_years * (n_valid_season[g] + 1) * (n_valid_season[h] + 1)) / 3.0
            cov_sum += cov

    var_hs = var_indep + cov_sum
    var_used = max(var_indep, var_hs)
    return {
        "s": s_total,
        "var_indep": var_indep,
        "var_hs": var_hs,
        "var_used": var_used,
        "n_pairs": float(n_pairs),
    }


def seasonal_sen_slopes(matrix: np.ndarray, years: np.ndarray) -> np.ndarray:
    """Inclinações (unidade/ano) apenas entre observações do mesmo mês do calendário."""
    out: list[np.ndarray] = []
    for g in range(matrix.shape[1]):
        col = matrix[:, g]
        ok = ~np.isnan(col)
        v, t = col[ok], years[ok].astype(float)
        if len(v) < 2:
            continue
        i, j = np.triu_indices(len(v), k=1)
        out.append((v[j] - v[i]) / (t[j] - t[i]))
    return np.concatenate(out) if out else np.array([], dtype=float)


def sen_ci(slopes: np.ndarray, var_s: float) -> tuple[float, float, float]:
    """Mediana e IC 95% não paramétrico (Gilbert, 1987) usando a variância de S."""
    s = np.sort(slopes)
    n = len(s)
    med = float(np.median(s))
    c = Z_975 * math.sqrt(max(var_s, 0.0))
    m1 = int(math.floor((n - c) / 2.0))        # posto (1-based) do limite inferior
    m2 = int(math.ceil((n + c) / 2.0)) + 1     # posto (1-based) do limite superior
    lo = float(s[min(max(m1, 1), n) - 1])
    hi = float(s[min(max(m2, 1), n) - 1])
    return med, lo, hi


def benjamini_hochberg(p_values: list[float | None]) -> list[float | None]:
    """q-valores de Benjamini-Hochberg (FDR) para várias pistas/cenas analisadas juntas."""
    idx = [i for i, p in enumerate(p_values) if p is not None]
    m = len(idx)
    q: list[float | None] = [None] * len(p_values)
    if m == 0:
        return q
    order = sorted(idx, key=lambda i: p_values[i])
    running = 1.0
    for rank in range(m, 0, -1):
        i = order[rank - 1]
        running = min(running, p_values[i] * m / rank)
        q[i] = round(min(running, 1.0), 6)
    return q


# --------------------------------------------------------------------------- pipeline

def _fmt_signed(x: float) -> str:
    return f"{x:+.3f}"


def analyze_monthly_series(
    records: list[dict[str, Any]],
    unit: str,
    lang: str = "pt",
) -> dict[str, Any]:
    """records: [{"date": "YYYY-MM", "year": int, "month": int, "value": float | None}]"""
    records = sorted(records, key=lambda r: (r["year"], r["month"]))
    if not records:
        raise ValueError("Série vazia: a fonte não retornou meses para o período pedido.")

    years_all = sorted({int(r["year"]) for r in records})
    y0 = years_all[0]
    years = np.arange(y0, years_all[-1] + 1)
    matrix = np.full((len(years), 12), np.nan)
    for r in records:
        v = r["value"]
        if v is not None and not (isinstance(v, float) and math.isnan(v)):
            matrix[int(r["year"]) - y0, int(r["month"]) - 1] = float(v)

    n_total = len(records)
    n_valid = int((~np.isnan(matrix)).sum())
    missing_pct = round((n_total - n_valid) / n_total * 100.0, 2)
    span_years = round(n_total / 12.0, 1)

    counts = (~np.isnan(matrix)).sum(axis=0)
    sums = np.nansum(matrix, axis=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        climatology = np.where(counts >= 3, sums / np.maximum(counts, 1), np.nan)
    anom_matrix = matrix - climatology[None, :]

    start_date, end_date = records[0]["date"], records[-1]["date"]
    period = {
        "start_date": start_date,
        "end_date": end_date,
        "frequency": "monthly",
        "baseline_climatology": f"{start_date[:4]}–{end_date[:4]}",
    }
    quality = {
        "n_total": n_total,
        "n_valid": n_valid,
        "percent_ausente": missing_pct,
        "span_years": span_years,
        "passes_quality_gate": True,
        "alert": None,
    }

    def _series(trend: dict[str, float] | None) -> list[dict[str, Any]]:
        out = []
        for r in records:
            yi, mi = int(r["year"]) - y0, int(r["month"]) - 1
            val = matrix[yi, mi]
            an = anom_matrix[yi, mi]
            point = {
                "date": r["date"], "year": r["year"], "month": r["month"],
                "value": None if np.isnan(val) else round(float(val), 4),
                "anomaly": None if np.isnan(an) else round(float(an), 4),
                "trend_line": None, "ci_low_line": None, "ci_high_line": None,
            }
            if trend:
                dt = (yi + mi / 12.0) - trend["t_mid"]
                point["trend_line"] = round(trend["mid"] + trend["slope"] * dt, 4)
                point["ci_low_line"] = round(trend["mid"] + trend["lo"] * dt, 4)
                point["ci_high_line"] = round(trend["mid"] + trend["hi"] * dt, 4)
            out.append(point)
        return out

    # ---------------- RN03
    if span_years < MIN_YEARS or missing_pct > MAX_MISSING_PCT or n_valid < MIN_VALID_MONTHS:
        msg_pt = (
            f"Série com {span_years} anos e {missing_pct}% de meses ausentes. A política do "
            f"Earth Sleuths exige pelo menos 15 anos, no máximo 20% de lacunas e 144 meses "
            f"válidos para emitir selo de tendência. Resultado apenas exploratório."
        )
        msg_en = (
            f"Series spans {span_years} years with {missing_pct}% missing months. Earth Sleuths "
            f"requires at least 15 years, at most 20% gaps and 144 valid months before issuing "
            f"a trend stamp. Exploratory view only."
        )
        quality["passes_quality_gate"] = False
        quality["alert"] = msg_pt if lang == "pt" else msg_en
        return {
            "status": "DADOS_INSUFICIENTES",
            "quality": quality,
            "period": period,
            "statistics": {
                "methodology": "Não executado (RN03)",
                "seasonal_adjustment": "Anomalias em relação à climatologia mensal",
                "autocorrelation_method": "Não aplicado",
                "autocorrelation_lag1": None,
                "variance_inflation": None,
                "slope_per_decade": None, "ci95_low": None, "ci95_high": None,
                "p_value": None, "tau": None, "z": None,
                "direction": "insufficient",
                "robustness_note": "",
            },
            "narrative": quality["alert"],
            "series": _series(None),
        }

    # ---------------- Seasonal MK + Hirsch-Slack
    mk = seasonal_mann_kendall(matrix)
    s, var_used = mk["s"], mk["var_used"]
    if var_used > 0 and s != 0:
        z = (s - math.copysign(1.0, s)) / math.sqrt(var_used)
    else:
        z = 0.0
    p_value = _norm_sf_two_sided(z) if var_used > 0 else 1.0
    tau = s / mk["n_pairs"] if mk["n_pairs"] else 0.0
    inflation = mk["var_used"] / mk["var_indep"] if mk["var_indep"] else 1.0
    corrected = inflation > 1.0 + 1e-9

    # ---------------- Sen sazonal + IC 95%
    slopes = seasonal_sen_slopes(matrix, years)
    slope_y, lo_y, hi_y = sen_ci(slopes, var_used)
    slope_dec, lo_dec, hi_dec = round(slope_y * 10, 4), round(lo_y * 10, 4), round(hi_y * 10, 4)

    ci_crosses_zero = lo_dec <= 0.0 <= hi_dec
    status = "TENDENCIA_REAL" if (p_value < ALPHA and not ci_crosses_zero) else "PODE_SER_RUIDO"
    direction = "increasing" if slope_dec > 0 else ("decreasing" if slope_dec < 0 else "flat")

    rho1 = lag1_autocorrelation(anom_matrix.reshape(-1)[: n_total])

    # ---------------- Robustez: últimos 20 anos (se a série tiver ≥ 25 anos)
    robustness_note = ""
    if span_years >= 25:
        cut = len(years) - 20
        sub = seasonal_sen_slopes(matrix[cut:], years[cut:])
        if len(sub):
            sub_dec = float(np.median(sub)) * 10
            same = (sub_dec * slope_dec) > 0
            y_a, y_b = int(years[cut]), int(years[-1])
            if lang == "pt":
                robustness_note = (
                    f"Teste de robustez ({y_a}–{y_b}): {sub_dec:+.3f} {unit}/década, "
                    f"{'mesmo sinal' if same else 'sinal diferente'} da série completa."
                )
            else:
                robustness_note = (
                    f"Robustness check ({y_a}–{y_b}): {sub_dec:+.3f} {unit}/decade, "
                    f"{'same sign' if same else 'different sign'} than the full series."
                )

    # ---------------- Reta para o gráfico (sobre as anomalias)
    anom_valid = anom_matrix[~np.isnan(anom_matrix)]
    trend = {
        "t_mid": (len(years) - 1) / 2.0 + 5.5 / 12.0,
        "mid": float(np.median(anom_valid)) if len(anom_valid) else 0.0,
        "slope": slope_y, "lo": lo_y, "hi": hi_y,
    }

    p_round = round(p_value, 6)
    p_txt = "p < 0.0001" if p_round < 0.0001 else f"p = {p_round:.4f}"
    rate = f"{_fmt_signed(slope_dec)} {unit}"
    ci = f"[{_fmt_signed(lo_dec)}; {_fmt_signed(hi_dec)}]"
    if lang == "pt":
        if status == "TENDENCIA_REAL":
            narrative = (
                f"Os dados sustentam uma tendência monotônica de {rate} por década "
                f"(IC 95%: {ci}; {p_txt}) no período analisado. Se não houvesse tendência, "
                f"um resultado tão extremo quanto este seria improvável ({p_txt}). "
                f"Isso descreve a série; não identifica a causa."
            )
        else:
            narrative = (
                f"A taxa estimada é de {rate} por década (IC 95%: {ci}; {p_txt}). Não há "
                f"evidência estatística suficiente para afirmar uma tendência no período — "
                f"o que não prova que a mudança não exista."
            )
    else:
        if status == "TENDENCIA_REAL":
            narrative = (
                f"The data support a monotonic trend of {rate} per decade "
                f"(95% CI: {ci}; {p_txt}) over the period. With no trend, a result this "
                f"extreme would be unlikely ({p_txt}). This describes the series, not its cause."
            )
        else:
            narrative = (
                f"The estimated rate is {rate} per decade (95% CI: {ci}; {p_txt}). There is "
                f"not enough statistical evidence for a trend in this period — which does not "
                f"prove that no change exists."
            )

    stats_out = {
        "methodology": "Seasonal Mann-Kendall + Sen sazonal",
        "seasonal_adjustment": "Pareamento intra-mês (MK/Sen) e anomalias da climatologia mensal",
        "autocorrelation_method": (
            "Hirsch & Slack (1984): covariância entre meses incorporada"
            if corrected else
            "Hirsch & Slack (1984) avaliado: sem inflação de variância necessária"
        ),
        "autocorrelation_lag1": None if rho1 is None else round(rho1, 3),
        "variance_inflation": round(inflation, 3),
        "slope_per_decade": slope_dec,
        "ci95_low": lo_dec,
        "ci95_high": hi_dec,
        "p_value": p_round,
        "tau": round(tau, 4),
        "z": round(z, 4),
        "direction": direction,
        "robustness_note": robustness_note,
        "unit": unit,
    }
    payload = {
        "status": status,
        "quality": quality,
        "period": period,
        "statistics": stats_out,
        "narrative": narrative,
        "series": _series(trend),
    }
    validate_narrative_numbers(payload)
    return payload


def validate_narrative_numbers(payload: dict[str, Any]) -> None:
    """
    RN04: todo número escrito na narrativa precisa existir no JSON calculado.
    Se aparecer qualquer número fora da lista, a resposta é bloqueada.
    """
    st = payload["statistics"]
    allowed = {
        "95",
        "0.0001",
        _fmt_signed(st["slope_per_decade"]),
        _fmt_signed(st["ci95_low"]),
        _fmt_signed(st["ci95_high"]),
        f"{st['p_value']:.4f}",
    }
    text = payload["narrative"]
    if st.get("unit"):
        text = text.replace(st["unit"], " ")  # unidades como "W/m^2" contêm dígitos
    for tok in re.findall(r"[+-]?\d+(?:\.\d+)?", text):
        if tok not in allowed:
            raise ValueError(f"RN04: número sem lastro na narrativa: '{tok}'")

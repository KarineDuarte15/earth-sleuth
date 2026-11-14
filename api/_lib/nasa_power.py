"""
Cliente da API mensal NASA POWER (point) + cache local.

Documentação: https://power.larc.nasa.gov/docs/services/api/temporal/monthly/
 - GET https://power.larc.nasa.gov/api/temporal/monthly/point
 - start/end no formato YYYY (no endpoint mensal não se usa YYYYMM)
 - até 20 parâmetros por requisição de ponto -> várias pistas numa única chamada
 - chaves YYYYMM com mês 01–12; o mês "13" é a média anual e é descartado aqui
 - valor ausente = fill_value do header (normalmente -999)

Modos:
 - "live":  só API ao vivo
 - "cache": só o arquivo api/_lib/data/demo_cases.json (resposta < 1 s)
 - "auto":  API ao vivo e, se falhar (timeout, erro), cai no cache (RNF03)
"""
from __future__ import annotations

import json
import pathlib
from datetime import datetime, timezone
from typing import Any

import httpx

from .catalog import CLUE_CATALOG

NASA_POWER_MONTHLY_URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"
CACHE_FILE = pathlib.Path(__file__).parent / "data" / "demo_cases.json"
LIVE_TIMEOUT_S = 7.5
LAST_COMPLETE_YEAR = 2025  # MERRA-2 no POWER vai até o ano anterior completo

UNIT_LABELS = {"C": "°C", "mm/day": "mm/dia", "1": "fração 0–1"}


def pretty_unit(raw: str | None, fallback: str) -> str:
    if not raw:
        return fallback
    return UNIT_LABELS.get(raw, raw)


def parse_power_json(payload: dict[str, Any], parameter_id: str) -> list[dict[str, Any]]:
    """Converte properties.parameter.<ID> em registros mensais ordenados."""
    fill = float(payload.get("header", {}).get("fill_value", -999.0))
    raw = payload["properties"]["parameter"][parameter_id]
    records = []
    for ym, val in sorted(raw.items()):
        if len(ym) != 6 or not ym.isdigit():
            continue
        yr, mo = int(ym[:4]), int(ym[4:])
        if not 1 <= mo <= 12:  # YYYY13 = média anual
            continue
        bad = val is None or float(val) == fill or float(val) <= -900.0
        records.append({
            "date": f"{yr:04d}-{mo:02d}", "year": yr, "month": mo,
            "value": None if bad else float(val),
        })
    return records


def param_meta(payload: dict[str, Any], parameter_id: str) -> dict[str, Any]:
    meta = (payload.get("parameters") or {}).get(parameter_id) or {}
    return {"units_raw": meta.get("units"), "longname": meta.get("longname")}


# --------------------------------------------------------------------------- cache

def load_cache() -> dict[str, Any]:
    if not CACHE_FILE.exists():
        return {"locations": {}}
    with CACHE_FILE.open("r", encoding="utf-8") as f:
        data = json.load(f)
    data.setdefault("locations", {})
    return data


def find_cached(parameter_id: str, lat: float, lon: float) -> dict[str, Any] | None:
    """Local em cache mais próximo (até ~0,35°) que tenha a pista pedida."""
    best, best_d = None, 1e9
    for loc in load_cache()["locations"].values():
        if parameter_id not in loc.get("parameters", {}):
            continue
        d = max(abs(loc["latitude"] - lat), abs(loc["longitude"] - lon))
        if d <= 0.35 and d < best_d:
            best, best_d = loc, d
    if best is None:
        return None
    p = best["parameters"][parameter_id]
    return {
        "records": p["records"],
        "units_raw": p.get("units_raw"),
        "longname": p.get("longname"),
        "request_url": p.get("request_url", "local://demo_cases.json"),
        "extracted_at": best.get("extracted_at"),
        "dataset_version": best.get("dataset_version", "NASA POWER (cache)"),
        "cached_location": best.get("region_name"),
    }


# --------------------------------------------------------------------------- live

async def _call_power(client: httpx.AsyncClient, params: list[str], community: str,
                      lat: float, lon: float, start: int, end: int) -> tuple[dict, str]:
    resp = await client.get(NASA_POWER_MONTHLY_URL, params={
        "parameters": ",".join(params),
        "community": community,
        "longitude": round(lon, 4),
        "latitude": round(lat, 4),
        "start": str(start),
        "end": str(end),
        "format": "JSON",
    })
    resp.raise_for_status()
    return resp.json(), str(resp.url)


async def _fetch_live(param_ids: list[str], lat: float, lon: float,
                      start_year: int, end_year: int) -> dict[str, dict[str, Any]]:
    """Agrupa pistas por (comunidade, ano inicial) para usar o mínimo de chamadas."""
    groups: dict[tuple[str, int], list[str]] = {}
    for pid in param_ids:
        spec = CLUE_CATALOG[pid]
        start = max(spec["min_year"], start_year)
        groups.setdefault((spec["communities"][0], start), []).append(pid)

    results: dict[str, dict[str, Any]] = {}
    errors: dict[str, str] = {}
    end = min(LAST_COMPLETE_YEAR, end_year)
    async with httpx.AsyncClient(timeout=LIVE_TIMEOUT_S) as client:
        for (community, start), pids in groups.items():
            try:
                payload, url = await _call_power(client, pids, community, lat, lon, start, end)
                todo = []
                for pid in pids:
                    if pid in payload.get("properties", {}).get("parameter", {}):
                        results[pid] = _pack_live(payload, pid, url)
                    else:
                        todo.append(pid)
            except httpx.HTTPStatusError:
                todo = list(pids)  # pode ser parâmetro inválido nessa comunidade
            except Exception as exc:  # timeout / rede: não adianta insistir
                for pid in pids:
                    errors[pid] = f"{type(exc).__name__}: {exc}"
                continue
            # tentativa individual nas outras comunidades
            for pid in todo:
                for comm in CLUE_CATALOG[pid]["communities"][1:]:
                    try:
                        payload, url = await _call_power(client, [pid], comm, lat, lon, start, end)
                        results[pid] = _pack_live(payload, pid, url)
                        break
                    except Exception as exc:
                        errors[pid] = f"{type(exc).__name__}: {exc}"
    for pid in param_ids:
        if pid not in results:
            results[pid] = {"error": errors.get(pid, "parâmetro não retornado pela API")}
    return results


def _pack_live(payload: dict[str, Any], pid: str, url: str) -> dict[str, Any]:
    meta = param_meta(payload, pid)
    return {
        "records": parse_power_json(payload, pid),
        **meta,
        "request_url": url,
        "extracted_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "dataset_version": str(payload.get("header", {}).get("api", {}).get("version", "NASA POWER API")),
    }


# --------------------------------------------------------------------------- público

async def fetch_scene(param_ids: list[str], lat: float, lon: float,
                      start_year: int, end_year: int, mode: str) -> dict[str, dict[str, Any]]:
    """Devolve {parameter_id: {records, units_raw, ..., data_mode, fallback_triggered}}."""
    out: dict[str, dict[str, Any]] = {}

    def from_cache(pid: str, reason: str | None) -> dict[str, Any]:
        c = find_cached(pid, lat, lon)
        if c is None:
            msg = (f"{pid}: sem dados em cache para este local"
                   + (f" e a API falhou ({reason})" if reason else "")
                   + ". Rode scripts/fetch_nasa_cases.py com internet ou use o modo ao vivo.")
            return {"error": msg}
        start = max(CLUE_CATALOG[pid]["min_year"], start_year)
        end = min(LAST_COMPLETE_YEAR, end_year)
        c["records"] = [r for r in c["records"] if start <= r["year"] <= end]
        c["data_mode"] = "cache" if reason is None else "fallback_cache"
        c["fallback_triggered"] = reason is not None
        c["fallback_reason"] = reason
        return c

    if mode == "cache":
        return {pid: from_cache(pid, None) for pid in param_ids}

    live = await _fetch_live(param_ids, lat, lon, start_year, end_year)
    for pid, res in live.items():
        if "error" not in res:
            res["data_mode"] = "live"
            res["fallback_triggered"] = False
            out[pid] = res
        elif mode == "auto":
            out[pid] = from_cache(pid, res["error"])
        else:
            out[pid] = {"error": f"{pid}: NASA POWER indisponível ({res['error']})"}
    return out

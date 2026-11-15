"""
API do Earth Sleuths (FastAPI). Na Vercel este arquivo é a única função Python;
os módulos ficam em api/_lib (pastas com "_" não viram funções).

Local:  python -m uvicorn api.index:app --reload --port 8000
"""
from __future__ import annotations

import asyncio
import pathlib
import sys
import uuid
from typing import Literal

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from _lib import interpret as llm  # noqa: E402
from _lib import meteomatics  # noqa: E402
from _lib.catalog import CLUE_CATALOG  # noqa: E402
from _lib.nasa_power import fetch_scene, pretty_unit  # noqa: E402
from _lib.stats_engine import analyze_monthly_series, benjamini_hochberg  # noqa: E402

APP_VERSION = "1.1.0"
CREDITS = ("These data were obtained from the NASA Langley Research Center (LaRC) POWER Project "
           "funded through the NASA Earth Science/Applied Science Program.")

app = FastAPI(title="Earth Sleuths Statistical Engine", version=APP_VERSION)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Scene(BaseModel):
    region_name: str = Field(..., min_length=1, max_length=120)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)


class AnalyzeRequest(BaseModel):
    question: str = Field(default="Investigação climática local", max_length=400)
    parameter_ids: list[str] = Field(..., min_length=1, max_length=7)
    start_year: int = Field(default=1981, ge=1981, le=2025)
    end_year: int = Field(default=2025, ge=1981, le=2025)
    mode: Literal["auto", "cache", "live"] = "auto"
    lang: Literal["pt", "en"] = "pt"
    scene_a: Scene
    scene_b: Scene | None = None


def _scene_result(scene: Scene, pid: str, fetched: dict, lang: str) -> dict:
    spec = CLUE_CATALOG[pid]
    unit = pretty_unit(fetched.get("units_raw"), spec["unit_fallback"])
    analysis = analyze_monthly_series(fetched["records"], unit=unit, lang=lang)
    return {
        "geography": {
            "region_name": scene.region_name,
            "latitude": scene.latitude,
            "longitude": scene.longitude,
            "spatial_resolution": spec["spatial_resolution"],
            "lat_step": spec["lat_step"],
            "lon_step": spec["lon_step"],
        },
        "provenance": {
            "dataset_id": pid,
            "longname": fetched.get("longname"),
            "units_raw": fetched.get("units_raw"),
            "source_mission": spec["source_mission"],
            "data_type": spec["data_type_pt"] if lang == "pt" else spec["data_type_en"],
            "dataset_version": fetched.get("dataset_version"),
            "request_url": fetched.get("request_url"),
            "extracted_at": fetched.get("extracted_at"),
            "data_mode": fetched.get("data_mode"),
            "fallback_triggered": fetched.get("fallback_triggered", False),
            "fallback_reason": fetched.get("fallback_reason"),
            "cached_location": fetched.get("cached_location"),
            "app_version": APP_VERSION,
            "credits": CREDITS,
        },
        "unit": unit,
        **analysis,
    }


class NasaSummary(BaseModel):
    status: str
    slope_per_decade: float
    ci95_low: float
    ci95_high: float


class CrossCheckRequest(BaseModel):
    parameter_id: str
    scene: Scene
    start_year: int = Field(..., ge=1981, le=2025)
    end_year: int = Field(..., ge=1981, le=2025)
    lang: Literal["pt", "en"] = "pt"
    nasa: NasaSummary


class InterpretRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=400)


@app.post("/api/interpret")
async def interpret_question(req: InterpretRequest):
    """Ficha da investigação a partir da pergunta livre (LLM). {"fallback": true} = usar as palavras-chave."""
    return await llm.interpret(req.question)


@app.post("/api/cross-check")
async def cross_check(req: CrossCheckRequest):
    """Compara a tendência da NASA com a da Meteomatics (ERA5). Falha da 2ª fonte nunca vira erro HTTP."""
    pid = req.parameter_id
    if pid not in CLUE_CATALOG:
        raise HTTPException(400, f"Pista fora do catálogo: {pid}")
    if pid not in meteomatics.PARAMS:
        return {"available": False, "reason": "Esta pista não tem validação cruzada (sem equivalente utilizável na Meteomatics)."
                if req.lang == "pt" else "No cross-check for this clue (no usable equivalent in Meteomatics)."}
    _, unit, sign_only = meteomatics.PARAMS[pid]
    try:
        records = await meteomatics.fetch_monthly(pid, req.scene.latitude, req.scene.longitude,
                                                  req.start_year, req.end_year)
        other = analyze_monthly_series(records, unit=unit, lang=req.lang)
    except (RuntimeError, ValueError) as exc:
        return {"available": False, "reason": str(exc)}
    if other["status"] == "DADOS_INSUFICIENTES":
        return {"available": False, "reason": other["narrative"]}

    st = other["statistics"]
    sig = [req.nasa.status == "TENDENCIA_REAL", other["status"] == "TENDENCIA_REAL"]
    both_sig = all(sig)
    verdict = meteomatics.agreement(req.nasa.model_dump(), st, sign_only, any(sig))
    return {
        "available": True,
        "source": "Meteomatics / ECMWF ERA5",
        "credits": meteomatics.CREDITS,
        "status": other["status"],
        "unit": unit,
        "slope_per_decade": st["slope_per_decade"],
        "ci95_low": st["ci95_low"],
        "ci95_high": st["ci95_high"],
        "p_value": st["p_value"],
        "sign_only": sign_only,
        "verdict": verdict,
        "both_significant": both_sig,
        "summary": meteomatics.verdict_text(verdict, both_sig, req.lang),
    }


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": APP_VERSION,
            "engine": "Seasonal Mann-Kendall + Hirsch-Slack + Sen sazonal"}


@app.get("/api/catalog")
async def catalog():
    return {"clues": list(CLUE_CATALOG.values())}


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    unknown = [p for p in req.parameter_ids if p not in CLUE_CATALOG]
    if unknown:
        raise HTTPException(400, f"Pista fora do catálogo: {', '.join(unknown)}")
    if req.end_year < req.start_year:
        raise HTTPException(400, "O ano final precisa ser maior ou igual ao inicial.")
    pids = list(dict.fromkeys(req.parameter_ids))

    scenes = [req.scene_a] + ([req.scene_b] if req.scene_b else [])
    fetched_all = await asyncio.gather(*[
        fetch_scene(pids, s.latitude, s.longitude, req.start_year, req.end_year, req.mode)
        for s in scenes
    ])

    runs = []
    for pid in pids:
        spec = CLUE_CATALOG[pid]
        run: dict = {
            "variable": {
                "parameter_id": pid,
                "label_pt": spec["label_pt"], "label_en": spec["label_en"],
                "simple_def_pt": spec["simple_def_pt"], "simple_def_en": spec["simple_def_en"],
                "source_mission": spec["source_mission"],
                "sdg_targets": spec["sdg_targets"],
            },
            "scene_a": None, "scene_b": None, "comparison": None, "errors": [],
        }
        for key, scene, fetched in zip(("scene_a", "scene_b"), scenes, fetched_all):
            f = fetched[pid]
            if "error" in f:
                run["errors"].append(f"{scene.region_name}: {f['error']}")
                continue
            try:
                run[key] = _scene_result(scene, pid, f, req.lang)
            except ValueError as exc:
                run["errors"].append(f"{scene.region_name}: {exc}")
        a, b = run["scene_a"], run["scene_b"]
        if a and b:
            da, db = a["statistics"]["direction"], b["statistics"]["direction"]
            sig_a, sig_b = a["status"] == "TENDENCIA_REAL", b["status"] == "TENDENCIA_REAL"
            opposite = {da, db} == {"increasing", "decreasing"}
            same_period = a["period"]["start_date"] == b["period"]["start_date"] and \
                a["period"]["end_date"] == b["period"]["end_date"]
            if opposite and sig_a and sig_b:
                pt = "Sinais opostos, e os dois são estatisticamente significativos."
                en = "Opposite signs, and both are statistically significant."
            elif opposite:
                pt = ("As estimativas têm sinais opostos, mas ao menos uma não é significativa: "
                      "não dá para afirmar tendências opostas.")
                en = ("Estimates have opposite signs, but at least one is not significant: "
                      "opposite trends cannot be claimed.")
            else:
                pt = "As duas regiões não apresentam sinais opostos para esta pista e período."
                en = "The two regions do not show opposite signs for this clue and period."
            run["comparison"] = {
                "same_variable_and_period": same_period,
                "opposite_directions": opposite,
                "both_significant": sig_a and sig_b,
                "confirmed_opposite_trends": opposite and sig_a and sig_b,
                "summary_pt": pt, "summary_en": en,
            }
        runs.append(run)

    # FDR (Benjamini-Hochberg) quando há várias pistas/cenas testadas juntas
    tests = [(r, k) for r in runs for k in ("scene_a", "scene_b") if r[k]]
    q = benjamini_hochberg([r[k]["statistics"]["p_value"] for r, k in tests])
    for (r, k), qv in zip(tests, q):
        r[k]["statistics"]["q_value_fdr"] = qv if len(tests) > 1 else None

    return {
        "case_id": uuid.uuid4().hex[:8],
        "question": req.question,
        "request": req.model_dump(),
        "n_tests": len(tests),
        "runs": runs,
    }

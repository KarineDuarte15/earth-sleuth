"""Endpoint /api/interpret com a Groq e a geocodificação simuladas (sem gastar cota)."""
import pathlib
import sys

from fastapi.testclient import TestClient

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

import index  # noqa: E402
from _lib import interpret  # noqa: E402


def _fake(monkeypatch, ficha):
    async def call(client, key, question):
        return ficha

    async def geo(client, place):
        return None if place == "Lugar Nenhum" else {"region_name": place.split(",")[0], "latitude": 1.0, "longitude": 2.0}

    monkeypatch.setenv("GROQ_API_KEY", "x")
    monkeypatch.setattr(interpret, "_call_groq", call)
    monkeypatch.setattr(interpret, "_geocode", geo)
    return TestClient(index.app)


def post(c, q="a chuva em Belém diminuiu?"):
    return c.post("/api/interpret", json={"question": q}).json()


def test_valid_ficha_passes_through(monkeypatch):
    c = _fake(monkeypatch, {"supported": True, "parameter_ids": ["PRECTOTCORR"], "places": ["Belém, Pará, Brasil"],
                            "two_scenes": False, "start_year": 1995, "end_year": 2025, "needs": ""})
    r = post(c)
    assert r["fallback"] is False and r["supported"] and r["parameter_ids"] == ["PRECTOTCORR"]
    assert r["places"][0]["region_name"] == "Belém" and (r["start_year"], r["end_year"]) == (1995, 2025)


def test_model_output_is_sanitised(monkeypatch):
    c = _fake(monkeypatch, {"supported": True, "parameter_ids": ["T2M", "INVENTADO"], "places": ["Lugar Nenhum", "A, B"],
                            "two_scenes": True, "start_year": 1970, "end_year": 2030, "needs": "Nenhum"})
    r = post(c)
    assert r["parameter_ids"] == ["T2M"]                     # ID fora do catálogo descartado
    assert (r["start_year"], r["end_year"]) == (1981, 2025)  # período inválido -> padrão
    assert r["needs"] == "" and len(r["places"]) == 1        # "Nenhum" some; lugar não achado é omitido


def test_unsupported_clears_clues(monkeypatch):
    c = _fake(monkeypatch, {"supported": False, "parameter_ids": ["T2M"], "places": [], "two_scenes": True,
                            "start_year": 1981, "end_year": 2025, "needs": "Previsão do tempo não é tendência."})
    r = post(c)
    assert r["supported"] is False and r["parameter_ids"] == [] and r["two_scenes"] is False and r["needs"]


def test_fallback_without_key_or_on_failure(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(interpret, "load_local_env", lambda: None)
    assert post(TestClient(index.app))["fallback"] is True

    async def boom(client, key, question):
        raise RuntimeError("429")
    monkeypatch.setenv("GROQ_API_KEY", "x")
    monkeypatch.setattr(interpret, "_call_groq", boom)
    assert post(TestClient(index.app))["fallback"] is True


def test_gemini_takes_over_when_groq_fails(monkeypatch):
    ficha = {"supported": True, "parameter_ids": ["T2M"], "places": [], "two_scenes": False,
             "start_year": 1981, "end_year": 2025, "needs": ""}

    async def groq(client, key, question):
        raise RuntimeError("429")

    async def gemini(client, key, question):
        return ficha

    monkeypatch.setattr(interpret, "load_local_env", lambda: None)
    monkeypatch.setenv("GROQ_API_KEY", "x")
    monkeypatch.setenv("GEMINI_API_KEY", "y")
    monkeypatch.setattr(interpret, "_call_groq", groq)
    monkeypatch.setattr(interpret, "_call_gemini", gemini)
    r = post(TestClient(index.app))
    assert r["fallback"] is False and r["provider"] == "gemini" and r["parameter_ids"] == ["T2M"]

    async def gemini_boom(client, key, question):
        raise RuntimeError("503")
    monkeypatch.setattr(interpret, "_call_gemini", gemini_boom)
    r = post(TestClient(index.app))
    assert r["fallback"] is True and "groq" in r["reason"] and "gemini" in r["reason"]

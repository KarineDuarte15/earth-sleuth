"""Teste ponta a ponta da API em modo cache, com cache SINTÉTICO temporário."""
import json
import pathlib
import sys

import pytest
from fastapi.testclient import TestClient

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "tests"))

import index  # noqa: E402
from _lib import nasa_power  # noqa: E402
from test_stats_engine import make_records, synthetic  # noqa: E402


@pytest.fixture()
def client(tmp_path, monkeypatch):
    cache = {"locations": {
        "a": {"region_name": "A", "latitude": -5.2, "longitude": -39.3, "parameters": {
            "T2M_MIN": {"units_raw": "C", "records": make_records(synthetic(trend_per_decade=0.3))},
            "PRECTOTCORR": {"units_raw": "mm/day", "records": make_records(synthetic(trend_per_decade=-0.4, seed=5))},
        }},
        "b": {"region_name": "B", "latitude": -31.8, "longitude": -52.3, "parameters": {
            "PRECTOTCORR": {"units_raw": "mm/day", "records": make_records(synthetic(trend_per_decade=0.4, seed=9))},
        }},
    }}
    f = tmp_path / "cache.json"
    f.write_text(json.dumps(cache))
    monkeypatch.setattr(nasa_power, "CACHE_FILE", f)
    return TestClient(index.app)


def test_two_scenes_cache(client):
    r = client.post("/api/analyze", json={
        "parameter_ids": ["PRECTOTCORR", "T2M_MIN"], "mode": "cache", "end_year": 2024,
        "scene_a": {"region_name": "A", "latitude": -5.198, "longitude": -39.295},
        "scene_b": {"region_name": "B", "latitude": -31.765, "longitude": -52.337},
    })
    assert r.status_code == 200, r.text
    body = r.json()
    prec = body["runs"][0]
    assert prec["scene_a"]["unit"] == "mm/dia"
    assert prec["comparison"]["confirmed_opposite_trends"] is True
    tmin = body["runs"][1]
    assert tmin["scene_a"]["status"] == "TENDENCIA_REAL"
    assert tmin["scene_b"] is None and tmin["errors"]  # B não tem T2M_MIN no cache
    assert prec["scene_a"]["statistics"]["q_value_fdr"] is not None


def test_rejects_unknown_clue(client):
    r = client.post("/api/analyze", json={
        "parameter_ids": ["INVENTADO"], "mode": "cache",
        "scene_a": {"region_name": "A", "latitude": 0, "longitude": 0}})
    assert r.status_code == 400

"""Validação cruzada: agregação diária->mensal, veredito de concordância e endpoint (rede simulada)."""
import pathlib
import sys

from fastapi.testclient import TestClient

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "tests"))

import index  # noqa: E402
from _lib import meteomatics  # noqa: E402
from test_stats_engine import make_records, synthetic  # noqa: E402


def test_daily_to_monthly_shifts_right_bounded_days():
    # 00 UTC de 01/fev cobre 31/jan: o dia pertence a janeiro
    days = [{"date": f"2020-01-{d:02d}T00:00:00Z", "value": 1.0} for d in range(2, 32)]
    days.append({"date": "2020-02-01T00:00:00Z", "value": 32.0})
    days.append({"date": "2020-02-10T00:00:00Z", "value": -666})  # sem dado: ignorado
    out = meteomatics.daily_to_monthly(days)
    assert [r["date"] for r in out] == ["2020-01"]
    assert out[0]["value"] == 2.0  # (30 × 1 + 32) / 31: o 32.0 entrou em janeiro


def test_agreement():
    a = {"slope_per_decade": 0.3, "ci95_low": 0.2, "ci95_high": 0.4}
    assert meteomatics.agreement(a, {"slope_per_decade": 0.35, "ci95_low": 0.25, "ci95_high": 0.45}, False) == "agree"
    assert meteomatics.agreement(a, {"slope_per_decade": 0.9, "ci95_low": 0.8, "ci95_high": 1.0}, False) == "magnitude"
    assert meteomatics.agreement(a, {"slope_per_decade": 0.9, "ci95_low": 0.8, "ci95_high": 1.0}, True) == "sign_only"
    assert meteomatics.agreement(a, {"slope_per_decade": -0.3, "ci95_low": -0.4, "ci95_high": -0.2}, True) == "diverge"
    assert meteomatics.agreement(a, {"slope_per_decade": -0.3, "ci95_low": -0.4, "ci95_high": -0.2}, True, False) == "both_noise"


def test_cross_check_endpoint(monkeypatch):
    async def fake_fetch(pid, lat, lon, y0, y1):
        return make_records(synthetic(trend_per_decade=0.3, seed=2))
    monkeypatch.setattr(meteomatics, "fetch_monthly", fake_fetch)
    c = TestClient(index.app)
    body = {"parameter_id": "T2M", "start_year": 1981, "end_year": 2024,
            "scene": {"region_name": "A", "latitude": -5.2, "longitude": -39.3},
            "nasa": {"status": "TENDENCIA_REAL", "slope_per_decade": 0.3, "ci95_low": 0.2, "ci95_high": 0.4}}
    r = c.post("/api/cross-check", json=body).json()
    assert r["available"] and r["verdict"] in {"agree", "magnitude"} and r["both_significant"]

    r = c.post("/api/cross-check", json={**body, "parameter_id": "IMERG_PRECTOT"}).json()
    assert r["available"] is False  # sem equivalente

"""
Testes do motor estatístico com séries SINTÉTICAS (validam o código, não o clima).
Rodar:  python -m pytest -q
"""
import pathlib
import sys

import numpy as np
import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from _lib.nasa_power import parse_power_json  # noqa: E402
from _lib.stats_engine import (  # noqa: E402
    analyze_monthly_series, benjamini_hochberg, seasonal_mann_kendall, validate_narrative_numbers,
)


def make_records(values, y0=1981):
    out = []
    for i, v in enumerate(values):
        y, m = y0 + i // 12, i % 12 + 1
        out.append({"date": f"{y}-{m:02d}", "year": y, "month": m,
                    "value": None if v is None or np.isnan(v) else float(v)})
    return out


def synthetic(n_years=44, trend_per_decade=0.0, phi=0.0, sigma=0.4, seed=0):
    rng = np.random.default_rng(seed)
    n = n_years * 12
    t = np.arange(n) / 12.0
    season = 2.0 * np.sin(2 * np.pi * np.arange(n) / 12)
    e = np.zeros(n)
    eps = rng.normal(0, sigma, n)
    for i in range(n):
        e[i] = (phi * e[i - 1] if i else 0.0) + eps[i]
    return 25 + season + trend_per_decade / 10 * t + e


def test_detects_real_trend_and_recovers_slope():
    res = analyze_monthly_series(make_records(synthetic(trend_per_decade=0.3)), unit="°C")
    st = res["statistics"]
    assert res["status"] == "TENDENCIA_REAL"
    assert st["direction"] == "increasing"
    assert st["ci95_low"] <= 0.3 <= st["ci95_high"]
    assert abs(st["slope_per_decade"] - 0.3) < 0.08


def test_negative_trend():
    res = analyze_monthly_series(make_records(synthetic(trend_per_decade=-0.5, seed=3)), unit="mm/dia")
    assert res["status"] == "TENDENCIA_REAL"
    assert res["statistics"]["direction"] == "decreasing"


@pytest.mark.parametrize("phi", [0.0, 0.6])
def test_false_positive_rate_is_controlled(phi):
    hits = 0
    n_sim = 150
    for seed in range(n_sim):
        res = analyze_monthly_series(make_records(synthetic(phi=phi, seed=seed)), unit="°C")
        hits += res["status"] == "TENDENCIA_REAL"
    rate = hits / n_sim
    # nominal 5%; com AR(1) forte o teste não pode explodir
    assert rate <= 0.10, f"taxa de falso positivo {rate:.2%} com phi={phi}"


def test_short_series_is_insufficient():
    res = analyze_monthly_series(make_records(synthetic(n_years=10)), unit="°C")
    assert res["status"] == "DADOS_INSUFICIENTES"
    assert res["statistics"]["slope_per_decade"] is None


def test_too_many_gaps_is_insufficient():
    v = synthetic()
    v[::4] = np.nan  # 25% ausente
    res = analyze_monthly_series(make_records(v), unit="°C")
    assert res["status"] == "DADOS_INSUFICIENTES"


def test_moderate_gaps_still_work():
    v = synthetic(trend_per_decade=0.4, seed=7)
    v[::10] = np.nan  # 10% ausente
    res = analyze_monthly_series(make_records(v), unit="°C")
    assert res["quality"]["passes_quality_gate"]
    assert res["status"] == "TENDENCIA_REAL"


def test_matches_pymannkendall_reference():
    pmk = pytest.importorskip("pymannkendall")
    v = synthetic(trend_per_decade=0.2, phi=0.4, seed=11)
    ours = analyze_monthly_series(make_records(v), unit="°C")["statistics"]
    ref_s = pmk.seasonal_test(v, period=12)
    ref_c = pmk.correlated_seasonal_test(v, period=12)
    assert ours["slope_per_decade"] == pytest.approx(ref_s.slope * 10, abs=1e-4)
    mk = seasonal_mann_kendall(v.reshape(-1, 12))
    assert mk["s"] == pytest.approx(ref_s.s)
    assert mk["var_indep"] == pytest.approx(ref_s.var_s, rel=1e-9)
    assert mk["var_hs"] == pytest.approx(ref_c.var_s, rel=1e-6)


def test_rn04_blocks_ungrounded_numbers_and_ignores_unit_digits():
    res = analyze_monthly_series(make_records(synthetic(trend_per_decade=0.3)), unit="W/m^2")
    validate_narrative_numbers(res)  # unidade com dígito não pode disparar
    res["narrative"] += " Aumento de 42%."
    with pytest.raises(ValueError):
        validate_narrative_numbers(res)


def test_parser_drops_annual_and_fill_values():
    payload = {"header": {"fill_value": -999.0}, "properties": {"parameter": {"T2M": {
        "198101": 26.8, "198102": -999.0, "198113": 26.9}}}}
    recs = parse_power_json(payload, "T2M")
    assert [r["date"] for r in recs] == ["1981-01", "1981-02"]
    assert recs[1]["value"] is None


def test_benjamini_hochberg():
    q = benjamini_hochberg([0.01, 0.04, None, 0.03])
    assert q[2] is None
    assert q[0] == pytest.approx(0.03)
    assert q[1] == pytest.approx(0.04)

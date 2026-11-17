import math

import numpy as np

from app.forecasting.models import anomalies, forecast


def series(n=36, season=True, trend=2.0, noise=0.0, seed=1):
    rng = np.random.default_rng(seed)
    out = []
    for i in range(n):
        v = 100 + trend * i + (20 * math.sin(2 * math.pi * i / 12) if season else 0) + rng.normal(0, noise)
        out.append({"period": f"{2023 + (i // 12)}-{(i % 12) + 1:02d}-01", "value": v})
    return out


def test_seasonal_series_uses_seasonal_model_and_is_accurate() -> None:
    r = forecast(series(noise=1.0), horizon=6)
    assert r["method"] in ("holt_winters", "seasonal_naive")
    assert r["metrics"]["mape"] < 5
    assert len(r["points"]) == 6
    assert r["points"][0]["period"] == "2026-01-01"


def test_intervals_widen_and_contain_point() -> None:
    pts = forecast(series(noise=2.0), horizon=6)["points"]
    widths = [p["upper"] - p["lower"] for p in pts]
    assert all(p["lower"] <= p["value"] <= p["upper"] for p in pts)
    assert widths == sorted(widths)


def test_scenario_scales_forecast() -> None:
    base = forecast(series(), horizon=3)["points"][0]["value"]
    up = forecast(series(), horizon=3, change_pct=10)["points"][0]["value"]
    assert abs(up - base * 1.1) < 0.05


def test_short_series_still_works() -> None:
    r = forecast(
        [{"period": "2026-01-01", "value": 1}, {"period": "2026-02-01", "value": 2}, {"period": "2026-03-01", "value": 3}], 2
    )
    assert r["points"][0]["value"] > 2


def test_anomaly_detection_flags_outlier() -> None:
    s = series(noise=0.5)
    s[30]["value"] += 120
    found = anomalies(s)
    assert any(a["period"] == s[30]["period"] for a in found)

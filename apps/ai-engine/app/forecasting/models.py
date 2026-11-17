"""Vaqt qatorlari prognozi.

Bir nechta usul tarixiy ma'lumotning oxirgi qismida (holdout) sinab ko'riladi va eng kichik xatoli
usul tanlanadi. Har bir prognoz bilan MAE, MAPE va 80% ishonch oralig'i qaytariladi.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass
from datetime import date

import numpy as np

Z80 = 1.2816


@dataclass
class Fit:
    method: str
    fitted: np.ndarray
    forecast: np.ndarray


def seasonal_naive(y: np.ndarray, h: int, m: int) -> Fit:
    if m <= 1 or len(y) < m:
        fc = np.repeat(y[-1], h)
        fitted = np.concatenate([[y[0]], y[:-1]])
        return Fit("naive", fitted, fc)
    fc = np.array([y[len(y) - m + (i % m)] for i in range(h)])
    fitted = np.concatenate([y[:m], y[:-m]])
    return Fit("seasonal_naive", fitted, fc)


def holt_linear(y: np.ndarray, h: int, alpha: float, beta: float) -> Fit:
    level, trend = y[0], (y[1] - y[0]) if len(y) > 1 else 0.0
    fitted = np.empty_like(y)
    for t, v in enumerate(y):
        fitted[t] = level + trend
        prev = level
        level = alpha * v + (1 - alpha) * (level + trend)
        trend = beta * (level - prev) + (1 - beta) * trend
    fc = np.array([level + (i + 1) * trend for i in range(h)])
    return Fit("holt_linear", fitted, fc)


def holt_winters(y: np.ndarray, h: int, m: int, alpha: float, beta: float, gamma: float) -> Fit:
    """Additiv Holt-Winters."""
    n_seasons = len(y) // m
    level = y[:m].mean()
    trend = (y[m : 2 * m].mean() - y[:m].mean()) / m if n_seasons >= 2 else 0.0
    season = np.array([np.mean([y[k * m + i] - y[k * m : (k + 1) * m].mean() for k in range(n_seasons)]) for i in range(m)])
    fitted = np.empty_like(y)
    for t, v in enumerate(y):
        s = season[t % m]
        fitted[t] = level + trend + s
        prev = level
        level = alpha * (v - s) + (1 - alpha) * (level + trend)
        trend = beta * (level - prev) + (1 - beta) * trend
        season[t % m] = gamma * (v - level) + (1 - gamma) * s
    fc = np.array([level + (i + 1) * trend + season[(len(y) + i) % m] for i in range(h)])
    return Fit("holt_winters", fitted, fc)


GRID = (0.2, 0.4, 0.6, 0.8)


def candidates(y: np.ndarray, h: int, m: int) -> list[Fit]:
    out = [seasonal_naive(y, h, m)]
    if len(y) >= 4:
        best = min(
            (holt_linear(y, h, a, b) for a, b in itertools.product(GRID, (0.05, 0.1, 0.3))),
            key=lambda f: float(np.mean(np.abs(y[2:] - f.fitted[2:]))),
        )
        out.append(best)
    if m > 1 and len(y) >= 2 * m + 2:
        best = min(
            (holt_winters(y, h, m, a, b, g) for a, b, g in itertools.product(GRID, (0.05, 0.1), (0.1, 0.3))),
            key=lambda f: float(np.mean(np.abs(y[m:] - f.fitted[m:]))),
        )
        out.append(best)
    return out


def _errors(actual: np.ndarray, pred: np.ndarray) -> tuple[float, float | None]:
    mae = float(np.mean(np.abs(actual - pred)))
    nz = actual != 0
    mape = float(np.mean(np.abs((actual[nz] - pred[nz]) / actual[nz])) * 100) if nz.any() else None
    return mae, mape


def _refit(method: str, y: np.ndarray, h: int, m: int) -> Fit:
    for f in candidates(y, h, m):
        if f.method == method:
            return f
    return seasonal_naive(y, h, m)


def next_periods(last: str, h: int, step_months: int = 1) -> list[str]:
    d = date.fromisoformat(last[:10])
    out = []
    for i in range(1, h + 1):
        mm = d.month - 1 + i * step_months
        out.append(date(d.year + mm // 12, mm % 12 + 1, 1).isoformat())
    return out


def forecast(series: list[dict], horizon: int, season_length: int = 12, change_pct: float | None = None) -> dict:
    values = [float(p["value"]) for p in series if p.get("value") is not None]
    if len(values) < 3:
        raise ValueError("at least 3 observations are required")
    y = np.asarray(values)
    m = season_length if season_length and len(y) >= 2 * season_length + 2 else 0

    # Holdout: oxirgi davrlar tarixda yashirilib, usullar shu qismda sinaladi.
    hold = max(1, min(horizon, len(y) // 4))
    train, test = y[:-hold], y[-hold:]
    scored = []
    for f in candidates(train, hold, m if len(train) >= 2 * m + 2 else 0):
        mae, mape = _errors(test, f.forecast[:hold])
        scored.append((mae, mape, f.method))
    scored.sort(key=lambda s: s[0])
    best_mae, best_mape, method = scored[0]

    final = _refit(method, y, horizon, m)
    start = m if method == "holt_winters" else 1
    resid = y[start:] - final.fitted[start:]
    sigma = float(np.std(resid)) if len(resid) > 1 else float(best_mae)
    fc = final.forecast * (1 + (change_pct or 0) / 100)

    periods = next_periods(str(series[-1]["period"]), horizon)
    points = [
        {
            "period": p,
            "value": round(float(v), 2),
            "lower": round(float(v - Z80 * sigma * np.sqrt(i + 1)), 2),
            "upper": round(float(v + Z80 * sigma * np.sqrt(i + 1)), 2),
        }
        for i, (p, v) in enumerate(zip(periods, fc, strict=True))
    ]
    return {
        "method": method,
        "points": points,
        "metrics": {
            "mae": round(best_mae, 3),
            "mape": round(best_mape, 2) if best_mape is not None else None,
            "holdout": hold,
            "observations": len(y),
            "sigma": round(sigma, 3),
            "compared": [{"method": s[2], "mae": round(s[0], 3)} for s in scored],
        },
        "anomalies": anomalies(series, fitted=final.fitted, start=start),
    }


def anomalies(series: list[dict], threshold: float = 3.0, fitted: np.ndarray | None = None, start: int = 1) -> list[dict]:
    """Model qoldiqlari bo'yicha robust z-baho bilan og'ishlarni aniqlash."""
    from app.analyst.statistics import robust_z

    values = np.asarray([float(p["value"]) for p in series])
    if len(values) < 6:
        return []
    if fitted is None:
        m = 12 if len(values) >= 26 else 0
        f = _refit("holt_winters" if m else "holt_linear", values, 1, m)
        fitted, start = f.fitted, (m if m else 1)
    resid = values[start:] - fitted[start:]
    z = robust_z(list(resid))
    out = []
    for i, zi in enumerate(z):
        if abs(zi) >= threshold:
            idx = i + start
            out.append(
                {
                    "period": series[idx]["period"],
                    "value": float(values[idx]),
                    "expected": round(float(fitted[idx]), 2),
                    "z": round(float(zi), 2),
                }
            )
    return out

"""Statistical Analyzer va Anomaly Detector: yengil, numpy asosida."""

from __future__ import annotations

import numpy as np


def robust_z(values: list[float]) -> list[float]:
    """Mediana va MAD asosidagi z-baho — og'ishlarga chidamli."""
    x = np.asarray(values, dtype=float)
    if len(x) < 3:
        return [0.0] * len(x)
    med = np.median(x)
    mad = np.median(np.abs(x - med)) * 1.4826
    if mad == 0:
        std = x.std()
        if std == 0:
            return [0.0] * len(x)
        return list((x - x.mean()) / std)
    return list((x - med) / mad)


def num(v: object) -> float | None:
    try:
        return None if v is None else float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def fmt(v: object) -> str:
    n = num(v)
    if n is None:
        return "—"
    return f"{n:.0f}" if abs(n - round(n)) < 1e-9 else f"{n:.1f}"

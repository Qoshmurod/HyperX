from __future__ import annotations

import hmac

from fastapi import Header, HTTPException

from app.config import get_settings


def require_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    """AI engine faqat asosiy API'dan chaqiriladi. Token bo'lmasa — hech kim kira olmaydi."""
    expected = get_settings().internal_token
    if not expected or not x_internal_token or not hmac.compare_digest(expected, x_internal_token):
        raise HTTPException(status_code=401, detail="unauthorized")

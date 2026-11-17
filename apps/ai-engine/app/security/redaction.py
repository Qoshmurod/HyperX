"""Markaziy modelga yuborishdan oldin shaxsiy ma'lumotlarni niqoblash."""

from __future__ import annotations

import re

_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"), "[EMAIL]"),
    # JShShIR (PINFL) — 14 raqam
    (re.compile(r"\b\d{14}\b"), "[PINFL]"),
    # Pasport: 2 harf + 7 raqam (AA1234567)
    (re.compile(r"\b[A-Z]{2}\s?\d{7}\b"), "[PASSPORT]"),
    # Telefon: +998 XX XXX XX XX
    (re.compile(r"(?:\+?998[\s-]?)?\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b"), "[PHONE]"),
    # Bank kartasi
    (re.compile(r"\b(?:\d[ -]?){16}\b"), "[CARD]"),
]


def redact(text: str) -> str:
    for pattern, repl in _RULES:
        text = pattern.sub(repl, text)
    return text

"""Query Planner: tabiiy tildagi savolni oldindan belgilangan, read-only so'rovlar katalogiga moslaydi.

LLM bu yerda ishlatilmaydi: SQL hech qachon modeldan olinmaydi — faqat katalog kodi va
parametrlar. Shu sababli prompt injection orqali ma'lumot bazasiga ta'sir qilib bo'lmaydi.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, timedelta

from app.nlp.transliteration import normalize

CATALOG = (
    "tasks.late_by_org",
    "tasks.status_by_org",
    "tasks.monthly_trend",
    "kpi.behind_plan",
    "kpi.compare_months",
    "reports.latest",
)


@dataclass
class Plan:
    query_code: str | None
    params: dict = field(default_factory=dict)
    confidence: float = 0.0
    intent: str = "unknown"
    normalized: str = ""


def _has(text: str, *words: str) -> bool:
    return any(w in text for w in words)


def quarter_bounds(today: date, offset: int) -> tuple[date, date]:
    q = (today.month - 1) // 3 + offset
    year = today.year + q // 4
    qi = q % 4
    start = date(year, qi * 3 + 1, 1)
    end_month = qi * 3 + 3
    end = (date(year + (end_month // 12), end_month % 12 + 1, 1)) - timedelta(days=1)
    return start, end


def month_start(today: date, offset: int) -> date:
    m = today.month - 1 + offset
    return date(today.year + m // 12, m % 12 + 1, 1)


def month_bounds(today: date, offset: int) -> tuple[date, date]:
    start = month_start(today, offset)
    return start, month_start(today, offset + 1) - timedelta(days=1)


LATE = ("kechik", "muddati o'tgan", "muddatidan o'tgan", "bajarilmagan", "просроч", "задерж", "опозд", "late", "overdue", "delay")
STATUS = ("umumiy holat", "holatini", "holati", "bajarilish", "состояни", "исполнени", "overall", "status", "progress")
KPI = ("rejadan", "reja", "ko'rsatkich", "kpi", "отста", "план", "показател", "behind", "plan", "indicator", "target")
COMPARE = ("taqqosla", "solishtir", "qiyosla", "сравн", "compare", "versus", " vs ")
TREND = ("dinamika", "trend", "o'zgarish", "oylar bo'yicha", "динамик", "тенденц", "over time")
REPORT = ("hisobot", "отчет", "отчёт", "report")
DOCS = (
    "hujjat",
    "nizom",
    "qaror",
    "buyruq",
    "farmon",
    "qonun",
    "yo'riqnoma",
    "reglament",
    "документ",
    "положени",
    "приказ",
    "постановлен",
    "закон",
    "document",
    "regulation",
    "decree",
    "policy",
)
QUARTER = ("chorak", "квартал", "quarter")
MONTH = ("oy", "месяц", "month")
PREV = ("oxirgi", "o'tgan", "oldingi", "прошл", "последн", "предыдущ", "last", "previous", "past")
CURRENT = ("bu oy", "joriy", "shu oy", "текущ", "этот", "this month", "current")
MONTHLY = ("oylik", "ежемесяч", "месячн", "monthly")
QUARTERLY = ("choraklik", "квартальн", "quarterly")
WEEKLY = ("haftalik", "еженедел", "weekly")


def plan(question: str, today: date | None = None) -> Plan:
    today = today or date.today()
    # Rus tilidagi kalit so'zlar uchun asl matn, o'zbek kirill uchun lotinlashtirilgani ham tekshiriladi.
    text = f" {question.lower()} | {normalize(question).lower()} "
    text = re.sub(r"\s+", " ", text)

    def period(default_quarter: bool = True) -> dict:
        if _has(text, *QUARTER):
            s, e = quarter_bounds(today, -1 if _has(text, *PREV) else 0)
        elif _has(text, *MONTH) and not _has(text, *QUARTER):
            s, e = month_bounds(today, 0 if _has(text, *CURRENT) else -1)
        elif default_quarter:
            s, e = quarter_bounds(today, -1)
        else:
            return {}
        return {"from": s.isoformat(), "to": e.isoformat()}

    if _has(text, *DOCS) and not _has(text, *LATE, *KPI):
        return Plan(None, {}, 0.7, "documents", text.strip())
    if _has(text, *COMPARE) and _has(text, *MONTH):
        return Plan(
            "kpi.compare_months",
            {"month_a": month_start(today, -1).isoformat(), "month_b": month_start(today, 0).isoformat()},
            0.85,
            "data",
            text.strip(),
        )
    if _has(text, *LATE):
        return Plan("tasks.late_by_org", period(), 0.9, "data", text.strip())
    if _has(text, *KPI):
        return Plan("kpi.behind_plan", {"threshold_pct": 95}, 0.85, "data", text.strip())
    if _has(text, *TREND):
        return Plan("tasks.monthly_trend", {"months": 12}, 0.8, "data", text.strip())
    if _has(text, *REPORT):
        rtype = (
            "monthly"
            if _has(text, *MONTHLY)
            else "quarterly"
            if _has(text, *QUARTERLY)
            else "weekly"
            if _has(text, *WEEKLY)
            else None
        )
        return Plan("reports.latest", {"report_type": rtype} if rtype else {}, 0.8, "data", text.strip())
    if _has(text, *STATUS) or _has(text, "topshiriq", "поручени", "task"):
        return Plan("tasks.status_by_org", period(), 0.75, "data", text.strip())
    return Plan(None, {}, 0.3, "documents", text.strip())

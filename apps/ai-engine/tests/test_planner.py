from datetime import date

import pytest

from app.analyst.planner import plan, quarter_bounds

TODAY = date(2026, 11, 17)


@pytest.mark.parametrize(
    ("q", "code"),
    [
        ("Oxirgi chorakda qaysi tashkilotlarda topshiriqlar bajarilishi kechikkan?", "tasks.late_by_org"),
        ("Охирги чоракда қайси ташкилотларда топшириқлар кечиккан?", "tasks.late_by_org"),
        ("В каких организациях просрочены поручения за прошлый квартал?", "tasks.late_by_org"),
        ("Which organizations had overdue tasks last quarter?", "tasks.late_by_org"),
        ("Qaysi ko'rsatkichlar rejadan ortda qolmoqda?", "kpi.behind_plan"),
        ("Какие показатели отстают от плана?", "kpi.behind_plan"),
        ("O'tgan oy va bu oyni taqqosla.", "kpi.compare_months"),
        ("Compare last month with this month", "kpi.compare_months"),
        ("Topshiriqlar bajarilishining umumiy holatini ko'rsat.", "tasks.status_by_org"),
        ("Menga tuman bo'yicha oxirgi oylik hisobotni chiqar.", "reports.latest"),
        ("Oylar bo'yicha dinamika qanday?", "tasks.monthly_trend"),
    ],
)
def test_plan_codes(q: str, code: str) -> None:
    assert plan(q, TODAY).query_code == code


def test_document_questions_go_to_rag() -> None:
    p = plan("Nizomning 5-bandida nima deyilgan?", TODAY)
    assert p.intent == "documents" and p.query_code is None


def test_previous_quarter_bounds() -> None:
    assert quarter_bounds(TODAY, -1) == (date(2026, 7, 1), date(2026, 9, 30))
    assert quarter_bounds(date(2026, 2, 1), -1) == (date(2025, 10, 1), date(2025, 12, 31))
    p = plan("oxirgi chorakda kechikishlar", TODAY)
    assert p.params == {"from": "2026-07-01", "to": "2026-09-30"}


def test_monthly_report_type() -> None:
    assert plan("oylik hisobot", TODAY).params == {"report_type": "monthly"}

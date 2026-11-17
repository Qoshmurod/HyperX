import pytest

from app.analyst.explainer import explain
from app.i18n.texts import latin_to_cyrillic

ROWS = [
    {"organization_name": "Birinchi tuman", "total": 20, "late": 6, "late_pct": 30, "prev_late": 2, "prev_late_pct": 10},
    {"organization_name": "Ikkinchi tuman", "total": 10, "late": 1, "late_pct": 10, "prev_late": 3, "prev_late_pct": 30},
]


@pytest.mark.parametrize("lang", ["uz", "uz-Cyrl", "ru", "en"])
def test_explain_in_all_languages(lang: str) -> None:
    r = explain("q", "tasks.late_by_org", ROWS, "internal", lang, {"from": "2026-07-01", "to": "2026-09-30"})
    assert r["chart"]["type"] == "bar"
    assert len(r["highlights"]) == 3
    if lang == "uz-Cyrl":
        assert "Биринчи туман" in r["answer"]
    if lang == "uz":
        assert "yomonlashgan" in r["answer"] and "yaxshilangan" in r["answer"]


def test_empty_rows() -> None:
    assert "topilmadi" in explain("q", "kpi.behind_plan", [], "internal", "uz")["answer"]


def test_cyrillic_transliteration() -> None:
    assert latin_to_cyrillic("O'zbekiston Respublikasi") == "Ўзбекистон Республикаси"
    assert latin_to_cyrillic("Ma'lumot yo'q") == "Маълумот йўқ"
    assert latin_to_cyrillic("Ekspertiza") == "Экспертиза"

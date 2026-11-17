import pytest

from app.nlp.transliteration import cyrillic_to_latin, normalize


@pytest.mark.parametrize(
    ("cyr", "lat"),
    [
        ("Тошкент", "Toshkent"),
        ("ўзбек тили", "o'zbek tili"),
        ("Ғалаба", "G'alaba"),
        ("қишлоқ хўжалиги", "qishloq xo'jaligi"),
        ("ҳисобот", "hisobot"),
        ("ер", "yer"),
        ("поезд", "poyezd"),
        ("келди", "keldi"),
        ("маъно", "ma'no"),
        ("цех", "sex"),
        ("милиция", "militsiya"),
        ("ШАҲАР", "SHAHAR"),
        ("Шаҳар", "Shahar"),
    ],
)
def test_cyrillic_to_latin(cyr: str, lat: str) -> None:
    assert cyrillic_to_latin(cyr) == lat


def test_normalize_unifies_apostrophes_and_scripts() -> None:
    assert normalize("oʻzbek  tili") == "o'zbek tili"
    assert normalize("o‘zbek tili") == "o'zbek tili"
    assert normalize("ўзбек тили") == "o'zbek tili"


def test_normalize_keeps_latin_text() -> None:
    assert normalize("Oxirgi chorak hisoboti") == "Oxirgi chorak hisoboti"

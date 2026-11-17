"""O'zbek matnini normallashtirish: kirill -> lotin, apostroflarni yagona shaklga keltirish.

Qidiruv va embedding uchun kanonik shakl sifatida lotin yozuvi va oddiy ASCII apostrof (')
ishlatiladi: o'zbekcha "o'", "g'" va tutuq belgisi uchun klaviaturada turli belgilar
(ʻ ʼ ‘ ’ `) uchraydi.
"""

from __future__ import annotations

import re
import unicodedata

APOSTROPHES = "ʻʼ‘’`´ʹ′"
_APOSTROPHE_RE = re.compile(f"[{APOSTROPHES}]")

_VOWELS = set("аеёиоуэюяўАЕЁИОУЭЮЯЎ")

_SIMPLE = {
    "а": "a",
    "б": "b",
    "в": "v",
    "г": "g",
    "д": "d",
    "ж": "j",
    "з": "z",
    "и": "i",
    "й": "y",
    "к": "k",
    "л": "l",
    "м": "m",
    "н": "n",
    "о": "o",
    "п": "p",
    "р": "r",
    "с": "s",
    "т": "t",
    "у": "u",
    "ф": "f",
    "х": "x",
    "ч": "ch",
    "ш": "sh",
    "ъ": "'",
    "ь": "",
    "э": "e",
    "ю": "yu",
    "я": "ya",
    "ё": "yo",
    "ў": "o'",
    "қ": "q",
    "ғ": "g'",
    "ҳ": "h",
    "ы": "i",
    "щ": "sh",
}


def _match_case(src: str, latin: str, next_char: str) -> str:
    if not src.isupper() or not latin:
        return latin
    # "Ш" -> "Sh" so'z ichida, "ШАҲАР" -> "SHAHAR" butun so'z katta harfda bo'lsa.
    if len(latin) > 1 and not next_char.isupper():
        return latin[0].upper() + latin[1:]
    return latin.upper()


def cyrillic_to_latin(text: str) -> str:
    out: list[str] = []
    for i, ch in enumerate(text):
        low = ch.lower()
        prev = text[i - 1] if i > 0 else ""
        nxt = text[i + 1] if i + 1 < len(text) else ""
        word_start = not prev.isalpha()

        if low == "е":
            latin = "ye" if word_start or prev in _VOWELS or prev.lower() in "ъь" else "e"
        elif low == "ц":
            latin = "s" if word_start or prev not in _VOWELS else "ts"
        elif low in _SIMPLE:
            latin = _SIMPLE[low]
        else:
            out.append(ch)
            continue
        out.append(_match_case(ch, latin, nxt))
    return "".join(out)


def normalize_apostrophes(text: str) -> str:
    return _APOSTROPHE_RE.sub("'", text)


def has_cyrillic(text: str) -> bool:
    return any("CYRILLIC" in unicodedata.name(ch, "") for ch in text)


def normalize(text: str) -> str:
    """Qidiruv/indekslash uchun kanonik shakl."""
    text = unicodedata.normalize("NFC", text)
    if has_cyrillic(text):
        text = cyrillic_to_latin(text)
    text = normalize_apostrophes(text)
    return re.sub(r"\s+", " ", text).strip()

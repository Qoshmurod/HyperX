"""AI javoblari uchun 4 tildagi shablonlar. uz-Cyrl lotin matnidan avtomatik hosil qilinadi."""

from __future__ import annotations

import re

LANGS = ("uz", "uz-Cyrl", "ru", "en")

_DIGRAPHS = [("o'", "ў"), ("g'", "ғ"), ("sh", "ш"), ("ch", "ч"), ("yo", "ё"), ("yu", "ю"), ("ya", "я"), ("ye", "е")]
_SINGLE = {
    "a": "а",
    "b": "б",
    "d": "д",
    "e": "е",
    "f": "ф",
    "g": "г",
    "h": "ҳ",
    "i": "и",
    "j": "ж",
    "k": "к",
    "l": "л",
    "m": "м",
    "n": "н",
    "o": "о",
    "p": "п",
    "q": "қ",
    "r": "р",
    "s": "с",
    "t": "т",
    "u": "у",
    "v": "в",
    "x": "х",
    "y": "й",
    "z": "з",
    "c": "с",
    "w": "в",
    "'": "ъ",
}
_VOWELS = set("aeiouAEIOU")


def _case(src: str, out: str) -> str:
    return out.upper() if src[0] != src[0].lower() else out


_KEEP = re.compile(r"(\b(?:AI|KPI|API|PDF|MFA|MAE|MAPE|CSV|XLSX|DOCX|JSON|ID|URL|IP|GovMind|Telegram)\b|\d{4}-\d{2}-\d{2})")


def latin_to_cyrillic(text: str) -> str:
    """Qisqartmalar, nomlar va sanalar o'zgarmaydi."""
    parts = _KEEP.split(re.sub("[ʻʼ‘’`´]", "'", text))
    return "".join(p if i % 2 else _translit(p) for i, p in enumerate(parts))


def _translit(text: str) -> str:
    res: list[str] = []
    i = 0
    while i < len(text):
        rest = text[i:].lower()
        prev = text[i - 1] if i > 0 else ""
        word_start = not prev.isalpha() and prev != "'"
        if rest.startswith("yo'"):
            # "yo'q" = й + ў, "yo" diftongi emas
            res.append(_case(text[i], "й"))
            i += 1
            continue
        if rest.startswith("s'h"):
            res.append(_case(text[i], "с") + _case(text[i + 2], "ҳ"))
            i += 3
            continue
        for lat, cyr in _DIGRAPHS:
            if rest.startswith(lat):
                res.append(_case(text[i : i + 2], cyr))
                i += 2
                break
        else:
            ch = rest[0]
            if ch == "e" and (word_start or prev in _VOWELS):
                res.append(_case(text[i], "э"))
            elif ch == "'" and not prev.isalpha():
                res.append(text[i])
            elif ch in _SINGLE:
                res.append(_case(text[i], _SINGLE[ch]))
            else:
                res.append(text[i])
            i += 1
    return "".join(res)


T: dict[str, dict[str, str]] = {
    "no_data": {
        "uz": "Tanlangan davr va sizning vakolatingiz doirasida ma'lumot topilmadi.",
        "ru": "За выбранный период в пределах ваших полномочий данные не найдены.",
        "en": "No data was found for the selected period within your access scope.",
    },
    "late_head": {
        "uz": "{period} davrida {n} ta tashkilotda topshiriqlar kechikishi qayd etildi.",
        "ru": "За период {period} просрочки поручений зафиксированы в {n} организациях.",
        "en": "During {period}, late tasks were recorded in {n} organizations.",
    },
    "late_row": {
        "uz": "{org}: {late} ta kechikish ({pct}%), oldingi davrda {prev} ta ({prev_pct}%) — {trend}.",
        "ru": "{org}: {late} просрочек ({pct}%), в предыдущем периоде {prev} ({prev_pct}%) — {trend}.",
        "en": "{org}: {late} late ({pct}%), previous period {prev} ({prev_pct}%) — {trend}.",
    },
    "trend_up": {"uz": "yomonlashgan", "ru": "ухудшение", "en": "worse"},
    "trend_down": {"uz": "yaxshilangan", "ru": "улучшение", "en": "better"},
    "trend_same": {"uz": "o'zgarmagan", "ru": "без изменений", "en": "unchanged"},
    "none_late": {
        "uz": "{period} davrida kechikkan topshiriqlar aniqlanmadi.",
        "ru": "За период {period} просроченных поручений не выявлено.",
        "en": "No late tasks were found for {period}.",
    },
    "status_head": {
        "uz": "Jami {total} ta topshiriqdan {done} tasi bajarilgan ({pct}%), {overdue} tasining muddati o'tgan.",
        "ru": "Из {total} поручений выполнено {done} ({pct}%), просрочено {overdue}.",
        "en": "Of {total} tasks, {done} are completed ({pct}%) and {overdue} are overdue.",
    },
    "status_worst": {
        "uz": "Eng past bajarilish: {org} ({pct}%).",
        "ru": "Наименьшее исполнение: {org} ({pct}%).",
        "en": "Lowest completion: {org} ({pct}%).",
    },
    "kpi_head": {
        "uz": "Rejadan ortda qolayotgan {n} ta ko'rsatkich bor.",
        "ru": "Отстают от плана {n} показателей.",
        "en": "{n} indicators are behind plan.",
    },
    "kpi_row": {
        "uz": "{kpi} ({org}): reja {plan}, amalda {actual} — {pct}%.",
        "ru": "{kpi} ({org}): план {plan}, факт {actual} — {pct}%.",
        "en": "{kpi} ({org}): plan {plan}, actual {actual} — {pct}%.",
    },
    "kpi_none": {
        "uz": "Barcha ko'rsatkichlar reja darajasida yoki undan yuqori.",
        "ru": "Все показатели на уровне плана или выше.",
        "en": "All indicators are at or above plan.",
    },
    "compare_head": {
        "uz": "{a} va {b} taqqoslandi: {up} ta ko'rsatkich o'sgan, {down} tasi kamaygan.",
        "ru": "Сравнение {a} и {b}: выросло {up} показателей, снизилось {down}.",
        "en": "Compared {a} with {b}: {up} indicators increased, {down} decreased.",
    },
    "compare_row": {
        "uz": "{kpi} ({org}): {va} → {vb} ({pct}%).",
        "ru": "{kpi} ({org}): {va} → {vb} ({pct}%).",
        "en": "{kpi} ({org}): {va} → {vb} ({pct}%).",
    },
    "trend_head": {
        "uz": "Oxirgi {n} oyda muddati kelgan {due} ta topshiriqdan {late} tasi kechikkan.",
        "ru": "За последние {n} месяцев из {due} поручений со сроком просрочено {late}.",
        "en": "Over the last {n} months, {late} of {due} due tasks were late.",
    },
    "trend_peak": {
        "uz": "Eng ko'p kechikish: {month} ({late} ta).",
        "ru": "Пик просрочек: {month} ({late}).",
        "en": "Peak of delays: {month} ({late}).",
    },
    "reports_head": {
        "uz": "So'nggi hisobotlar: {list}.",
        "ru": "Последние отчёты: {list}.",
        "en": "Latest reports: {list}.",
    },
    "reports_none": {
        "uz": "Ko'rsatilgan turdagi hisobot hali tayyorlanmagan. Uni \"Hisobotlar\" bo'limida yaratish mumkin.",
        "ru": "Отчёт указанного типа ещё не подготовлен. Его можно создать в разделе «Отчёты».",
        "en": "No report of this type has been prepared yet. You can create one in Reports.",
    },
    "rag_none": {
        "uz": "Sizga ruxsat etilgan hujjatlarda bu savolga javob topilmadi.",
        "ru": "В доступных вам документах ответ на этот вопрос не найден.",
        "en": "No answer was found in the documents available to you.",
    },
    "rag_extractive": {
        "uz": "Quyidagi hujjat parchalari savolingizga eng mos keladi:",
        "ru": "Наиболее релевантные фрагменты документов:",
        "en": "The most relevant document excerpts:",
    },
    "anomaly": {
        "uz": "Statistik og'ish: {period} da qiymat {value}, kutilgan ≈ {expected}.",
        "ru": "Статистическое отклонение: в {period} значение {value}, ожидалось ≈ {expected}.",
        "en": "Statistical anomaly: in {period} the value was {value}, expected ≈ {expected}.",
    },
    "commentary": {
        "uz": (
            "{org} bo'yicha {from_} — {to} davrida {total} ta topshiriqdan {done} tasi bajarildi, "
            "{overdue} tasining muddati o'tgan; o'z vaqtida bajarilish {on_time}%."
        ),
        "ru": (
            "По {org} за период {from_} — {to}: из {total} поручений выполнено {done}, просрочено {overdue}; "
            "исполнение в срок {on_time}%."
        ),
        "en": ("For {org}, {from_} — {to}: {done} of {total} tasks completed, {overdue} overdue; on-time completion {on_time}%."),
    },
    "commentary_kpi": {
        "uz": "Rejadan ortda qolgan ko'rsatkichlar: {list}.",
        "ru": "Показатели, отстающие от плана: {list}.",
        "en": "Indicators behind plan: {list}.",
    },
    "commentary_late": {
        "uz": "Kechikishlar eng ko'p qayd etilgan tashkilot: {org} ({late} ta).",
        "ru": "Больше всего просрочек: {org} ({late}).",
        "en": "Most delays: {org} ({late}).",
    },
    "commentary_reco": {
        "uz": (
            "Tavsiya: muddati o'tgan topshiriqlar bo'yicha haftalik nazorat yig'ilishini o'tkazish "
            "va mas'ullarni qayta ko'rib chiqish."
        ),
        "ru": (
            "Рекомендация: провести еженедельное контрольное совещание по просроченным поручениям и пересмотреть ответственных."
        ),
        "en": "Recommendation: hold a weekly control meeting on overdue tasks and review assignees.",
    },
}


def tr(key: str, lang: str, **kw: object) -> str:
    base = T[key]
    if lang == "uz-Cyrl":
        text = base["uz"].format(**kw)
        return latin_to_cyrillic(text)
    return base.get(lang, base["uz"]).format(**kw)


def lang_name(lang: str) -> str:
    return {"uz": "o'zbek (lotin yozuvi)", "uz-Cyrl": "o'zbek (kirill yozuvi)", "ru": "rus", "en": "ingliz"}.get(lang, "o'zbek")

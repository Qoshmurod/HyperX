"""Decision Intelligence: muammo, dalillar → ehtimoliy sabablar va yechim variantlari.

Variantlarning kutilayotgan ta'siri dalillardagi raqamlardan oddiy, shaffof farazlar bilan
hisoblanadi; farazlar har bir variant bilan birga ko'rsatiladi. Natija — faqat loyiha.
"""

from __future__ import annotations

from app.analyst.statistics import num
from app.i18n.texts import latin_to_cyrillic
from app.model_gateway.gateway import get_gateway

TXT = {
    "cause_late": {
        "uz": "{org}da topshiriqlarning {pct}% i kechikkan (oldingi davrda {prev}%).",
        "ru": "В {org} просрочено {pct}% поручений (в предыдущем периоде {prev}%).",
        "en": "{org}: {pct}% of tasks were late (previous period {prev}%).",
    },
    "cause_kpi": {
        "uz": '"{kpi}" ko\'rsatkichi rejaning {pct}% darajasida ({org}).',
        "ru": "Показатель «{kpi}» выполнен на {pct}% плана ({org}).",
        "en": 'Indicator "{kpi}" is at {pct}% of plan ({org}).',
    },
    "cause_generic": {
        "uz": "Mavjud ma'lumotlarda aniq statistik sabab topilmadi; muammo bo'yicha qo'shimcha ma'lumot yig'ish kerak.",
        "ru": "В имеющихся данных явная статистическая причина не найдена; требуется сбор дополнительных данных.",
        "en": "No clear statistical cause was found in the available data; more data should be collected.",
    },
    "opt1_title": {"uz": "Resurslarni qayta taqsimlash", "ru": "Перераспределение ресурсов", "en": "Reallocate resources"},
    "opt1_desc": {
        "uz": "Kechikish eng yuqori bo'lgan tashkilotlarga vaqtinchalik qo'shimcha xodim va mas'ul biriktirish.",
        "ru": "Временно направить дополнительных сотрудников и ответственных в организации с наибольшими просрочками.",
        "en": "Temporarily assign additional staff and owners to organizations with the highest delays.",
    },
    "opt2_title": {"uz": "Nazorat jarayonini kuchaytirish", "ru": "Усиление контроля", "en": "Strengthen control process"},
    "opt2_desc": {
        "uz": "Haftalik nazorat yig'ilishi, muddatga 3 kun qolganda avtomatik ogohlantirish va oraliq hisobot talabi.",
        "ru": "Еженедельное контрольное совещание, автоматическое предупреждение за 3 дня до срока и промежуточные отчёты.",
        "en": "Weekly control meeting, automatic warning 3 days before deadline and interim reports.",
    },
    "opt3_title": {"uz": "Salohiyatni oshirish", "ru": "Повышение потенциала", "en": "Capacity building"},
    "opt3_desc": {
        "uz": "Mas'ul xodimlar uchun qisqa o'quv kursi va ish jarayonlarini standartlashtirish.",
        "ru": "Краткий курс обучения для ответственных и стандартизация процессов.",
        "en": "Short training for task owners and process standardization.",
    },
    "impact": {
        "uz": "Kechikish ulushi taxminan {from_}% dan {to}% gacha kamayishi kutiladi.",
        "ru": "Ожидается снижение доли просрочек примерно с {from_}% до {to}%.",
        "en": "The share of late tasks is expected to fall from about {from_}% to {to}%.",
    },
    "assumption": {
        "uz": "Faraz: shunga o'xshash choralar kechikishni {eff}% ga kamaytiradi; haqiqiy ta'sir pilotda tekshirilishi kerak.",
        "ru": "Допущение: подобные меры снижают просрочки на {eff}%; реальный эффект нужно проверить в пилоте.",
        "en": "Assumption: similar measures reduce delays by {eff}%; the real effect must be verified in a pilot.",
    },
    "risk1": {
        "uz": "Boshqa yo'nalishlarda yuklama ortishi.",
        "ru": "Рост нагрузки на других направлениях.",
        "en": "Higher workload elsewhere.",
    },
    "risk2": {
        "uz": "Hisobot yuklamasining ortishi va rasmiyatchilik.",
        "ru": "Рост отчётной нагрузки и формализм.",
        "en": "More reporting burden and formalism.",
    },
    "risk3": {"uz": "Natija sekin namoyon bo'ladi.", "ru": "Эффект проявится не сразу.", "en": "Results appear slowly."},
    "con1": {
        "uz": "Shtat birliklari va byudjet chegarasi.",
        "ru": "Штатные и бюджетные ограничения.",
        "en": "Staffing and budget limits.",
    },
    "con2": {"uz": "Rahbarlar vaqtini talab qiladi.", "ru": "Требует времени руководителей.", "en": "Requires leaders' time."},
    "con3": {"uz": "O'quv resurslari va vaqt.", "ru": "Учебные ресурсы и время.", "en": "Training resources and time."},
}


def t(key: str, lang: str, **kw: object) -> str:
    if lang == "uz-Cyrl":
        return latin_to_cyrillic(TXT[key]["uz"].format(**kw))
    return TXT[key].get(lang, TXT[key]["uz"]).format(**kw)


def _late_rate(evidence: list[dict]) -> float:
    for e in evidence:
        if e.get("query_code") == "tasks.late_by_org":
            rows = e.get("rows") or []
            total = sum(num(r.get("total")) or 0 for r in rows)
            late = sum(num(r.get("late")) or 0 for r in rows)
            if total:
                return round(100 * late / total, 1)
    return 0.0


def draft(problem: str, evidence: list[dict], classification: str, lang: str) -> dict:
    causes: list[str] = []
    for e in evidence:
        rows = e.get("rows") or []
        if e.get("query_code") == "tasks.late_by_org":
            for r in sorted(rows, key=lambda r: num(r.get("late_pct")) or 0, reverse=True)[:3]:
                if (num(r.get("late_pct")) or 0) > 0:
                    org = str(r.get("organization_name"))
                    causes.append(
                        t(
                            "cause_late",
                            lang,
                            org=latin_to_cyrillic(org) if lang == "uz-Cyrl" else org,
                            pct=r.get("late_pct"),
                            prev=r.get("prev_late_pct") or 0,
                        )
                    )
        if e.get("query_code") == "kpi.behind_plan":
            for r in rows[:3]:
                kpi, org = str(r.get("kpi_name")), str(r.get("organization_name"))
                if lang == "uz-Cyrl":
                    kpi, org = latin_to_cyrillic(kpi), latin_to_cyrillic(org)
                causes.append(t("cause_kpi", lang, kpi=kpi, org=org, pct=r.get("attainment_pct")))
    if not causes:
        causes.append(t("cause_generic", lang))

    base = _late_rate(evidence)
    options = []
    for i, (eff, cost) in enumerate(((30, "high"), (20, "low"), (10, "medium")), start=1):
        options.append(
            {
                "title": t(f"opt{i}_title", lang),
                "description": t(f"opt{i}_desc", lang),
                "expected_impact": t("impact", lang, from_=base, to=round(base * (1 - eff / 100), 1)) if base else None,
                "impact_estimate": {
                    "metric": "late_pct",
                    "from": base,
                    "to": round(base * (1 - eff / 100), 1),
                    "effect_pct": eff,
                },
                "assumptions": [t("assumption", lang, eff=eff)],
                "risks": [t(f"risk{i}", lang)],
                "constraints": [t(f"con{i}", lang)],
                "cost": cost,
            }
        )

    meta = get_gateway().generate(
        "decision",
        classification,
        "Siz davlat boshqaruvi tahlilchisisiz. Berilgan muammo va dalillar asosida 2-3 ta qo'shimcha ehtimoliy sababni "
        "qisqa ro'yxat qilib yozing. Yangi raqam o'ylab topmang. Bu faqat tavsiya; qarorni inson qabul qiladi.",
        f"Muammo: {problem}\nDalillar: {causes}",
    )
    if meta.text:
        extra = [ln.strip(" -•*0123456789.") for ln in meta.text.splitlines() if ln.strip()][:3]
        causes.extend(f"(AI) {x}" for x in extra if x)
    return {"causes": causes, "options": options, "confidence": 0.6 if base else 0.4, **meta.meta}

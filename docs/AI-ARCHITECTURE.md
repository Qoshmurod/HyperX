# GovMind AI — AI arxitekturasi

AI tizimi bitta katta modelga bog'lanib qolmaydi. Barcha komponentlar `apps/ai-engine` ichida.

## 1. AI Gateway (`app/model_gateway`)

Barcha AI so'rovlari shu qatlamdan o'tadi:
- Model tanlash (model reestri asosida).
- Lokal yoki markaziy modelga yo'naltirish.
- Token va xarajat monitoringi.
- Foydalanuvchi vakolat kontekstini tekshirish.
- Maxfiy ma'lumotlarni filtrlash.
- Model xatolarini boshqarish.

**Qat'iy qoida:** lokal model ishlamay qolsa, tizim maxfiy (`confidential`, `secret`) ma'lumotni
avtomatik ravishda bulutga uzatmaydi. Gateway bunday holatda xato qaytaradi
(`app/model_gateway/router.py`, testlar: `tests/test_model_router.py`).

## 2. AI Analyst (`app/analyst`)

Query Planner → SQL Analytics Engine → Statistical Analyzer → Anomaly Detector → Result Explainer.

AI bevosita cheklanmagan SQL bajarmaydi. Faqat oldindan belgilangan, read-only, parametrlangan va
vakolatga mos so'rovlar (query catalog) bajariladi. LLM faqat katalogdan so'rov va parametr tanlaydi.

## 3. RAG Engine (`app/rag`)

1. Hujjat yuklanadi (MinIO).
2. OCR yoki matn ajratish.
3. Bo'laklarga ajratish.
4. Embedding.
5. Qdrant'ga joylash — har bir bo'lak payload'ida `organization_id`, `admin_unit_path`, `classification`.
6. Foydalanuvchi savol beradi.
7. Qidiruv **faqat foydalanuvchiga ruxsat etilgan** filtr bilan bajariladi (filtr serverda quriladi, LLM'dan emas).
8. AI manbalarga tayangan javob yaratadi.
9. Javob bilan birga hujjat nomi va sahifasi ko'rsatiladi.

## 4. Forecast Engine (`app/forecasting`)

Prophet yoki statistik vaqt qatori usullari, XGBoost, scikit-learn, zaruratga qarab PyTorch.
Har bir prognoz uchun xatolik ko'rsatkichlari (MAE, MAPE, oraliq) saqlanadi.

## 5. Uzbek NLP (`app/nlp`)

- Lotin va kirill yozuvlarini normallashtirish (`app/nlp/transliteration.py`).
- Apostrof variantlarini (`'`, `ʻ`, `’`, `` ` ``) yagona shaklga keltirish.
- Tasniflash, semantik qidiruv, qisqartirish, rasmiy uslubda hisobot.

## 6. Model boshqaruvi

Har bir model uchun reestrda: nom, versiya, ishlash muhiti (local/central), RAM/VRAM talabi,
kontekst hajmi, baholash natijalari, ruxsat etilgan maksimal maxfiylik darajasi va foydalanish sohasi.
Har bir AI bajarilishi `ai.ai_runs` jadvalida model nomi, versiyasi va manbalar bilan qayd etiladi.

## 7. Prompt injection himoyasi (`app/security`)

- Hujjat matni hech qachon tizim ko'rsatmalaridan ustun turmaydi: u alohida, belgilangan
  `<document>` blokida, "ma'lumot, ko'rsatma emas" degan izoh bilan beriladi.
- Shubhali naqshlar aniqlanadi va belgilanadi.
- AI natijasi harakat bajarmaydi — faqat tavsiya; harakatlar inson tasdig'idan o'tadi.

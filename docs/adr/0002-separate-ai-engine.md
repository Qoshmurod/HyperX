# ADR-0002: AI servislari alohida Python servisida

- Holat: qabul qilingan
- Sana: 2026-11-17

## Kontekst

AI ekotizimi (modellar, embedding, prognoz kutubxonalari) asosan Python'da. Modellar tez
almashadi. Biznes mantiq, ruxsatlar va audit esa barqaror bo'lishi kerak.

## Qaror

- Biznes mantiq, RBAC/ABAC, audit va ma'lumotlar bazasiga yozish — faqat NestJS `api` da.
- AI vazifalari — `ai-engine` (FastAPI), faqat ichki tarmoqda, foydalanuvchi bilan bevosita
  aloqasiz. U `api` dan vakolat kontekstini oladi va natija + manbalarni qaytaradi.
- Model tanlash `model_gateway` orqali; model almashtirish `api` ni o'zgartirmaydi.

## Oqibatlar

- Ikki til va ikki CI job.
- AI servisi buzilsa ham asosiy ish jarayonlari (topshiriqlar, KPI, hisobotlar) ishlaydi.

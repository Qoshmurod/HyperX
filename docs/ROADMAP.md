# GovMind AI — Holat va reja

Belgilar: ✅ bajarildi (kod + avtomatik test) · 📄 tartib/hujjat tayyor, bajarish tashkilot tomonida · ⬜ keyingi bosqich

## Phase 0 — Architecture & Research
- ✅ Texnik talablar ([REQUIREMENTS](REQUIREMENTS.md))
- ✅ Ma'lumotlar klassifikatsiyasi ([data-classification](security/data-classification.md))
- ✅ Threat modeling ([threat-model](security/threat-model.md))
- ✅ Database sxemasi ([DATABASE](DATABASE.md)), API kontrakti ([API](API.md)), ADR'lar
- ✅ UI (web interfeys, 4 til)

## Phase 1 — Core Infrastructure
- ✅ Monorepo, Docker, PostgreSQL, Redis, Keycloak, NestJS, Next.js, CI/CD

## Phase 2 — Government Core
- ✅ Hududlar va tashkilotlar iyerarxiyasi, bo'limlar
- ✅ Xodimlar, Keycloak hisobiga avtomatik bog'lash
- ✅ RBAC + ABAC (hudud, maxfiylik darajasi, muddat), huquqni oshirishdan himoya
- ✅ Topshiriqlar, mas'ullar, optimistic versioning
- ✅ KPI (reja/amal), dashboard
- ✅ Audit (append-only, xesh-zanjir, auditor roli)

## Phase 3 — AI Intelligence
- ✅ AI Gateway: model tanlash, maxfiy ma'lumotni bulutga chiqarmaslik, PII niqoblash, zaxira rejim
- ✅ Ollama (lokal) va vLLM/OpenAI-mos (markaziy) integratsiyasi
- ✅ AI Analyst: savol → katalog so'rov (SQL modeldan olinmaydi) → izoh, jadval, grafik, manba
- ✅ Uzbek NLP: lotin/kirill normallashtirish, 4 tilli javoblar
- ✅ RAG: PDF/DOCX/TXT, bo'laklash, embedding, vakolat filtri, prompt injection filtri
- ✅ AI hisobot izohi, manbalar va model versiyasini qayd etish
- ⬜ Model evaluation to'plami: haqiqiy (anonimlashtirilgan) savollar bo'yicha ekspertlar baholashi — pilotda
- ⬜ Skanerlangan PDF uchun OCR (Tesseract) servisi

## Phase 4 — Advanced Analytics
- ✅ Forecast Engine (Holt-Winters, Holt, mavsumiy naiv, avtomatik tanlov, MAE/MAPE, oraliq)
- ✅ Anomaly Detection (robust z-baho) va avtomatik ogohlantirish
- ✅ Decision Intelligence (sabablar, variantlar, ta'sir hisobi, xavflar, inson tasdig'i)
- ✅ Ssenariy modellashtirish (o'zgarish %)
- ✅ Statistik dashboard

## Phase 5 — Hybrid Infrastructure
- ✅ Tuman/viloyat/markaz profillari
- ✅ Secure Sync: outbox/inbox, idempotentlik, versiyalar, egalik qoidalari, push/pull, uzatish
- ✅ Offline ishlash (navbat + backoff), konfliktlarni qo'lda hal qilish
- ✅ Lokal AI runtime, oflayn vektor baza
- ✅ Backup/restore (shifrlangan, avtomatik tiklash sinovi)

## Phase 6 — Enterprise Security
- ✅ MFA (TOTP majburiy), brute-force himoyasi, parol siyosati
- ✅ RLS, audit hardening, shifrlangan saqlash (hujjatlar, webhook kalitlari, backup)
- ✅ Monitoring va alerting (Prometheus, Grafana, Alertmanager)
- 📄 Penetratsion test — [tekshiruv ro'yxati](security/pentest-checklist.md); mustaqil tashkilot bajaradi
- 📄 Disaster Recovery — [tartib](deployment/disaster-recovery.md); mashq tashkilot tomonidan
- ⬜ Tugunlararo mTLS sertifikatlarini avtomatik boshqarish

## Phase 7 — Pilot Deployment
- 📄 [Pilot rejasi](deployment/pilot-plan.md): bitta tuman, test ma'lumotlari, UAT, AI ekspert bahosi, yuklama testi, xavfsizlik auditi

## Phase 8 — Scaling
- ⬜ Viloyat tugunlarini qo'shish (pilot natijalariga ko'ra)
- ⬜ Respublika integratsiyalari (rasmiy ruxsat va texnik shartlar asosida)
- ⬜ Kubernetes manifestlari va yuqori mavjudlik (yuklama talablari aniqlangach)

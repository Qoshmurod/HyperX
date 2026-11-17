# Tahdidlar modeli (STRIDE)

Himoya qilinadigan aktivlar: davlat ma'lumotlari (topshiriqlar, KPI, hujjatlar), foydalanuvchi
hisoblari, audit jurnali, AI xulosalari, tugunlararo sinxronizatsiya kanali, shifrlash kalitlari.

| # | Tahdid | Turi | Choralar (kodda) | Qoldiq xavf / tashkiliy chora |
|---|---|---|---|---|
| T1 | Parolni topish, o'g'irlangan parol | Spoofing | Keycloak MFA (TOTP) majburiy, brute-force bloki, parol siyosati | Fishing — xodimlarni o'qitish |
| T2 | Sessiya/tokenni o'g'irlash (XSS) | Spoofing | Tokenlar faqat serverda, shifrlangan httpOnly cookie, CSP, React avtomatik escaping | — |
| T3 | Boshqa hudud ma'lumotini ko'rish (IDOR) | Info disclosure | RBAC+ABAC, PostgreSQL RLS, doiradan tashqari — 404, integratsion testlar | Yangi jadval — RLS bilan birga qo'shish majburiy (CONTRIBUTING) |
| T4 | Huquqni o'zi oshirishi | Elevation | Grant berishda hudud/daraja/ruxsatlar tekshiruvi, imtiyozli rollar faqat super admin | Super admin hisoblari soni minimal, alohida nazorat |
| T5 | Audit izini o'chirish | Repudiation/Tampering | Append-only trigger, xesh-zanjir, ilova o'qiy olmaydi, verify_chain, backup | DB superuser — ikki kishilik nazorat, zanjir oxirgi xeshini tashqariga muntazam yozish |
| T6 | SQL injection | Tampering | Faqat parametrlangan so'rovlar, AI uchun so'rovlar katalogi | — |
| T7 | Prompt injection (hujjat orqali) | Tampering | Ajratilgan `<document>` bloklar, shubhali parchalar filtri, AI harakat bajarmaydi | Yangi hujum usullari — model baholash to'plamini yangilab borish |
| T8 | Maxfiy ma'lumotning bulutga chiqishi | Info disclosure | Router: `confidential`+ faqat lokal; markaziyga PII niqoblash | Markaziy model operatori bilan shartnoma |
| T9 | AI "gallyutsinatsiyasi" qaror sifatida | Integrity | Har javobda manba, model, ishonchlilik; qaror faqat inson tasdig'i bilan, to'rt ko'z | Ekspert baholash (pilot) |
| T10 | Soxta tugun hodisalari | Spoofing/Tampering | Tugun tokeni (xesh), hudud va daraja tekshiruvi, egalik qoidalari | mTLS/VPN tarmoq darajasida |
| T11 | Sync orqali ma'lumotni ustidan yozish | Tampering | Versiyalar, konflikt jadvali, last-write-wins yo'q | Konfliktlarni o'z vaqtida ko'rib chiqish (alert bor) |
| T12 | Webhook orqali SSRF | Info disclosure | URL tekshiruvi, metadata/loopback taqiqi, allowlist, redirect kuzatilmaydi | DNS rebinding — allowlist ishlatish tavsiya |
| T13 | Xizmatni to'xtatish | DoS | Nginx rate limit, Nest throttler, fayl hajmi chegaralari, AI timeout | Tarmoq darajasidagi DDoS himoyasi |
| T14 | Saqlangan fayl yoki backup o'g'irlanishi | Info disclosure | AES-256-GCM (fayllar), shifrlangan backup | Kalitlarni alohida saqlash (HSM/secrets manager) |
| T15 | Ichki xodim tomonidan ortiqcha eksport | Info disclosure | Eksport va yuklab olishlar auditi, `reports.export` alohida ruxsat | Audit jurnalini muntazam ko'rib chiqish |
| T16 | Ta'minot zanjiri (paketlar) | Tampering | Lockfile, CI, gitleaks | Dependabot/SBOM, imzolangan image'lar |

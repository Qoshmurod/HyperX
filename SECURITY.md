# Xavfsizlik siyosati

## Zaiflikni xabar qilish

Zaiflik topsangiz, uni ochiq issue sifatida **joylamang**. GitHub'dagi "Report a vulnerability"
(Security Advisories) orqali yopiq xabar yuboring: ta'sirlangan komponent, takrorlash qadamlari va
ehtimoliy ta'sir. Qabul qilinganini 3 ish kuni ichida tasdiqlaymiz.

## Amalga oshirilgan himoya choralari

**Autentifikatsiya va sessiya**
- Keycloak OIDC, Authorization Code + PKCE (S256); TOTP (MFA) barcha foydalanuvchilar uchun majburiy.
- Brute-force himoyasi, 12+ belgili parol siyosati, 5 daqiqalik access token, refresh token rotatsiyasi.
- Web BFF: tokenlar faqat serverda, shifrlangan (A256GCM) httpOnly cookie'da; brauzer JavaScript'i
  tokenni ko'rmaydi.

**Vakolat (RBAC + ABAC)**
- Deny by default: har bir endpoint autentifikatsiya va ruxsat talab qiladi.
- Har bir rol aniq hudud (ltree yo'li), maxfiylik darajasi va amal qilish muddati bilan beriladi;
  grantlar bir-biri bilan aralashtirilmaydi.
- PostgreSQL Row-Level Security: ilova `govmind_app` roli bilan ulanadi (jadval egasi emas,
  `BYPASSRLS` yo'q); doira har bir tranzaksiyada `SET LOCAL app.grants` bilan beriladi.
- Huquqni oshirishdan himoya: o'zingizda yo'q ruxsat, maxfiylik darajasi yoki hududni boshqaga
  berib bo'lmaydi; `super_admin`/`republic_admin` ni faqat super admin beradi.
- Doiradan tashqaridagi resurs uchun `404` (mavjudligi oshkor qilinmaydi).

**Audit**
- `audit.audit_events` append-only: UPDATE/DELETE/TRUNCATE triggerlar bilan rad etiladi (egasi uchun ham).
- SHA-256 xesh-zanjir, `audit.verify_chain()`; ilova faqat yoza oladi, o'qish — alohida auditor roli.
- Kirish/chiqish, ko'rish, o'zgartirish, eksport, yuklab olish, ruxsat o'zgarishi, AI so'rovlari,
  qaror tasdiqlari qayd etiladi.

**AI xavfsizligi**
- Lokal model ishlamasa, `confidential`/`secret` ma'lumot markaziy modelga yuborilmaydi.
- Markaziy modelga yuboriladigan matndan JShShIR, pasport, telefon, email, karta raqami niqoblanadi.
- AI SQL yozmaydi: faqat oldindan belgilangan read-only so'rovlar katalogi.
- RAG filtri serverda, foydalanuvchi grantlaridan quriladi; qaytgan hujjatlar DB'da qayta tekshiriladi.
- Prompt injection: hujjat parchalari ajratilgan blokda beriladi, shubhali parchalar modelga berilmaydi.
- Har bir AI javobi model nomi, versiyasi, ishlash muhiti va manbalari bilan saqlanadi.

**Ma'lumotlarni himoya qilish**
- Hujjatlar ilova darajasida AES-256-GCM bilan shifrlanib saqlanadi, yuklab olishda SHA-256 tekshiriladi.
- Webhook imzo kalitlari shifrlangan; API va tugun kalitlarining faqat xeshi saqlanadi.
- Zaxira nusxalar shifrlangan; tiklash sinovi audit zanjirini ham tekshiradi.

**Tarmoq va platforma**
- Nginx: TLS 1.2/1.3, HSTS, CSP, so'rovlar chegarasi; Keycloak admin konsoli faqat ichki tarmoqdan.
- Ichki servislar (`postgres`, `qdrant`, `ai-engine`, ...) tashqi tarmoqqa chiqmaydigan `internal` tarmoqda.
- Webhook SSRF himoyasi (metadata/loopback manzillar taqiqlangan, ixtiyoriy allowlist).
- CI'da gitleaks bilan maxfiy kalitlarni qidirish.

## Tashkilot tomonidan bajariladigan choralar

- Mustaqil penetratsion test: [docs/security/pentest-checklist.md](docs/security/pentest-checklist.md)
- Tahdidlar modeli: [docs/security/threat-model.md](docs/security/threat-model.md)
- Falokatdan tiklash mashqi: [docs/deployment/disaster-recovery.md](docs/deployment/disaster-recovery.md)
- Davlat ma'lumotlarini saqlash va uzatish qoidalarini vakolatli organ bilan tasdiqlash.

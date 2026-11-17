# Xavfsizlik siyosati

## Zaiflikni xabar qilish

Zaiflik topsangiz, uni ochiq issue sifatida **joylamang**. GitHub'dagi
"Report a vulnerability" (Security Advisories) orqali yopiq xabar yuboring.
Xabarda: ta'sirlangan komponent, takrorlash qadamlari va ehtimoliy ta'sir.

Qabul qilinganini 3 ish kuni ichida tasdiqlaymiz.

## Asosiy qoidalar

- **Deny by default.** Har bir API endpoint autentifikatsiya va ruxsat talab qiladi; ochiq
  endpointlar (`/health`) aniq belgilanadi.
- **RBAC + ABAC.** Rol + hudud (ltree yo'li) + maxfiylik darajasi + amal qilish muddati.
  Tekshiruv backendda (`apps/api/src/common/auth/access-policy.ts`) va qo'shimcha ravishda
  PostgreSQL RLS darajasida bajariladi.
- **Ma'lumotlar bazasi.** Ilova `govmind_app` roli bilan ulanadi: u jadval egasi emas,
  `BYPASSRLS` huquqi yo'q. Vakolat doirasi har bir tranzaksiyada `SET LOCAL app.scope_path`
  orqali beriladi; o'rnatilmasa hech narsa ko'rinmaydi.
- **Audit.** `audit.audit_events` append-only: UPDATE/DELETE/TRUNCATE trigger orqali rad etiladi,
  yozuvlar SHA-256 xesh-zanjir bilan bog'langan (`audit.verify_chain()`).
- **AI.** Lokal model ishlamasa, maxfiy (`confidential`, `secret`) ma'lumot markaziy modelga
  yuborilmaydi. Hujjat matni hech qachon tizim ko'rsatmalaridan ustun turmaydi.
  AI cheklanmagan SQL bajarmaydi.
- **Maxfiy ma'lumotlar.** `.env`, parollar, kalitlar, haqiqiy davlat ma'lumotlari va maxfiy
  hujjatlar repository'ga yuklanmaydi. CI'da gitleaks tekshiruvi ishlaydi.
- **Tarmoq.** Docker Compose'da portlar faqat `127.0.0.1` ga ochiladi; `ai-engine` faqat ichki
  tarmoqda.

## Rejadagi choralar

MFA, mTLS (tugunlararo sync), secrets manager, zaxira nusxalarni shifrlash, rate limiting,
brute-force himoyasi, penetratsion test, incident response tartibi — [ROADMAP](docs/ROADMAP.md).

# Keycloak

- `import-prod/govmind-realm.json` — production realm: foydalanuvchilarsiz, MFA (TOTP) majburiy,
  brute-force himoyasi, kuchli parol siyosati, PKCE (S256), qisqa muddatli access token (5 daqiqa).
- `import-demo/govmind-realm.json` — xuddi shu realm + seed'dagi demo foydalanuvchilar
  (ID'lari `database/seeds/0002_demo_users_and_data.sql` bilan mos). Faqat ishlab chiqish uchun.

Realm fayllaridagi `${GOVMIND_WEB_CLIENT_SECRET}`, `${GOVMIND_WEB_BASE_URL}`, `${GOVMIND_DEMO_PASSWORD}`
qiymatlari Keycloak import paytida muhit o'zgaruvchilaridan olinadi.

Yangi xodim qo'shish tartibi:
1. Keycloak'da foydalanuvchi yaratiladi (login = GovMind'dagi `username`).
2. GovMind'da "Xodimlar" bo'limida xuddi shu login bilan xodim yaratiladi va rol beriladi.
3. Xodim birinchi kirishda TOTP'ni sozlaydi; hisob avtomatik bog'lanadi.

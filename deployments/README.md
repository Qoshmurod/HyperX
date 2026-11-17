# Tugun profillari

Barcha tugunlar bitta `docker-compose.yml` dan foydalanadi; farq — `.env` qiymatlarida.

| Profil | Papka | `GOVMIND_NODE_ROLE` | Yuqori tugun | AI |
|---|---|---|---|---|
| Tuman tuguni | `local-node/` | `local` | viloyat | lokal Ollama, offline |
| Viloyat tuguni | `regional-node/` | `regional` | markaz | lokal Ollama |
| Markaziy bulut | `central-cloud/` | `central` | — | vLLM (markaziy) + lokal |
| Ishlab chiqish | `dev/` | `regional` | — | ixtiyoriy |

Ishga tushirish (masalan, tuman):

```bash
cp deployments/local-node/env.example .env
```

```bash
docker compose --profile ai --profile edge --profile backup --profile monitoring up -d --build
```

Tugunni yuqori tugunga ulash:

1. Yuqori tugunda (viloyat) administrator **Sinxronizatsiya → Tugunni ro'yxatdan o'tkazish** orqali
   tuman tugunini qo'shadi va bir martalik tokenni oladi.
2. Tuman tugunining `.env` faylida `UPSTREAM_SYNC_URL` va `UPSTREAM_SYNC_TOKEN` to'ldiriladi.
3. Tugunlararo kanal mTLS yoki VPN orqali o'tishi kerak (tarmoq darajasida).

Internet uzilganda tuman tuguni to'liq ishlashda davom etadi: o'zgarishlar `sync.sync_events`
navbatida qoladi va aloqa tiklanganda yuboriladi.

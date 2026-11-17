# ADR-0003: Sinxronizatsiyada "last write wins" ishlatilmaydi

- Holat: qabul qilingan
- Sana: 2026-11-17

## Kontekst

Tugunlar internetsiz ishlaydi va keyin sinxronlanadi. Bir yozuv ikki joyda o'zgarishi mumkin.
Davlat ma'lumotini jimgina ustidan yozib yuborish qabul qilinmaydi.

## Qaror

- Har bir yozuvda `version`; har bir hodisa `base_version` ni olib yuradi.
- Har bir ma'lumot turi uchun asosiy yozuvchi daraja (`sync.ownership_rules`).
- Versiya mos kelmasa — `sync.conflicts` ga yoziladi va mas'ul xodim qo'lda hal qiladi.
- Idempotentlik: `sync.inbox_events.event_id` PRIMARY KEY.

## Oqibatlar

- Konfliktlarni ko'rib chiqish uchun UI va `sync.resolve` ruxsati kerak.
- Ko'pchilik ma'lumot turlari bitta egaga ega bo'lgani uchun konfliktlar kam bo'lishi kutiladi.

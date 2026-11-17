# ADR-0004: RLS foydalanuvchi grantlari ro'yxati bilan

- Holat: qabul qilingan
- Sana: 2026-11-17

## Kontekst
Foydalanuvchi bir nechta hududda turli rollar va turli maxfiylik darajalari bilan ishlashi mumkin
(masalan, tuman A'da `confidential`, tuman B'da `internal`). Bitta "hudud + daraja" sozlamasi
grantlarni aralashtirib yuborardi.

## Qaror
API har bir tranzaksiyada endpoint uchun kerakli ruxsatga ega amaldagi grantlarni
`app.grants` (JSON: `[{p: hudud_yo'li, c: daraja}]`) sifatida o'rnatadi. RLS siyosatlari
`app.visible(org_id, classification)` orqali har bir grantni alohida baholaydi. Hisobot va
qaror dalillari uchun doira tashkilot hududi bilan qo'shimcha toraytiriladi (`scopedTo`).

## Oqibatlar
- Grantlar aralashmaydi; testlar bilan tasdiqlangan.
- Ilova kodi xato qilsa ham ma'lumot bazasi darajasida himoya saqlanadi.
- RLS funksiyasi har bir qator uchun chaqiriladi — katta hajmda indeks va partitioning talab etiladi.

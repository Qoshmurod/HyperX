# Pilot rejasi (bitta tuman)

**Maqsad:** platformani haqiqiy ish jarayonida, cheklangan doirada sinash va SLO'larni belgilash.
**Davomiylik:** 8–12 hafta. **Ishtirokchilar:** tuman hokimligi (rahbar, 2–3 analitik,
10–20 xodim), viloyat kuzatuvchisi, xavfsizlik bo'yicha mas'ul, loyiha jamoasi.

## Bosqichlar

| Hafta | Ish | Natija |
|---|---|---|
| 0 | Mustaqil pentest (staging), kritik topilmalarni yopish | Pentest hisoboti |
| 1 | O'rnatish (tuman tuguni), Keycloak hisoblari, rollar, MFA | Ishga tushirish dalolatnomasi |
| 1–2 | Test ma'lumotlari: o'tgan davr topshiriqlari va KPI'lari (anonimlashtirilgan) importi | Import hisoboti |
| 2–3 | O'qitish (rahbar, analitik, xodim, administrator) | Ishtirokchilar ro'yxati |
| 3–8 | Parallel ishlash: amaldagi tartib + GovMind | Haftalik qayd |
| 4, 8 | UAT ssenariylari (quyida) | UAT protokoli |
| 4–8 | AI javoblarini ekspertlar baholashi | Baholash jadvali |
| 6 | Yuklama testi, internet uzilishi mashqi, tiklash mashqi | Test hisobotlari |
| 9–10 | Xulosa: SLO, takomillashtirishlar, kengaytirish qarori | Pilot hisoboti |

## UAT ssenariylari (namunalar)
1. Rahbar topshiriq yaratadi, mas'ul biriktiradi, xodim bildirishnoma oladi va bajaradi.
2. Analitik oylik KPI natijalarini import qiladi; rejadan ortda qolgan ko'rsatkich bo'yicha ogohlantirish keladi.
3. Rahbar "Oxirgi chorakda qaysi tashkilotlarda topshiriqlar kechikkan?" deb so'raydi; javob manba bilan chiqadi.
4. Analitik qaror loyihasi tayyorlaydi; boshqa rahbar variantni tanlab tasdiqlaydi.
5. Choraklik hisobot tayyorlanadi, tasdiqlanadi va PDF (o'zbek kirill) va XLSX (rus) da eksport qilinadi.
6. Auditor kun davomidagi harakatlarni ko'rib chiqadi va jurnal butunligini tekshiradi.
7. Internet 4 soatga uziladi: ish davom etadi; ulanish tiklangach navbat yuboriladi.

## AI baholash
Har hafta 30–50 ta haqiqiy savol (shaxsiy ma'lumotsiz) ekspertlar tomonidan 4 mezon bo'yicha
baholanadi: to'g'rilik, manbaga mosligi, to'liqlik, til sifati (1–5). Maqsad: to'g'rilik va
manbaga moslik bo'yicha o'rtacha ≥ 4,5; noto'g'ri javoblar tahlil qilinib, katalog va shablonlar
yangilanadi.

## Muvaffaqiyat mezonlari
- Hududlararo ma'lumot sizishi — 0 holat.
- Audit jurnali butun; barcha muhim harakatlar qayd etilgan.
- Offline mashqda ma'lumot yo'qolishi yo'q, takroriy qo'llash yo'q.
- Foydalanuvchilar so'rovnomasida qoniqish ≥ 4 (5 balldan).
- Pentest va xavfsizlik auditida ochiq kritik/yuqori topilma yo'q.

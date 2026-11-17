# Administrator uchun qo'llanma

## Hududlar va tashkilotlar
- **Tashkilotlar → Yangi hudud**: viloyat respublika ostida, tuman viloyat ostida yaratiladi.
  "Yo'l yorlig'i" — lotin kichik harflarda qisqa nom (masalan `chirchiq`).
- **Yangi tashkilot**: hudud, nom, kod va tur. Tashkilot sahifasida bo'limlar qo'shiladi.

## Xodimlar
1. Keycloak'da foydalanuvchi yarating (login).
2. GovMind'da **Xodimlar → Yangi xodim**: xuddi shu login, F.I.Sh., tashkilot.
3. Xodim sahifasida **Rol berish**: rol, hudud, maxfiylik darajasi, ixtiyoriy muddat.
4. Xodim birinchi kirganda hisob avtomatik bog'lanadi ("Birinchi kirish kutilmoqda" belgisi yo'qoladi).

Siz faqat o'z hududingiz doirasida va o'zingizdagi ruxsatlar/maxfiylik darajasidan oshmagan rol
bera olasiz. Super Admin va Respublika Admin rollarini faqat Super Admin beradi.
Xodim ketganda holatini "O'chirilgan" qiling — tarix va audit saqlanib qoladi.

## Integratsiyalar
- **API mijoz**: tashqi tizim uchun kalit. Kalit faqat bir marta ko'rsatiladi; ruxsatlar
  (`tasks.read` va h.k.) va maxfiylik darajasi cheklanadi. Kerak bo'lmasa — bekor qiling.
- **Webhook**: https manzil va hodisalar. Imzo kaliti bir marta ko'rsatiladi; qabul qiluvchi
  `X-GovMind-Signature` ni tekshirishi kerak ([API.md](../API.md)).
- **Integratsiya xatolari** blokida so'nggi 24 soatdagi muammolar ko'rinadi.

## Sinxronizatsiya
- Holat: yuborilishi kutilayotgan hodisalar, xatolar, konfliktlar, oxirgi aloqa.
- **Konflikt**: ikki tugunda bir yozuv turlicha o'zgargan. Ikkala versiyani solishtirib,
  izoh bilan lokal yoki kelgan versiyani tanlang — natija boshqa tugunlarga tarqaladi.
- **Tugunni ro'yxatdan o'tkazish**: quyi tugun uchun bir martalik token (faqat bir marta ko'rsatiladi).

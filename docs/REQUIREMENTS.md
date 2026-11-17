# GovMind AI — Funksional texnik topshiriq

## 1. Foydalanuvchilar va vakolatlar

| Foydalanuvchi | Vakolati |
|---|---|
| Super Admin | Butun platformani boshqarish |
| Respublika Admin | Respublika miqyosidagi boshqaruv |
| Viloyat Admin | Viloyat va unga qarashli tumanlar |
| Tuman Admin | Tuman tashkilotlarini boshqarish |
| Rahbar | Hisobotlar va tahlillar |
| Analitik | Statistik tahlil va prognoz |
| Xodim | Berilgan vakolatlar doirasida ishlash |
| Auditor | Audit va nazorat |

Har bir foydalanuvchi faqat o'ziga tegishli hudud va vakolatlar doirasidagi ma'lumotlarni ko'radi.

## 2. Modullar

### Modul 01 — Central Administration
- Tashkilotlarni yaratish va boshqarish.
- Hududiy iyerarxiyani shakllantirish (respublika → viloyat → tuman).
- Xodimlar hisoblarini boshqarish.
- Rollar va ruxsatlarni belgilash.
- Tashkilotlararo ma'lumot almashinuvini boshqarish.
- Tizim konfiguratsiyalarini boshqarish.

### Modul 02 — AI Analyst
- Katta hajmdagi ma'lumotlarni tahlil qilish.
- Statistik og'ishlarni aniqlash.
- Ko'rsatkichlarni taqqoslash.
- Muammolarni guruhlash.
- Savollarga tabiiy tilda javob berish.
- Tahlil natijalariga manbalarni biriktirish.

Misol — *"Oxirgi chorakda qaysi tashkilotlarda topshiriqlar bajarilishi kechikkan?"*:
1. Tegishli ma'lumotlarni qidiradi.
2. Tashkilotlar bo'yicha statistikani hisoblaydi.
3. Kechikishlarni aniqlaydi.
4. Oldingi davr bilan taqqoslaydi.
5. Natijani jadval va diagrammada chiqaradi.
6. Har bir xulosaga ma'lumot manbasini ko'rsatadi.

### Modul 03 — Decision Intelligence
- Muammoni aniqlash va ehtimoliy sabablarini tahlil qilish.
- Bir nechta yechim variantlarini taklif qilish.
- Variantlarning kutilayotgan ta'sirini hisoblash.
- Xavf va cheklovlarni ko'rsatish.
- Qaror loyihasini tayyorlash.
- Inson tomonidan tasdiqlash jarayoni.

**AI mustaqil ravishda davlat qarori chiqarmaydi, qaror variantlarini tayyorlaydi.**

### Modul 04 — Performance Monitoring
- KPI ko'rsatkichlarini yaratish.
- Reja va natijalarni taqqoslash.
- Topshiriqlar bajarilishini va muddatlarni nazorat qilish.
- Tashkilotlar faoliyatining dinamikasi.
- Rahbarlar uchun dashboard.
- Og'ishlar haqida ogohlantirish.

KPI ko'rsatkichlari avtomatik ravishda xodimga nisbatan intizomiy xulosa chiqarish uchun ishlatilmaydi.

### Modul 05 — Forecast Engine
- Vaqt qatorlarini tahlil qilish, mavsumiylikni aniqlash.
- Resurslarga ehtiyoj va ish hajmini prognozlash.
- Ssenariylarni modellashtirish.
- Prognoz ishonchliligi va xatolik ko'rsatkichlarini ko'rsatish.

### Modul 06 — Report Intelligence
- Kunlik, haftalik, oylik, choraklik hisobotlar.
- Tashkilotlar kesimidagi va hududlararo taqqoslash hisobotlari.
- PDF, Excel va DOCX eksport.
- AI yordamida matnli izoh.

### Modul 07 — Natural Language Interface
- *"Menga tuman bo'yicha oxirgi oylik hisobotni chiqar."*
- *"Qaysi ko'rsatkichlar rejadan ortda qolmoqda?"*
- *"O'tgan oy va bu oyni taqqosla."*
- *"Topshiriqlar bajarilishining umumiy holatini ko'rsat."*

Dastlab o'zbek tili (lotin va kirill), keyinchalik rus va ingliz tillari.

### Modul 08 — Notification Center
- Telegram, elektron pochta, tizim ichidagi bildirishnomalar.
- Muddat yaqinlashishi, kritik tizim xatolari, AI aniqlagan muammolar haqida xabar.

Bildirishnomalar tashkilot siyosati va foydalanuvchi ruxsatlariga asoslanadi.

### Modul 09 — Audit & Compliance
- Login/logout tarixi.
- Ma'lumotlarni ko'rish va o'zgartirish tarixi.
- Ruxsatlar o'zgarishi.
- AI so'rovlari va natijalari.
- Qaror loyihalari tasdiqlanishi.
- Eksport va yuklab olish hodisalari.
- Administrator harakatlari.

Audit yozuvlari oddiy foydalanuvchilar tomonidan o'zgartirilmaydi yoki o'chirilmaydi.

### Modul 10 — Integration Gateway
- REST API, Webhooks, Import/export (CSV, XLSX, JSON).
- Tashqi tizimlar bilan autentifikatsiyalangan aloqa.
- API versiyalash, integratsiya xatolarini monitoring qilish.

Tashqi davlat tizimlariga ulanish faqat tegishli ruxsat va rasmiy texnik imkoniyatlar mavjud bo'lganda amalga oshiriladi.

## 3. Sifat va qabul qilish mezonlari

| Yo'nalish | Qabul qilish talabi |
|---|---|
| Autentifikatsiya | Ruxsatsiz kirish bloklanadi |
| Multi-tenancy | Hududlararo ma'lumot sizishi yo'q |
| Audit | Muhim harakatlar qayd etiladi |
| Offline | Internet uzilganda lokal asosiy funksiyalar ishlaydi |
| Sync | Takroriy hodisalar ikki marta bajarilmaydi |
| AI | Manbalar va model versiyasi qayd etiladi |
| RAG | Faqat vakolatli hujjatlar topiladi |
| Backup | Tiklash sinovi muvaffaqiyatli o'tadi |
| API | Versiyalangan va hujjatlashtirilgan |
| Monitoring | Xatolar va resurs yuklamasi kuzatiladi |

Aniq javob vaqti, foydalanuvchilar soni, RPO/RTO va mavjudlik foizlari real yuklama talablari
aniqlangach SLO sifatida belgilanadi.

## 4. Muvaffaqiyat shartlari

1. AI faqat ishonchli va ruxsat etilgan ma'lumotlardan foydalanadi.
2. AI xulosalari manbasiz yakuniy fakt sifatida ko'rsatilmaydi.
3. Mahalliy server internet bo'lmaganda asosiy ish jarayonini davom ettiradi.
4. Markaziy va lokal ma'lumotlar sinxronizatsiyasi nazorat qilinadi.
5. Har bir foydalanuvchining vakolati qat'iy chegaralanadi.
6. AI tavsiyalari inson tomonidan ko'rib chiqiladi.
7. Davlat ma'lumotlari uchun maxfiylik, saqlash va uzatish qoidalari alohida tasdiqlanadi.

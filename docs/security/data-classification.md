# Ma'lumotlar klassifikatsiyasi

| Daraja | Kod | Misollar | Kim ko'radi | AI |
|---|---|---|---|---|
| Ochiq | `public` | E'lon qilingan hisobotlar, umumiy statistika | Doiradagi barcha xodimlar | Lokal va markaziy model |
| Xizmat uchun | `internal` | Topshiriqlar, KPI, ichki hisobotlar | Rolida `internal`+ bo'lganlar | Lokal; markaziy — PII niqoblangan holda |
| Maxfiy | `confidential` | Shaxsiy ma'lumotli murojaatlar, kadrlar masalalari | Rolida `confidential`+ | Faqat lokal model |
| O'ta maxfiy | `secret` | Maxsus ro'yxatdagi hujjatlar | Rolida `secret` | Faqat shu darajaga ruxsat berilgan lokal model (standart: yo'q — shablon javob) |

Qoidalar:
- Har bir topshiriq, hujjat, hisobot va qaror loyihasi yaratilishida daraja belgilanadi
  (standart `internal`).
- Foydalanuvchi o'zining eng yuqori darajasidan yuqori yozuvni ko'rmaydi va yarata olmaydi
  (RLS `WITH CHECK`).
- Daraja hudud bilan birga baholanadi: tuman A'da `confidential`, tuman B'da `internal` bo'lgan
  foydalanuvchi tuman B'ning maxfiy yozuvini ko'rmaydi.
- `LOCAL_MODEL_MAX_CLASSIFICATION` lokal modelga beriladigan eng yuqori darajani belgilaydi.
- Haqiqiy davlat ma'lumotlari ishlab chiqish va test muhitlariga ko'chirilmaydi.

Darajalarning tashkilotdagi aniq ro'yxati va saqlash muddatlari vakolatli organ bilan
tasdiqlanadi; yuqoridagi jadval texnik asos.

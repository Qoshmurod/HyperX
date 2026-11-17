# Analitik va xodim uchun qo'llanma

## Xodim
- **Topshiriqlar → Menga biriktirilgan** filtri bilan o'z topshiriqlaringizni ko'ring.
- Muddatga 3 kun va 24 soat qolganda bildirishnoma keladi.
- Ruxsatingiz bo'lsa, holatni "Jarayonda" yoki "Bajarildi" ga o'zgartiring.

## Analitik
- **KPI**: yangi ko'rsatkich yarating (kod, birlik, yo'nalish, davriylik) va natijalarni kiriting.
  Har bir natija uchun **ma'lumot manbasi** majburiy.
- **Prognoz**: KPI sahifasida necha davr oldinga va ixtiyoriy ssenariy (masalan, +10%) ni
  tanlang. Tizim bir nechta usulni sinab, eng aniqini tanlaydi va xatolik (MAE, MAPE) hamda
  80% ishonch oralig'ini ko'rsatadi.
- **Import**: Integratsiyalar → Import. CSV/XLSX/JSON ustunlari:
  - topshiriqlar: `title, description, priority, deadline, classification, assignee_username`
  - KPI: `kpi_code, period_start, planned_value, actual_value, source`
  Xato qatorlar alohida ko'rsatiladi, to'g'ri qatorlar saqlanadi.
- **Hujjatlar**: PDF, DOCX yoki TXT yuklang va maxfiylik darajasini belgilang. Hujjat
  avtomatik indekslanadi va AI yordamchida manba sifatida ishlatiladi.

KPI ko'rsatkichlari xodimlarga nisbatan avtomatik intizomiy xulosa chiqarish uchun ishlatilmaydi.

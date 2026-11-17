-- Egalik qoidalarini aniqlashtirish: asosiy yozuvchi daraja + yuqori darajalar ham yoza oladimi.
-- Masalan, topshiriqni viloyat ham bera oladi (yuqoridan pastga), KPI natijasini esa faqat tuman kiritadi.
-- Bir xil yozuvni ikki daraja parallel o'zgartirsa — versiya orqali konflikt (ustidan yozilmaydi).
BEGIN;
ALTER TABLE sync.ownership_rules ADD COLUMN allow_higher_levels BOOLEAN NOT NULL DEFAULT false;
COMMIT;

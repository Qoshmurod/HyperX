# Hissa qo'shish

## Ish tartibi

1. Har bir vazifa uchun alohida branch: `feature/<modul>-<qisqa-nom>`, `fix/<...>`.
2. O'zgarishlar Pull Request orqali kiritiladi; kamida bitta code review talab qilinadi.
3. CI (typecheck, testlar, build, DB xavfsizlik testlari, gitleaks) yashil bo'lishi shart.
4. Arxitekturaga ta'sir qiluvchi qarorlar `docs/adr/` da yangi ADR sifatida yoziladi.

## Commit xabarlari

[Conventional Commits](https://www.conventionalcommits.org/): `feat(api): ...`, `fix(db): ...`,
`docs: ...`, `test(ai-engine): ...`.

## Lokal tekshiruv

```bash
pnpm install && pnpm typecheck && pnpm test
```

```bash
cd apps/ai-engine && ruff check . && pytest -q
```

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres scripts/test-db.sh
```

## Qoidalar

- Haqiqiy davlat ma'lumotlari, shaxsiy ma'lumotlar va maxfiy hujjatlar hech qachon commit
  qilinmaydi. Seed va testlarda faqat sintetik ma'lumotlar.
- Yangi jadval qo'shilsa — tashkilot/hudud bo'yicha RLS siyosati va testi bilan birga.
- Yangi endpoint — ruxsat (`@RequirePermission`), validatsiya va audit bilan birga.
- Migratsiyalar faqat oldinga yoziladi; birlashtirilgan migratsiya o'zgartirilmaydi.

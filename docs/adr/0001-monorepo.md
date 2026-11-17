# ADR-0001: Monorepo

- Holat: qabul qilingan
- Sana: 2026-11-17

## Kontekst

Frontend, backend, AI servislari, infratuzilma va hujjatlar bir-biriga bog'liq holda o'zgaradi
(masalan, API kontrakti va umumiy turlar). Jamoa kichik, deployment birligi — tugun.

## Qaror

Bitta repository: `apps/` (web, api, ai-engine), `packages/` (umumiy kod), `infrastructure/`,
`deployments/`, `database/`, `docs/`. Node qismi pnpm workspace, Python qismi alohida `pyproject.toml`.

## Oqibatlar

- Kontrakt o'zgarishi bitta PR'da ko'rinadi.
- CI har bir qism uchun alohida job bilan ishlaydi.
- Repository kattalashganda yo'l bo'yicha filtrlangan CI kerak bo'ladi.

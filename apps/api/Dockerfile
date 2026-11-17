FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/i18n/package.json packages/i18n/
RUN pnpm install --frozen-lockfile --filter "@govmind/api..."
COPY packages/i18n packages/i18n
COPY apps/api apps/api
RUN pnpm --filter @govmind/i18n build && pnpm --filter @govmind/api build \
 && pnpm --filter @govmind/api deploy --prod --legacy /out

FROM node:22-alpine
# Hisobotlarda kirill va o'zbek harflari uchun Unicode shrift
RUN apk add --no-cache font-dejavu
WORKDIR /srv
ENV NODE_ENV=production REPORT_FONT=/usr/share/fonts/dejavu/DejaVuSans.ttf
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3001/api/v1/health || exit 1
CMD ["node", "dist/main.js"]

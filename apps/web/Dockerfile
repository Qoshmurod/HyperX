FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/i18n/package.json packages/i18n/
RUN pnpm install --frozen-lockfile --filter "@govmind/web..."
COPY packages/i18n packages/i18n
COPY apps/web apps/web
RUN pnpm --filter @govmind/i18n build && pnpm --filter @govmind/web build

FROM node:22-alpine
WORKDIR /srv
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

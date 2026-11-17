FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @govmind/web
COPY apps/web apps/web
RUN pnpm --filter @govmind/web build

FROM node:22-alpine
WORKDIR /srv
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @govmind/api
COPY apps/api apps/api
RUN pnpm --filter @govmind/api build && pnpm --filter @govmind/api deploy --prod --legacy /out

FROM node:22-alpine
WORKDIR /srv
ENV NODE_ENV=production
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]

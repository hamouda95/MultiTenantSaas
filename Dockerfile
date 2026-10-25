FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]

FROM node:22-bookworm-slim AS web
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# Render defaults to the final stage. Compose still selects api/web explicitly.
FROM api AS render
ENV PORT=10000
COPY --from=build --chown=node:node /app/apps/web/.next/static /app/apps/web/.next/standalone/apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public /app/apps/web/.next/standalone/apps/web/public
EXPOSE 10000
CMD ["node", "scripts/start-render.cjs"]

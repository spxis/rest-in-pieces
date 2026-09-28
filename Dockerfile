FROM node:24-alpine AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @rest-in-pieces/web build
RUN pnpm --filter @rest-in-pieces/api deploy --legacy --prod /out/api
RUN mkdir -p /out/web && cp -R apps/web/dist/. /out/web/

FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=6800
ENV SERVE_WEB=true
ENV WEB_ROOT=/app/web
EXPOSE 6800

COPY --from=build --chown=node:node /out/api/ ./
COPY --from=build --chown=node:node /out/web/ ./web/

USER node
CMD ["node", "src/server.ts"]
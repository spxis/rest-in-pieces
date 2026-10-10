# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.cjs ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

COPY . .
# Chizu (maps) is an optional peer dependency of the package, so `deploy --prod` leaves it out; the image carries it (22 MB, no dependencies of its own) so /maps works.
RUN pnpm --filter @rest-in-pieces/web build \
  && pnpm --filter @johnmorrisdotca/rest-in-pieces build \
  && pnpm --filter @johnmorrisdotca/rest-in-pieces deploy --legacy --prod /out/api \
  && mkdir -p /out/api/node_modules/@johnmorrisdotca \
  && cp -RL apps/api/node_modules/@johnmorrisdotca/chizu /out/api/node_modules/@johnmorrisdotca/chizu \
  && cp -R apps/web/dist /out/web

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=6800 \
    WEB_ROOT=/app/web

COPY --from=build --chown=node:node /out/api ./
COPY --from=build --chown=node:node /out/web ./web

USER node
EXPOSE 6800
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1
CMD ["node", "bin/rest-in-pieces.js", "--host", "0.0.0.0"]

FROM node:20-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app

# ── Builder ──────────────────────────────────────────────
FROM base AS builder
# Copy workspace manifests so pnpm can resolve workspace:* deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/web/package.json    ./packages/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# Copy source files required for the build
COPY packages/shared/src             ./packages/shared/src
COPY packages/web/src                ./packages/web/src
COPY packages/web/index.html         ./packages/web/
COPY packages/web/vite.config.ts     ./packages/web/
COPY packages/web/tailwind.config.ts ./packages/web/
COPY packages/web/postcss.config.js  ./packages/web/
COPY packages/web/tsconfig.json      ./packages/web/
COPY packages/web/components.json    ./packages/web/

# public/ is optional — only copy if it exists
COPY packages/web/publi[c] ./packages/web/public/

ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_APP_NAME=NexRAD
RUN pnpm --filter @nexrad/web build

# ── Development ──────────────────────────────────────────
FROM base AS development
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/web/node_modules ./packages/web/node_modules
COPY packages/web ./packages/web
COPY packages/shared ./packages/shared
EXPOSE 5173
CMD ["pnpm", "--filter", "@nexrad/web", "dev"]

# ── Production (served by nginx) ─────────────────────────
FROM nginx:alpine AS production
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

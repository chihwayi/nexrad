FROM node:20-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

# ── Development ──────────────────────────────────────────
FROM base AS development
COPY package.json ./
RUN pnpm install
COPY . .
EXPOSE 5173
CMD ["pnpm", "dev", "--host"]

# ── Builder ──────────────────────────────────────────────
FROM base AS builder
COPY package.json ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_APP_NAME
RUN pnpm build

# ── Production (served by nginx in docker-compose.prod) ──
FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

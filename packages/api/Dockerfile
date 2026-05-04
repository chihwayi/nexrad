FROM node:20-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

# ── Development ──────────────────────────────────────────
FROM base AS development
COPY package.json ./
RUN pnpm install
COPY . .
EXPOSE 3000
CMD ["pnpm", "dev"]

# ── Builder ──────────────────────────────────────────────
FROM base AS builder
COPY package.json ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ── Production ───────────────────────────────────────────
FROM node:20-alpine AS production
RUN npm install -g pnpm
WORKDIR /app
COPY package.json ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]

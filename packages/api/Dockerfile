FROM node:20-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app

# ── Builder ──────────────────────────────────────────────
FROM base AS builder
# Copy workspace manifests so pnpm can resolve workspace:* deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/api/package.json    ./packages/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# Copy source files required for compilation
COPY packages/shared/src     ./packages/shared/src
COPY packages/api/src        ./packages/api/src
COPY packages/api/tsconfig.json ./packages/api/

RUN pnpm --filter @nexrad/api build

# Create standalone prod deploy: workspace deps bundled, no dev deps
RUN pnpm deploy --filter @nexrad/api --prod /prod

# ── Production ───────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
COPY --from=builder /prod .
EXPOSE 3000
CMD ["node", "dist/server.js"]

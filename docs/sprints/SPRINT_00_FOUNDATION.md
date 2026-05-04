# Sprint 0 — Foundation & DevOps
**Duration:** 3 days | **Goal:** Working monorepo, Docker dev environment, CI passing, lint clean, health check live.

> This sprint produces zero user-visible features. It produces the scaffolding every subsequent sprint builds on. Do NOT skip any step — a broken foundation breaks every sprint after it.

---

## Prerequisites
- Node.js ≥ 20 installed
- pnpm ≥ 9 installed (`npm install -g pnpm`)
- Docker + Docker Compose installed
- Git configured

---

## Task 0.1 — Repository Init

```bash
cd /path/to/nexrad
git init
git add .
git commit -m "chore: initial project scaffold"
```

Create `.github/` branch protection:
- Branch `main` requires PR + CI pass before merge
- Branch `develop` is the integration branch

---

## Task 0.2 — Install Root Dependencies

```bash
# From repo root
pnpm install

# Verify workspaces are recognised
pnpm ls -r --depth 0
# Expected output:
# @nexrad/api   0.1.0
# @nexrad/web   0.1.0
# @nexrad/shared 0.1.0
```

---

## Task 0.3 — Set Up Pre-commit Hooks (Husky + lint-staged)

```bash
pnpm exec husky init
echo "pnpm lint-staged" > .husky/pre-commit
chmod +x .husky/pre-commit
```

Verify: make a change with a lint error, attempt `git commit` — it should be blocked.

---

## Task 0.4 — ESLint Configuration (API)

Create `packages/api/.eslintrc.json`:
```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "env": { "node": true, "es2022": true },
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "no-console": ["warn", { "allow": ["warn", "error", "info"] }]
  }
}
```

---

## Task 0.5 — ESLint Configuration (Web)

Create `packages/web/.eslintrc.json`:
```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint", "react-hooks", "react-refresh"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended"
  ],
  "env": { "browser": true, "es2022": true },
  "rules": {
    "react-refresh/only-export-components": ["warn", { "allowConstantExport": true }],
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  }
}
```

---

## Task 0.6 — Prettier Configuration

Create `.prettierrc` at repo root:
```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "always"
}
```

Create `.prettierignore`:
```
node_modules/
dist/
*.sql
```

---

## Task 0.7 — API Skeleton

### `packages/api/src/config.ts`
```typescript
import 'dotenv/config'

export const config = {
  port: Number(process.env.API_PORT) || 3000,
  host: process.env.API_HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host:     process.env.DB_HOST     || 'localhost',
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || 'radius',
    password: process.env.DB_PASSWORD || 'radiusPassword',
    database: process.env.DB_NAME     || 'radius',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  jwt: {
    secret:              process.env.JWT_SECRET || 'dev-secret',
    expiresIn:           process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret:       process.env.REFRESH_TOKEN_SECRET || 'dev-refresh',
    refreshExpiresIn:    process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  },
  wg: {
    interface:   process.env.WG_INTERFACE   || 'wg0',
    configPath:  process.env.WG_CONFIG_PATH || '/etc/wireguard/wg0.conf',
    serverIp:    process.env.WG_SERVER_IP   || '10.8.0.1',
    subnet:      process.env.WG_SUBNET      || '10.8.0.0/24',
    endpoint:    process.env.WG_SERVER_ENDPOINT || '',
    port:        Number(process.env.WG_PORT) || 51820,
  },
} as const
```

### `packages/api/src/db/mysql.ts`
```typescript
import mysql from 'mysql2/promise'
import { config } from '../config.js'

export const pool = mysql.createPool({
  host:            config.db.host,
  port:            config.db.port,
  user:            config.db.user,
  password:        config.db.password,
  database:        config.db.database,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit:      0,
  timezone:        'Z',
})

export async function query<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const [rows] = await pool.execute(sql, params)
  return rows as T[]
}

export async function queryOne<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}
```

### `packages/api/src/db/redis.ts`
```typescript
import { createClient } from 'redis'
import { config } from '../config.js'

export const redis = createClient({ url: config.redis.url })

redis.on('error', (err) => console.error('Redis error:', err))

export async function connectRedis() {
  await redis.connect()
  console.info('Redis connected')
}
```

### `packages/api/src/app.ts`
```typescript
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { config } from './config.js'

export async function buildApp() {
  const app = Fastify({
    logger: config.nodeEnv !== 'test',
    trustProxy: true,
  })

  await app.register(helmet)
  await app.register(cors, {
    origin: config.nodeEnv === 'production' ? process.env.APP_URL : true,
    credentials: true,
  })
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
  }))

  return app
}
```

### `packages/api/src/server.ts`
```typescript
import { buildApp } from './app.js'
import { connectRedis } from './db/redis.js'
import { pool } from './db/mysql.js'
import { config } from './config.js'

async function start() {
  try {
    // Test DB connection
    await pool.query('SELECT 1')
    console.info('MySQL connected')

    await connectRedis()

    const app = await buildApp()
    await app.listen({ port: config.port, host: config.host })
    console.info(`API listening on http://${config.host}:${config.port}`)
  } catch (err) {
    console.error('Fatal startup error:', err)
    process.exit(1)
  }
}

start()
```

---

## Task 0.8 — Web Skeleton

### `packages/web/src/main.tsx`
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

### `packages/web/src/App.tsx`
```tsx
export default function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-bold text-primary">NexRAD</h1>
        <p className="text-muted-foreground">Modern RADIUS Management Platform</p>
        <span className="badge-online">Sprint 0 — Foundation ✓</span>
      </div>
    </div>
  )
}
```

### `packages/web/index.html`
```html
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>NexRAD</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

## Task 0.9 — Docker Dev Environment

```bash
# Copy env
cp .env.example .env

# Start stack
pnpm docker:dev

# Verify
curl http://localhost:3000/health
# Expected: { "status": "ok", "timestamp": "...", "version": "0.1.0" }

curl http://localhost:5173
# Expected: NexRAD HTML page loads
```

---

## Task 0.10 — Scripts

### `scripts/setup.sh`
```bash
#!/usr/bin/env bash
set -e
echo "Setting up NexRAD..."
cp -n .env.example .env || true
pnpm install
echo "Setup complete. Run: pnpm docker:dev"
```

### `scripts/migrate.sh`
```bash
#!/usr/bin/env bash
set -e
source .env
echo "Running migrations..."
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
  < packages/api/src/db/migrations/001_freeradius_compat.sql
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
  < packages/api/src/db/migrations/002_nexrad_tables.sql
echo "Migrations complete."
```

```bash
chmod +x scripts/setup.sh scripts/migrate.sh
```

---

## Sprint 0 Sign-Off Checklist

Before marking Sprint 0 complete, every item must be ✓:

- [ ] `pnpm install` completes with no errors
- [ ] `pnpm lint` exits 0 in all packages
- [ ] `pnpm format:check` exits 0
- [ ] `pnpm typecheck` exits 0 in all packages
- [ ] `pnpm build` produces `dist/` in all packages
- [ ] `pnpm docker:dev` starts all 4 containers (api, web, mysql, redis)
- [ ] `GET /health` returns `{ "status": "ok" }`
- [ ] `http://localhost:5173` loads without console errors
- [ ] Pre-commit hook blocks a commit with a lint error
- [ ] GitHub Actions CI workflow file is valid YAML (use `act` or push to GitHub to verify)
- [ ] `git log --oneline` shows a clean commit history

**CI must be green before Sprint 1 begins.**

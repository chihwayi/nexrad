# Sprint 10 — Polish, Security Hardening & Launch Prep

**Duration:** 4 days | **Goal:** Security audit, performance tuning, real app icons, email notifications, error boundaries, SMTP integration, documentation, Docker production hardening, and final launch checklist.

> After this sprint: NexRAD is production-ready. You can deploy it, hand it to real users, and open-source it with confidence.

---

## Prerequisites

- Sprint 0–9 sign-off checklists all ✓
- SMTP credentials available (Mailgun, SendGrid, or self-hosted)
- Production server with Docker Compose
- Domain name pointed to server
- SSL certificate (Certbot/Let's Encrypt or existing)

---

## Task 10.1 — Security Audit Checklist

Before writing any new code, audit the following:

### API Security

```bash
# Run these checks manually or in CI:

# 1. Verify no raw SQL concatenation (potential injection)
grep -rn "query(\`.*\${" packages/api/src/ | grep -v "//.*\${"
# Every result must use parameterized queries — fix any found

# 2. Verify all routes have authentication
grep -rn "app\.get\|app\.post\|app\.patch\|app\.delete" packages/api/src/modules/ | grep -v "preHandler\|addHook"
# Every result without auth should be intentional (health, public)

# 3. Verify bcrypt is used (not MD5 or plain)
grep -rn "md5\|sha1.*password\|plain.*password" packages/api/src/ | grep -iv "//.*comment"
# Should return empty

# 4. Verify JWT secrets are not defaults in prod
grep -rn "dev-secret\|dev-refresh" packages/api/src/config.ts
# These should only be fallbacks — production .env must override them
```

### Fixes to apply from audit:

#### Add rate limiting to auth routes specifically:

```typescript
// In packages/api/src/modules/auth/auth.routes.ts
// Add tighter rate limit for login endpoint:
app.post(
  '/auth/login',
  {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  },
  async (req, reply) => {
    // ... existing handler
  }
)
```

#### Add Zod validation to all remaining routes:

```typescript
// Any route accepting req.body without Zod parse must be fixed
// Pattern: const body = SchemaName.parse(req.body)
// If schema doesn't exist, create it
```

#### Add request ID to all logs:

```typescript
// In packages/api/src/app.ts, add to Fastify options:
const app = Fastify({
  logger: config.nodeEnv !== 'test',
  trustProxy: true,
  genReqId: () => crypto.randomUUID(),
})
```

---

## Task 10.2 — SMTP Email Service

### Install nodemailer types:

```bash
cd packages/api && pnpm add -D @types/nodemailer
```

### `packages/api/src/services/email.service.ts`

```typescript
import nodemailer from 'nodemailer'
import { config } from '../config.js'

let transporter: nodemailer.Transporter | null = null

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
    })
  }
  return transporter
}

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
  if (!config.smtp.host) {
    console.warn('SMTP not configured — skipping email send')
    return
  }

  await getTransporter().sendMail({
    from: config.smtp.from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text ?? opts.html.replace(/<[^>]+>/g, ''),
  })
}

export async function sendWelcomeEmail(opts: {
  to: string
  username: string
  orgName: string
  loginUrl: string
}) {
  await sendEmail({
    to: opts.to,
    subject: `Welcome to ${opts.orgName} — NexRAD`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
        <div style="background: #6366f1; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">NexRAD</h1>
        </div>
        <div style="background: #f9fafb; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
          <h2 style="color: #111827; margin-top: 0;">Welcome to ${opts.orgName}</h2>
          <p style="color: #374151;">Your account has been created.</p>
          <p style="color: #374151;"><strong>Username:</strong> ${opts.username}</p>
          <div style="margin: 24px 0;">
            <a href="${opts.loginUrl}"
               style="background: #6366f1; color: white; padding: 12px 24px; border-radius: 6px;
                      text-decoration: none; font-weight: 600;">
              Log In to NexRAD
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">
            If you did not expect this email, please ignore it.
          </p>
        </div>
      </div>
    `,
  })
}

export async function sendTokenBatchEmail(opts: {
  to: string
  orgName: string
  batchId: string
  count: number
  planName: string
  printUrl: string
}) {
  await sendEmail({
    to: opts.to,
    subject: `${opts.count} ${opts.planName} tokens generated — ${opts.orgName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
        <div style="background: #6366f1; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">NexRAD</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <h2 style="color: #111827; margin-top: 0;">Tokens Generated</h2>
          <p style="color: #374151;">
            <strong>${opts.count}</strong> tokens for plan <strong>${opts.planName}</strong>
            have been generated (Batch ID: <code>${opts.batchId.slice(0, 8)}…</code>).
          </p>
          <div style="margin: 24px 0;">
            <a href="${opts.printUrl}"
               style="background: #6366f1; color: white; padding: 12px 24px; border-radius: 6px;
                      text-decoration: none; font-weight: 600;">
              Print Vouchers (PDF)
            </a>
          </div>
        </div>
      </div>
    `,
  })
}
```

### Add SMTP config to `packages/api/src/config.ts`:

```typescript
// Add to config object:
smtp: {
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT) || 587,
  user: process.env.SMTP_USER || '',
  password: process.env.SMTP_PASSWORD || '',
  from: process.env.SMTP_FROM || 'noreply@nexrad.app',
},
```

### Add to `.env.example`:

```
# SMTP (optional — leave blank to disable email)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@yourdomain.com
```

---

## Task 10.3 — Frontend Error Boundary

### `packages/web/src/components/ErrorBoundary.tsx`

```tsx
import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from './ui/button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-8 text-center">
          <div className="p-4 bg-destructive/10 rounded-full">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
            <p className="text-muted-foreground text-sm mt-1 max-w-sm">
              {this.state.error?.message ?? 'An unexpected error occurred'}
            </p>
          </div>
          <Button
            onClick={() => {
              this.setState({ hasError: false, error: null })
              window.location.reload()
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reload Page
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
```

### Wrap every page in AppShell with ErrorBoundary:

```tsx
// In packages/web/src/components/AppShell.tsx, wrap children:
import { ErrorBoundary } from './ErrorBoundary'

// Inside the main content area:
;<ErrorBoundary>{children}</ErrorBoundary>
```

---

## Task 10.4 — Loading Skeleton Improvements

### `packages/web/src/components/PageSkeleton.tsx`

```tsx
export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Page header skeleton */}
      <div className="flex justify-between items-center">
        <div>
          <div className="h-7 w-48 bg-muted rounded-lg mb-2" />
          <div className="h-4 w-64 bg-muted/60 rounded" />
        </div>
        <div className="h-9 w-32 bg-muted rounded-lg" />
      </div>
      {/* KPI grid skeleton */}
      <div className="kpi-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="kpi-card h-24 bg-muted/40" />
        ))}
      </div>
      {/* Table skeleton */}
      <div className="space-y-2">
        <div className="h-10 bg-muted/40 rounded-lg" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-muted/20 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
```

### Wrap pages with Suspense fallback — update `packages/web/src/App.tsx`:

```tsx
import { Suspense, lazy } from 'react'
import { PageSkeleton } from './components/PageSkeleton'

// Use lazy loading for all page imports:
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Branches = lazy(() => import('./pages/Branches'))
const Tokens = lazy(() => import('./pages/Tokens'))
const Reports = lazy(() => import('./pages/Reports'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Plans = lazy(() => import('./pages/Plans'))
const Users = lazy(() => import('./pages/Users'))
const AuditLog = lazy(() => import('./pages/AuditLog'))
const Tenants = lazy(() => import('./pages/Tenants'))
const OrgSettings = lazy(() => import('./pages/OrgSettings'))
const QuickToken = lazy(() => import('./pages/QuickToken'))

// Wrap Routes in Suspense:
<Suspense fallback={<div className="p-6"><PageSkeleton /></div>}>
  <Routes>
    {/* ... all routes ... */}
  </Routes>
</Suspense>
```

---

## Task 10.5 — Nginx Production Config

### `docker/nginx/default.conf`

```nginx
upstream nexrad_api {
  server api:3000;
  keepalive 32;
}

server {
  listen 80;
  server_name _;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name _;

  ssl_certificate /etc/nginx/ssl/fullchain.pem;
  ssl_certificate_key /etc/nginx/ssl/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
  ssl_prefer_server_ciphers off;
  ssl_session_cache shared:SSL:10m;

  # Security headers
  add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

  # Gzip
  gzip on;
  gzip_vary on;
  gzip_min_length 1000;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;

  # Frontend static files
  root /usr/share/nginx/html;
  index index.html;

  # Service worker — no cache
  location = /sw.js {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    add_header Pragma "no-cache";
  }

  # Static assets — long cache
  location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webmanifest)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # API proxy
  location /api/ {
    proxy_pass http://nexrad_api;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;
    client_max_body_size 10M;
  }

  # WebSocket proxy (Socket.io)
  location /socket.io/ {
    proxy_pass http://nexrad_api;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_cache_bypass $http_upgrade;
  }

  # SPA fallback — React Router
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

---

## Task 10.6 — Production Docker Compose Finalization

### Update `docker-compose.prod.yml` — complete version:

```yaml
version: '3.9'

services:
  mysql:
    image: mysql:8.0
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
      MYSQL_DATABASE: ${DB_NAME}
      MYSQL_USER: ${DB_USER}
      MYSQL_PASSWORD: ${DB_PASSWORD}
    volumes:
      - mysql_data:/var/lib/mysql
      - ./packages/api/src/db/migrations:/docker-entrypoint-initdb.d:ro
    command: >
      --character-set-server=utf8mb4
      --collation-server=utf8mb4_unicode_ci
      --sql-mode=STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION
    healthcheck:
      test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost', '-u${DB_USER}', '-p${DB_PASSWORD}']
      interval: 10s
      timeout: 5s
      retries: 10
    networks: [backend]

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', '-a', '${REDIS_PASSWORD}', 'ping']
      interval: 10s
      timeout: 3s
      retries: 5
    networks: [backend]

  api:
    image: ghcr.io/${GITHUB_REPO}/nexrad-api:${VERSION:-latest}
    build:
      context: .
      dockerfile: packages/api/Dockerfile
      target: production
    restart: always
    env_file: .env
    environment:
      NODE_ENV: production
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      DB_HOST: mysql
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks: [backend, frontend]
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1'

  web:
    image: ghcr.io/${GITHUB_REPO}/nexrad-web:${VERSION:-latest}
    build:
      context: .
      dockerfile: packages/web/Dockerfile
      target: production
    restart: always
    networks: [frontend]

  nginx:
    image: nginx:1.25-alpine
    restart: always
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./docker/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt/live/${DOMAIN}/fullchain.pem:/etc/nginx/ssl/fullchain.pem:ro
      - /etc/letsencrypt/live/${DOMAIN}/privkey.pem:/etc/nginx/ssl/privkey.pem:ro
    depends_on:
      - api
      - web
    networks: [frontend]

networks:
  backend:
  frontend:

volumes:
  mysql_data:
  redis_data:
```

---

## Task 10.7 — Real App Icons

### Create proper icons (replace placeholder from Sprint 8):

```bash
# Option 1: If you have ImageMagick and a logo SVG:
# cd packages/web/public/icons
# convert -background none -resize 192x192 logo.svg icon-192.png
# convert -background none -resize 512x512 logo.svg icon-512.png
# convert -background none -resize 180x180 logo.svg ../apple-touch-icon.png
# convert -background none -resize 32x32 logo.svg ../favicon.ico

# Option 2: Use realfavicongenerator.net — upload your logo SVG,
# download the package, and place:
#   - icon-192.png in public/icons/
#   - icon-512.png in public/icons/
#   - apple-touch-icon.png in public/
#   - favicon.ico in public/

# Icon design spec:
# - Background: #6366f1 (indigo-500) or transparent
# - Symbol: Bold "NX" or your logo mark in white
# - Padding: ~15% padding from edges (for maskable icon safe zone)
# - Format: PNG with transparency (except solid background versions)
```

---

## Task 10.8 — DB Index Optimization

### `packages/api/src/db/migrations/003_performance_indexes.sql`

```sql
-- ── Migration 003: Performance Indexes ───────────────────────────────────────
-- Run AFTER initial data is loaded for best index build performance

-- radacct: most common query patterns
ALTER TABLE radacct
  ADD INDEX IF NOT EXISTS idx_radacct_active (acctstoptime, nasipaddress),
  ADD INDEX IF NOT EXISTS idx_radacct_user_start (username, acctstarttime);

-- userbillinfo: join pattern
ALTER TABLE userbillinfo
  ADD INDEX IF NOT EXISTS idx_ubi_creationby_date (creationby, creationdate),
  ADD INDEX IF NOT EXISTS idx_ubi_planname (planName);

-- nx_tokens: common filters
ALTER TABLE nx_tokens
  ADD INDEX IF NOT EXISTS idx_tokens_org_created (org_id, created_at),
  ADD INDEX IF NOT EXISTS idx_tokens_expires (expires_at);

-- nx_audit_log: recent entries lookup
ALTER TABLE nx_audit_log
  ADD INDEX IF NOT EXISTS idx_audit_org_created (org_id, created_at),
  ADD INDEX IF NOT EXISTS idx_audit_action (action);

-- nx_api_keys: fast key lookup (already has key_hash via UNIQUE — verify)
-- Only add if not already there:
CREATE INDEX IF NOT EXISTS idx_apikey_hash ON nx_api_keys (key_hash(32));
```

### Add to `scripts/migrate.sh`:

```bash
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
  < packages/api/src/db/migrations/003_performance_indexes.sql
```

---

## Task 10.9 — Health Check Improvements

### Update `packages/api/src/app.ts` — enhanced health endpoint:

```typescript
app.get('/health', async (request, reply) => {
  const checks: Record<string, 'ok' | 'error'> = {}

  // MySQL check
  try {
    await pool.query('SELECT 1')
    checks.mysql = 'ok'
  } catch {
    checks.mysql = 'error'
  }

  // Redis check
  try {
    await redis.ping()
    checks.redis = 'ok'
  } catch {
    checks.redis = 'error'
  }

  const allOk = Object.values(checks).every((v) => v === 'ok')

  return reply.status(allOk ? 200 : 503).send({
    status: allOk ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
    uptime: Math.round(process.uptime()),
  })
})
```

---

## Task 10.10 — Graceful Shutdown

### Update `packages/api/src/server.ts`:

```typescript
async function shutdown(signal: string) {
  console.info(`${signal} received — shutting down gracefully`)
  try {
    await app.close()
    await pool.end()
    await redis.quit()
    console.info('Shutdown complete')
    process.exit(0)
  } catch (err) {
    console.error('Error during shutdown:', err)
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
```

---

## Task 10.11 — Final README for Open Source

### Create `README.md` at repo root:

````markdown
# NexRAD

**Modern WiFi Management Platform — the open-source daloRADIUS alternative.**

Manage FreeRADIUS deployments with a modern React UI, real-time dashboards, WireGuard VPN support, and multi-tenant SaaS architecture.

## Why NexRAD?

| Feature              | NexRAD                    | daloRADIUS            |
| -------------------- | ------------------------- | --------------------- |
| UI                   | Modern React (dark/light) | PHP/Bootstrap (dated) |
| Real-time sessions   | WebSocket                 | Page refresh          |
| WireGuard / Starlink | ✅ Built-in               | ❌ Manual             |
| Mobile PWA           | ✅ Installable            | ❌ No                 |
| Multi-tenant         | ✅ Org isolation          | ❌ Single-tenant      |
| REST API             | ✅ API keys + scopes      | ❌ No                 |
| Voucher PDF          | ✅ Professional layout    | ⚠️ Basic              |
| Commission tracking  | ✅ Realized vs generated  | ❌ No                 |

## Starlink / Dynamic IP Support

NexRAD is built for the real world — branches can use **Starlink, 4G, or any dynamic IP** connection. WireGuard tunnels provide stable internal IPs so FreeRADIUS always sees `10.8.0.x` regardless of the branch's real internet IP. Add a branch → download the WireGuard config or scan QR → done.

## Quick Start

### Prerequisites

- Node.js ≥ 20, pnpm ≥ 9
- Docker + Docker Compose
- (Production) WireGuard on server host

### Development

```bash
git clone https://github.com/YOUR_ORG/nexrad.git
cd nexrad
cp .env.example .env
pnpm install
pnpm docker:dev
```
````

Open http://localhost:5173 — login with `admin` / `admin123`.

### Production

```bash
cp .env.example .env
# Edit .env with real secrets, DB passwords, SMTP, domain
docker compose -f docker-compose.prod.yml up -d
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for SSL setup and FreeRADIUS config.

## Architecture

- **API:** Node.js 20 + Fastify + TypeScript
- **Web:** React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Database:** MySQL 8.0 (FreeRADIUS compatible schema)
- **Cache:** Redis 7
- **Real-time:** Socket.io WebSocket
- **Auth:** JWT + refresh tokens + RBAC
- **VPN:** WireGuard (optional, for dynamic-IP branches)

Full architecture: [ARCHITECTURE.md](ARCHITECTURE.md)

## License

MIT

````

---

## Task 10.12 — Deployment Docs

### Create `docs/DEPLOYMENT.md`:
```markdown
# Production Deployment Guide

## 1. Server Requirements

- Ubuntu 22.04+ (or Debian 12+)
- 2 vCPU, 2 GB RAM minimum (4 GB recommended)
- 20 GB SSD
- Docker + Docker Compose installed
- WireGuard installed (if using VPN branches)

## 2. DNS & SSL

Point your domain to the server IP, then:

```bash
apt install certbot
certbot certonly --standalone -d yourdomain.com
````

Certificates land in `/etc/letsencrypt/live/yourdomain.com/`.

## 3. Environment Setup

```bash
git clone https://github.com/YOUR_ORG/nexrad.git /opt/nexrad
cd /opt/nexrad
cp .env.example .env
```

Edit `.env` — critical values:

- `JWT_SECRET` — random 64-char string (`openssl rand -hex 32`)
- `REFRESH_TOKEN_SECRET` — different random 64-char string
- `DB_ROOT_PASSWORD`, `DB_PASSWORD` — strong passwords
- `REDIS_PASSWORD` — strong password
- `DOMAIN` — your domain (e.g. nexrad.yourdomain.com)
- `WG_SERVER_ENDPOINT` — your server's public IP or domain
- `SMTP_*` — email credentials (optional)

## 4. WireGuard Setup (if using VPN branches)

```bash
apt install wireguard
wg genkey | tee /etc/wireguard/server_private.key | wg pubkey > /etc/wireguard/server_public.key
chmod 600 /etc/wireguard/server_private.key

cat > /etc/wireguard/wg0.conf << EOF
[Interface]
Address = 10.8.0.1/24
ListenPort = 51820
PrivateKey = $(cat /etc/wireguard/server_private.key)
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
EOF

systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0
```

Set `WG_CONFIG_PATH=/etc/wireguard/wg0.conf` in `.env`.

## 5. Database Migrations

```bash
# First run — migrations are applied via docker-entrypoint-initdb.d automatically
# For subsequent runs:
docker compose -f docker-compose.prod.yml exec mysql \
  mysql -u${DB_USER} -p${DB_PASSWORD} ${DB_NAME} \
  < packages/api/src/db/migrations/003_performance_indexes.sql
```

## 6. Start Production Stack

```bash
cd /opt/nexrad
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps

# Check logs
docker compose -f docker-compose.prod.yml logs -f api
```

## 7. First Login

1. Navigate to `https://yourdomain.com`
2. Login with `admin` / `admin123`
3. **Immediately change the admin password** in Users → Edit
4. Create your organization in Org Settings
5. Add branches in Branches → Add Branch

## 8. Backups

```bash
# MySQL backup (add to cron)
docker compose -f docker-compose.prod.yml exec mysql \
  mysqldump -u${DB_USER} -p${DB_PASSWORD} ${DB_NAME} \
  | gzip > /backups/nexrad-$(date +%Y%m%d).sql.gz

# Retention: keep last 30 days
find /backups -name "nexrad-*.sql.gz" -mtime +30 -delete
```

## 9. Updates

```bash
cd /opt/nexrad
git pull
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
```

````

---

## Task 10.13 — Final Test Run

```bash
# From repo root — full CI simulation:
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test --coverage
pnpm build

# Check bundle size
du -sh packages/web/dist/assets/*.js | sort -h

# Docker production build
docker compose -f docker-compose.prod.yml build

# Start and smoke test
docker compose -f docker-compose.prod.yml up -d
sleep 10
curl -f http://localhost/health
# Expected: {"status":"ok","checks":{"mysql":"ok","redis":"ok"},...}
````

---

## Sprint 10 Sign-Off Checklist

Before marking Sprint 10 and the entire project complete, every item must be ✓:

### Security

- [ ] No raw SQL string concatenation found in audit scan
- [ ] All routes with `req.body` use Zod validation
- [ ] Auth rate limit: `/api/auth/login` max 10 req/min enforced (test with curl loop)
- [ ] JWT secrets are non-default in `.env` (not `dev-secret`)
- [ ] HTTPS enforced — HTTP redirects to HTTPS in nginx
- [ ] HSTS header present (`Strict-Transport-Security`)
- [ ] No plaintext passwords in logs (grep for password strings in logs)
- [ ] bcrypt cost factor is 12 (verify in user.service.ts and auth.service.ts)

### Performance

- [ ] `/health` returns `{"mysql":"ok","redis":"ok"}` under 50ms
- [ ] Dashboard loads in under 2 seconds on 3G (Chrome devtools → Slow 3G)
- [ ] Bundle size: main JS chunk under 500KB gzipped
- [ ] SQL queries on token listing are under 200ms with 10,000 tokens (test with EXPLAIN)
- [ ] Performance indexes migration (003) applied — EXPLAIN shows index use on radacct

### Frontend Quality

- [ ] ErrorBoundary wraps all pages — intentionally throw in a page, see error UI not blank white screen
- [ ] All pages have loading skeleton states — no bare spinners
- [ ] Lazy loading working — check Network tab for chunk splitting on navigation
- [ ] Dark mode: every page looks correct with dark theme
- [ ] Light mode: every page looks correct with light theme
- [ ] No console errors or warnings on any page (clean DevTools Console)
- [ ] Mobile (375px): Dashboard, Tokens, QuickToken all usable without horizontal scroll

### PWA

- [ ] Lighthouse PWA score: all checkboxes green (run `npx lighthouse http://localhost:5173 --view`)
- [ ] Real 192px and 512px icons (not placeholder squares)
- [ ] Apple touch icon present
- [ ] Install prompt works on Chrome mobile
- [ ] App loads from home screen icon in standalone mode

### Functionality

- [ ] Full flow: create org → add branch (WireGuard) → create plan → generate tokens → print vouchers → view in reports
- [ ] Commission math: realized × rate = commission (verify in reports with known data)
- [ ] Session disconnect marks radacct stopped
- [ ] API key: generate → use on `/api/v1/tokens` → revoke → verify 401

### Production

- [ ] `docker compose -f docker-compose.prod.yml up -d` starts all 5 containers
- [ ] HTTPS working with valid SSL cert
- [ ] `/health` returns 200 with both checks ok
- [ ] Graceful shutdown: `docker stop api` → logs show "Shutdown complete" not SIGKILL
- [ ] DB backup script produces valid `.sql.gz` file
- [ ] No secrets committed to git (`git log --all --oneline | xargs git show | grep -i "password\|secret\|key"` returns nothing sensitive)

### Open Source Readiness

- [ ] `README.md` exists with quick start, feature comparison table, architecture summary
- [ ] `docs/DEPLOYMENT.md` covers full prod setup
- [ ] `ARCHITECTURE.md` is up to date
- [ ] `.env.example` documents every variable
- [ ] `LICENSE` file present (MIT)
- [ ] No personal/org-specific data hardcoded anywhere
- [ ] Git history is clean (no accidental .env commits)

---

## 🎉 NexRAD is Launch-Ready

All 10 sprints complete. The system now provides:

- **Real-time dashboard** with live session data via WebSocket
- **Branch management** with WireGuard VPN — Starlink-ready
- **Token generation** with batch processing and PDF vouchers
- **Financial reports** with correct generated/realized/outstanding distinction and commission tracking
- **Full RBAC** — superadmin, orgadmin, branchmanager, operator, readonly
- **Multi-tenant SaaS** — org isolation, API keys with scopes, tenant management
- **Mobile PWA** — installable, offline-aware, Quick Token for operators
- **Audit trail** — every admin action logged
- **Production hardened** — HTTPS, rate limiting, graceful shutdown, DB indexes

**Total estimated development time (with AI agent following sprint docs): 8–12 weeks solo, 3–5 weeks with a pair.**

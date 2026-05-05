# NexRAD

**Modern WiFi Management Platform — the open-source daloRADIUS alternative.**

Manage FreeRADIUS deployments with a modern React UI, real-time dashboards, WireGuard VPN support, and multi-tenant SaaS architecture. Built for ISPs, hotspot operators, and community networks in bandwidth-constrained environments.

---

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

---

## Features

### Core Platform

- **Token / voucher management** — create, print, and track prepaid WiFi tokens with professional PDF vouchers
- **Session monitoring** — live active sessions via WebSocket with disconnect capability
- **Branch management** — multi-site support with per-branch NAS configuration
- **Analytics & reporting** — revenue charts, session trends, plan performance, export to CSV
- **Audit log** — full action history for compliance and debugging
- **Plans / packages** — configurable data caps, time limits, download/upload speeds

### Access Control (5-role RBAC)

| Role            | Scope                                                 |
| --------------- | ----------------------------------------------------- |
| `superadmin`    | Full system access, manages all tenants               |
| `admin`         | Full org access — users, branches, settings, reports  |
| `manager`       | Branch-level management, no user/org admin            |
| `branchmanager` | Single branch + token ops, no global views            |
| `operator`      | Token generation and session view only (mobile-first) |

### WireGuard / Starlink Support

Branches can use **Starlink, 4G, or any dynamic IP** connection. WireGuard tunnels provide stable internal addresses so FreeRADIUS always sees `10.8.0.x` regardless of the branch's real internet IP.

- Server-side peer management from the UI
- Downloadable WireGuard client config or scannable QR code
- Automatic NAS IP assignment per branch

### Mobile PWA

- Installable on Android/iOS home screen
- Offline capability with service worker caching
- Operator dashboard optimized for small screens
- Quick token generation flow for frontline staff

### SaaS & Public API

- **Multi-tenant** — full org isolation; superadmin manages all tenants
- **API keys** — scoped bearer tokens for external integrations (`nxk_PREFIX_SECRET`)
- **Commission tracking** — platform-level commission rate per tenant, realized vs generated revenue

---

## Tech Stack

| Layer      | Technology                                    |
| ---------- | --------------------------------------------- |
| API        | Node.js 20, Fastify 5, TypeScript             |
| Web        | React 18, TypeScript, Vite, Tailwind CSS      |
| UI library | shadcn/ui (Radix UI primitives)               |
| Database   | MySQL 8.0 (FreeRADIUS-compatible schema)      |
| Cache      | Redis 7                                       |
| Real-time  | Socket.io WebSocket                           |
| Auth       | JWT + refresh tokens, RBAC, API key auth      |
| VPN        | WireGuard (optional, for dynamic-IP branches) |
| Proxy      | Nginx (TLS termination, gzip, SPA fallback)   |
| Container  | Docker + Docker Compose                       |

---

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

Open http://localhost:5173 — login with `admin` / `admin123`.

The dev stack starts MySQL, Redis, and Nginx in Docker while running the API and web servers locally with hot reload.

### Production Deployment

```bash
# 1. Clone and configure
git clone https://github.com/YOUR_ORG/nexrad.git && cd nexrad
cp .env.example .env
# Edit .env — set DB passwords, JWT_SECRET, domain, SMTP

# 2. Obtain TLS certificates (Let's Encrypt or manual)
#    Place fullchain.pem and privkey.pem in docker/nginx/certs/

# 3. (Optional) Initialize WireGuard on the host
wg genkey | tee /etc/wireguard/server_private.key | wg pubkey > /etc/wireguard/server_public.key
wg-quick up wg0

# 4. Start all services
docker compose -f docker-compose.prod.yml up -d

# 5. First login
#    Navigate to https://your-domain — login with admin / (set ADMIN_PASSWORD in .env)
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed SSL setup, FreeRADIUS config, and the ZimSmart Villages guide.

---

## REST API

External systems can integrate via scoped API keys. Generate a key in **Settings → API Keys**.

### Authentication

```http
Authorization: Bearer nxk_ABC123_secretpart
```

### Endpoints

| Method | Path           | Scope           | Description                  |
| ------ | -------------- | --------------- | ---------------------------- |
| GET    | `/v1/tokens`   | `tokens:read`   | List tokens with filters     |
| POST   | `/v1/tokens`   | `tokens:write`  | Create a new token           |
| GET    | `/v1/sessions` | `sessions:read` | Active RADIUS sessions       |
| GET    | `/v1/stats`    | `reports:read`  | Revenue and session summary  |
| GET    | `/v1/branches` | `branches:read` | Branch list with NAS details |

### Generate a Token (example)

```bash
curl -X POST https://your-domain/api/v1/tokens \
  -H "Authorization: Bearer nxk_ABC123_secretpart" \
  -H "Content-Type: application/json" \
  -d '{"planId": 3, "branchId": 1, "quantity": 10}'
```

### API Key Scopes

| Scope           | Grants                     |
| --------------- | -------------------------- |
| `tokens:read`   | List and search tokens     |
| `tokens:write`  | Create tokens              |
| `sessions:read` | View active sessions       |
| `reports:read`  | Access stats and analytics |
| `branches:read` | View branch configuration  |

---

## FreeRADIUS Compatibility

NexRAD uses the standard FreeRADIUS MySQL schema with no structural changes. Only the management layer is replaced.

| Table              | Access     | Purpose                               |
| ------------------ | ---------- | ------------------------------------- |
| `radcheck`         | Read/Write | User credentials and attribute checks |
| `radreply`         | Read/Write | Per-user reply attributes             |
| `radgroupcheck`    | Read/Write | Group attribute checks                |
| `radgroupreply`    | Read/Write | Group reply attributes (speed caps)   |
| `radusergroup`     | Read/Write | User-to-group membership              |
| `radacct`          | Read       | Accounting (sessions, traffic)        |
| `nas`              | Read/Write | NAS device registration               |
| `radpostauth`      | Read       | Auth attempt log                      |
| `radippool`        | Read       | IP pool (if configured)               |
| `radhubredirector` | —          | Not used                              |

---

## Project Structure

```
nexrad/
├── packages/
│   ├── api/                  # Fastify API server
│   │   └── src/
│   │       ├── modules/      # Feature modules (auth, tokens, sessions, …)
│   │       ├── middleware/   # JWT auth, role guard, rate limiting
│   │       ├── routes/       # Public v1 API routes
│   │       └── lib/          # DB pool, Redis, WireGuard utils
│   └── web/                  # React SPA
│       └── src/
│           ├── pages/        # Route-level page components
│           ├── components/   # Shared + UI component library
│           ├── stores/       # Zustand state (auth, UI)
│           ├── hooks/        # Custom hooks (socket, PWA)
│           └── lib/          # Axios client, utilities
├── docker/
│   ├── nginx/                # Nginx config + certs
│   └── mysql/                # Init SQL (FreeRADIUS schema)
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   └── ZimSmartVillages_Deployment_Guide_FINAL.md
├── docker-compose.yml        # Development stack
└── docker-compose.prod.yml   # Production stack
```

---

## Environment Variables

| Variable               | Required | Description                                   |
| ---------------------- | -------- | --------------------------------------------- |
| `DATABASE_URL`         | Yes      | MySQL connection string                       |
| `REDIS_URL`            | Yes      | Redis connection string                       |
| `JWT_SECRET`           | Yes      | ≥ 32-char secret for access tokens            |
| `JWT_REFRESH_SECRET`   | Yes      | ≥ 32-char secret for refresh tokens           |
| `PORT`                 | No       | API port (default 3000)                       |
| `NODE_ENV`             | No       | `development` or `production`                 |
| `CORS_ORIGIN`          | No       | Allowed CORS origin(s)                        |
| `SMTP_HOST`            | No       | SMTP server for email notifications           |
| `SMTP_PORT`            | No       | SMTP port (default 587)                       |
| `SMTP_USER`            | No       | SMTP username                                 |
| `SMTP_PASS`            | No       | SMTP password                                 |
| `WG_INTERFACE`         | No       | WireGuard interface name (default `wg0`)      |
| `WG_SERVER_PUBLIC_KEY` | No       | Server WireGuard public key                   |
| `WG_SERVER_ENDPOINT`   | No       | `host:port` for client WireGuard configs      |
| `WG_SUBNET`            | No       | Tunnel subnet (default `10.8.0.0/24`)         |
| `ADMIN_PASSWORD`       | No       | Initial superadmin password (first boot only) |
| `VITE_API_URL`         | No       | API base URL for web build                    |
| `VITE_WS_URL`          | No       | WebSocket URL for web build                   |
| `SESSION_SECRET`       | No       | Optional cookie session secret                |

---

## Origin

NexRAD was created for **ZimSmart Villages** — a community network project bringing internet connectivity to rural Zimbabwe using FreeRADIUS hotspots connected via Starlink. The existing management tools (daloRADIUS) were too brittle and operator-unfriendly for the deployment realities: poor connectivity, mobile-first staff, and multi-site operations across dynamic IP links.

See [docs/ZimSmartVillages_Deployment_Guide_FINAL.md](docs/ZimSmartVillages_Deployment_Guide_FINAL.md) for the full deployment playbook.

---

## Contributing

1. Fork the repo and create a feature branch
2. Run `pnpm install` and `pnpm docker:dev`
3. Make changes with tests where applicable
4. Run `pnpm lint && pnpm format:check && pnpm typecheck` — all must pass
5. Open a PR with a clear description of what changed and why

---

## License

MIT — see [LICENSE](LICENSE)

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

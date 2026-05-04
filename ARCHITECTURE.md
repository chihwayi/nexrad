# NexRAD — Modern RADIUS Management Platform
> A full-featured, open-source competitor to daloRADIUS built on a modern tech stack.
> Working project name: **NexRAD** (subject to change)

---

## Origin & Context

This project was conceived on 2026-05-04 by Ignatious Chihwayi while operating and extending
a FreeRADIUS-based hotspot network for **ZimSmart Villages** — a multi-branch rural WiFi
deployment in Zimbabwe using WireGuard VPN, FreeRADIUS 3.2.5, and MySQL 8.

The pain points with daloRADIUS that drove this:
- No mobile support
- Full page reloads for "live" monitoring
- No branch-aware access control
- No commission/financial tracking
- No WireGuard VPN integration
- Last serious redesign: ~2008
- No REST API
- No multi-tenancy

---

## Vision

**Self-hostable, Docker-deployable, open-source FreeRADIUS management portal.**

Three target use cases:
1. Internal use — single deployment, own ops team
2. Self-hosted — any hotspot operator deploys their own instance
3. SaaS / white-label — multi-tenant, multiple organizations on one instance

Beats daloRADIUS on: UI, real-time, mobile, roles, API, WireGuard, Docker.

---

## Tech Stack — Decided

| Layer | Choice | Reason |
|---|---|---|
| Frontend | React 18 + TypeScript | Component model, huge ecosystem |
| UI Components | shadcn/ui + Tailwind CSS | Production-quality, unstyled primitives |
| Backend | Node.js + Fastify + TypeScript | Async I/O, fast, great for WebSocket |
| Real-time | Socket.io | Live sessions without page reload |
| Primary DB | MySQL 8 | FreeRADIUS uses it — zero migration friction |
| Cache / Sessions | Redis | Live stat caching, JWT store, pub/sub |
| Auth | JWT + refresh tokens + RBAC | Stateless, multi-role |
| PDF / Vouchers | pdf-lib or Puppeteer | Server-side voucher PDF generation |
| WireGuard | wg CLI + JSON parsing | Peer management from the UI |
| Monorepo | pnpm workspaces | Single repo, shared types between api/web |
| Deployment | Docker + Docker Compose | One-command install on any VPS |
| CI/CD | GitHub Actions | Auto-build, test, Docker publish |

---

## System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Browser / Mobile                       │
│           React SPA (Tailwind + shadcn/ui)               │
└──────────────────────┬───────────────────────────────────┘
                       │  REST + WebSocket
┌──────────────────────▼───────────────────────────────────┐
│                 Node.js / Fastify API                    │
│                                                          │
│  /auth     /branches   /tokens    /sessions              │
│  /plans    /reports    /users     /wireguard             │
│  /settings /vouchers   /nas       /ws (Socket.io)        │
│                                                          │
│  ┌─────────────────────────────────────────────────┐     │
│  │               Core Services                     │     │
│  │  AuthService  │  FreeRadiusService              │     │
│  │  TokenService │  WireGuardService               │     │
│  │  ReportService│  NotificationService            │     │
│  └─────────────────────────────────────────────────┘     │
└──────────┬───────────────────────────┬───────────────────┘
           │                           │
┌──────────▼──────────┐    ┌───────────▼───────────┐
│      MySQL 8        │    │        Redis           │
│                     │    │                        │
│  FreeRADIUS tables: │    │  - JWT blacklist       │
│  radcheck           │    │  - Live session cache  │
│  radreply           │    │  - Rate limiting       │
│  radusergroup       │    │  - Pub/sub for WS      │
│  radacct            │    │  - Job queue           │
│  nas                │    └───────────────────────┘
│                     │
│  NexRAD tables:     │
│  nx_users           │
│  nx_organizations   │
│  nx_branches        │
│  nx_tokens          │
│  nx_billing_plans   │
│  nx_audit_log       │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│    FreeRADIUS 3.x   │  ← untouched daemon, same as always
│    (system daemon)  │
└─────────────────────┘
```

---

## Role System

```
SuperAdmin
  └── full access to all organizations, system config

OrgAdmin
  └── full access within their organization
      └── BranchManager
            └── view/manage their branch only
                └── Operator
                      └── generate tokens, print vouchers only
                          └── ReadOnly
                                └── view reports and live sessions
```

**Key principle:** Every query is scoped to the user's role + org + branch.
A branch operator cannot see another branch's data at all.

---

## Database Design (NexRAD-specific tables)

These sit alongside the FreeRADIUS tables in the same MySQL database.

```sql
-- Organizations (multi-tenant support)
CREATE TABLE nx_organizations (
    id          INT PRIMARY KEY AUTO_INCREMENT,
    name        VARCHAR(100) NOT NULL,
    slug        VARCHAR(50) UNIQUE NOT NULL,
    commission_rate DECIMAL(5,4) DEFAULT 0.10,
    logo_url    VARCHAR(255),
    settings    JSON,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Portal users (separate from FreeRADIUS operators table)
CREATE TABLE nx_users (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    org_id          INT REFERENCES nx_organizations(id),
    username        VARCHAR(50) UNIQUE NOT NULL,
    email           VARCHAR(100),
    password_hash   VARCHAR(255) NOT NULL,
    role            ENUM('superadmin','orgadmin','branchmanager','operator','readonly'),
    branch_ip       VARCHAR(45),   -- NULL = all branches
    is_active       BOOLEAN DEFAULT TRUE,
    last_login      DATETIME,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Branches (maps to FreeRADIUS nas table)
CREATE TABLE nx_branches (
    id          INT PRIMARY KEY AUTO_INCREMENT,
    org_id      INT REFERENCES nx_organizations(id),
    nas_ip      VARCHAR(45) UNIQUE NOT NULL,  -- links to nas.nasname
    shortname   VARCHAR(50) NOT NULL,
    name        VARCHAR(100),
    wg_pubkey   VARCHAR(255),
    wg_endpoint VARCHAR(100),
    location    VARCHAR(255),
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Extended token metadata (userbillinfo is FreeRADIUS, this extends it)
CREATE TABLE nx_tokens (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    org_id          INT REFERENCES nx_organizations(id),
    username        VARCHAR(50) NOT NULL,  -- links to radcheck.username
    branch_id       INT REFERENCES nx_branches(id),
    plan_id         INT REFERENCES nx_billing_plans(id),
    prefix          VARCHAR(10),
    batch_id        VARCHAR(36),  -- UUID grouping batch generations
    created_by      INT REFERENCES nx_users(id),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at      DATETIME,
    notes           VARCHAR(255)
);

-- Billing plans (replaces daloRADIUS billing_plans)
CREATE TABLE nx_billing_plans (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    org_id          INT REFERENCES nx_organizations(id),
    name            VARCHAR(100) NOT NULL,
    display_name    VARCHAR(100),
    time_bank_hours INT,           -- hours of access
    data_limit_mb   INT,           -- NULL = unlimited
    cost            DECIMAL(10,2) NOT NULL,
    currency        VARCHAR(3) DEFAULT 'USD',
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audit log
CREATE TABLE nx_audit_log (
    id          BIGINT PRIMARY KEY AUTO_INCREMENT,
    org_id      INT,
    user_id     INT,
    action      VARCHAR(100) NOT NULL,
    resource    VARCHAR(50),
    resource_id VARCHAR(100),
    meta        JSON,
    ip_address  VARCHAR(45),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Monorepo Structure

```
nexrad/
├── packages/
│   ├── api/                        ← Node.js Fastify backend
│   │   ├── src/
│   │   │   ├── app.ts              ← Fastify instance setup
│   │   │   ├── server.ts           ← Entry point
│   │   │   ├── config.ts           ← Env vars, constants
│   │   │   ├── db/
│   │   │   │   ├── mysql.ts        ← MySQL connection pool
│   │   │   │   ├── redis.ts        ← Redis client
│   │   │   │   └── migrations/     ← SQL migration files
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── branches.ts
│   │   │   │   ├── tokens.ts
│   │   │   │   ├── sessions.ts
│   │   │   │   ├── reports.ts
│   │   │   │   ├── plans.ts
│   │   │   │   ├── users.ts
│   │   │   │   ├── wireguard.ts
│   │   │   │   └── vouchers.ts
│   │   │   ├── services/
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── token.service.ts
│   │   │   │   ├── session.service.ts
│   │   │   │   ├── report.service.ts
│   │   │   │   ├── wireguard.service.ts
│   │   │   │   ├── voucher.service.ts
│   │   │   │   └── freeradius.service.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts         ← JWT verify + role check
│   │   │   │   ├── scope.ts        ← Org/branch scope enforcement
│   │   │   │   └── audit.ts        ← Auto audit log
│   │   │   └── ws/
│   │   │       ├── index.ts        ← Socket.io setup
│   │   │       └── sessions.ts     ← Live session broadcaster
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   └── web/                        ← React frontend
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── lib/
│       │   │   ├── api.ts          ← Axios/fetch wrapper
│       │   │   ├── socket.ts       ← Socket.io client
│       │   │   └── utils.ts
│       │   ├── stores/             ← Zustand state
│       │   │   ├── auth.store.ts
│       │   │   └── session.store.ts
│       │   ├── pages/
│       │   │   ├── Login.tsx
│       │   │   ├── Dashboard.tsx
│       │   │   ├── Branches.tsx
│       │   │   ├── BranchDetail.tsx
│       │   │   ├── Tokens.tsx
│       │   │   ├── Sessions.tsx    ← Real-time via WebSocket
│       │   │   ├── Reports.tsx
│       │   │   ├── Plans.tsx
│       │   │   ├── Users.tsx
│       │   │   ├── WireGuard.tsx
│       │   │   └── Settings.tsx
│       │   └── components/
│       │       ├── layout/
│       │       │   ├── Sidebar.tsx
│       │       │   └── TopBar.tsx
│       │       ├── ui/             ← shadcn/ui components
│       │       ├── charts/         ← Recharts wrappers
│       │       ├── LiveSessionTable.tsx
│       │       ├── BranchCard.tsx
│       │       ├── TokenGenerator.tsx
│       │       └── VoucherPrint.tsx
│       ├── package.json
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       └── Dockerfile
│
├── packages/shared/                ← Shared TypeScript types
│   ├── src/
│   │   ├── types/
│   │   │   ├── auth.types.ts
│   │   │   ├── branch.types.ts
│   │   │   ├── token.types.ts
│   │   │   ├── session.types.ts
│   │   │   └── report.types.ts
│   │   └── index.ts
│   └── package.json
│
├── docker-compose.yml              ← Dev environment
├── docker-compose.prod.yml         ← Production
├── .env.example
├── pnpm-workspace.yaml
├── package.json
└── ARCHITECTURE.md                 ← this file
```

---

## REST API Design

```
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout

GET    /api/dashboard/stats
GET    /api/dashboard/live              ← WebSocket preferred

GET    /api/branches
POST   /api/branches
GET    /api/branches/:id
PATCH  /api/branches/:id
DELETE /api/branches/:id
GET    /api/branches/:id/sessions
GET    /api/branches/:id/tokens
GET    /api/branches/:id/stats

GET    /api/tokens
POST   /api/tokens/generate
GET    /api/tokens/:id
DELETE /api/tokens/:id
POST   /api/tokens/batch-delete
GET    /api/tokens/export             ← CSV

GET    /api/sessions                  ← paginated
GET    /api/sessions/active
DELETE /api/sessions/:id              ← kick session

GET    /api/reports/financial
GET    /api/reports/branch-summary
GET    /api/reports/commission
GET    /api/reports/export            ← PDF / CSV

GET    /api/plans
POST   /api/plans
PATCH  /api/plans/:id
DELETE /api/plans/:id

GET    /api/users
POST   /api/users
PATCH  /api/users/:id
DELETE /api/users/:id

GET    /api/wireguard/peers
POST   /api/wireguard/peers
DELETE /api/wireguard/peers/:pubkey
GET    /api/wireguard/status

POST   /api/vouchers/generate-pdf    ← returns PDF binary
```

---

## WebSocket Events

```
# Server → Client
session:started     { username, nasIp, branchName, planName, startTime }
session:ended       { username, duration, dataUsed }
session:active_count { count, byBranch: { [ip]: count } }
stats:update        { activeSessions, realizedRevenue, usedTokens }
branch:status       { ip, status }   ← today/recent/inactive

# Client → Server
subscribe:branch    { ip }           ← subscribe to one branch's events
unsubscribe:branch  { ip }
subscribe:global                     ← subscribe to all-branch events
```

---

## Feature Roadmap

### Phase 1 — Foundation (MVP)
- [ ] Monorepo scaffolding (pnpm + Docker)
- [ ] MySQL schema migrations
- [ ] Auth system (login, JWT, refresh, RBAC middleware)
- [ ] Dashboard with live sessions via WebSocket
- [ ] Token generation (batch, prefix, plan selection)
- [ ] Voucher printing (HTML print view, PDF export)
- [ ] Financial reports (generated vs realized, commission)
- [ ] Basic branch management (list, status)

### Phase 2 — Branch-Aware
- [ ] Per-branch operator logins (scoped access)
- [ ] Branch detail view (live sessions, tokens, revenue)
- [ ] WireGuard peer management UI
- [ ] Branch status monitoring (online/offline detection)
- [ ] Per-branch revenue reports

### Phase 3 — Product Polish
- [ ] Multi-tenant (nx_organizations)
- [ ] Audit log viewer
- [ ] Token expiry system + alerts
- [ ] Email voucher delivery (SMTP)
- [ ] WhatsApp voucher delivery (via WhatsApp Business API)
- [ ] CSV/PDF export for all reports
- [ ] Dark/light theme toggle
- [ ] Mobile PWA

### Phase 4 — Platform
- [ ] REST API with API key auth (for external integrations)
- [ ] Webhook support (token used, session started)
- [ ] Plugin system
- [ ] SaaS billing hooks (if offering hosted version)
- [ ] GitHub Actions CI/CD pipeline
- [ ] Helm chart / K8s support

---

## FreeRADIUS Compatibility

NexRAD does NOT replace FreeRADIUS. It manages it.

FreeRADIUS tables used (read/write):
- `radcheck` — token credentials (username + password)
- `radreply` — session attributes (time limit, data limit)
- `radusergroup` — group assignments
- `radacct` — session accounting (read only from portal)
- `nas` — NAS/branch definitions
- `radgroupreply` — group-level reply attributes
- `operators` — daloRADIUS operator table (read for migration)
- `userbillinfo` — token billing metadata (read/write)
- `billing_plans` — plan definitions (superseded by nx_billing_plans)

FreeRADIUS config files remain untouched by the portal except for NAS management
(which updates the `nas` table — FreeRADIUS reads this via SQL).

---

## Deployment (Docker Compose)

```yaml
# docker-compose.yml (dev)
services:
  api:
    build: ./packages/api
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: mysql://radius:password@mysql:3306/radius
      REDIS_URL: redis://redis:6379
      JWT_SECRET: changeme
    depends_on: [mysql, redis]

  web:
    build: ./packages/web
    ports: ["5173:5173"]
    environment:
      VITE_API_URL: http://localhost:3000

  mysql:
    image: mysql:8
    environment:
      MYSQL_DATABASE: radius
      MYSQL_USER: radius
      MYSQL_PASSWORD: radiusPassword
      MYSQL_ROOT_PASSWORD: rootpass
    volumes:
      - mysql_data:/var/lib/mysql
      - ./packages/api/src/db/migrations:/docker-entrypoint-initdb.d

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  mysql_data:
  redis_data:
```

Production adds: nginx reverse proxy, SSL (Let's Encrypt), resource limits.

---

## First Deployment Target

The ZimSmart Villages deployment (173.212.195.88) will be the first real-world test.

Current setup:
- FreeRADIUS 3.2.5 + MySQL 8.0.45
- WireGuard VPN: server 10.8.0.1, branches 10.8.0.11–10.8.0.16
- 6 branches (Branch01–Branch06), Branch04 active
- ~580 tokens in system
- Commission rate: 10%
- Existing tables: radcheck, radacct, nas, userbillinfo, billing_plans, operators

NexRAD will be installed alongside existing daloRADIUS, connecting to the same MySQL database.

---

## Key Design Decisions

1. **MySQL-first, not PostgreSQL** — FreeRADIUS ecosystem is MySQL. Migration friction would kill adoption.
2. **No ORM for FreeRADIUS tables** — raw SQL for radcheck/radacct/nas to stay exactly compatible. ORM only for nx_* tables.
3. **WebSocket for live data** — never meta refresh. Socket.io with Redis pub/sub for horizontal scaling.
4. **Scope enforcement in middleware** — every route automatically filters by org_id + branch, not per-query. One missed WHERE clause shouldn't leak data.
5. **FreeRADIUS daemon untouched** — NexRAD only reads/writes the database. No touching config files or restarting the daemon (except NAS reloads via `radmin`).
6. **Shared TypeScript types** — `packages/shared` means API and frontend always agree on data shapes. No runtime type mismatch surprises.
7. **PDF vouchers server-side** — not browser print. Guarantees consistent formatting regardless of browser/OS.

---

## WireGuard — Core Network Layer

WireGuard is the VPN backbone that makes NexRAD work across branches with **any internet connection type** — static IP, CGNAT, Starlink, mobile data. This is one of NexRAD's biggest competitive advantages.

### Why WireGuard + Starlink is the killer combo

Starlink (and most rural internet in Africa) uses **dynamic/non-static public IPs** — the IP changes on reconnect or lease expiry. Traditional VPN approaches (OpenVPN with fixed peer IPs, port forwarding) break every time the IP changes and require manual reconfiguration.

**WireGuard solves this completely:**

```
┌─────────────────────────────────────────────────────────┐
│  VPS Server — STATIC IP (173.212.195.88)                │
│  WireGuard server: 10.8.0.1                            │
│  ListenPort: 51820                                      │
│  Knows each peer by PUBLIC KEY only — not by IP        │
└─────────────────┬───────────────────────────────────────┘
                  │ Encrypted tunnel (UDP 51820)
     ┌────────────┼────────────────────────────────┐
     │            │                                │
┌────▼─────┐ ┌────▼─────┐                   ┌─────▼────┐
│ Branch 1 │ │ Branch 4 │      ...          │ Branch N │
│ Starlink │ │ Starlink │                   │ Mobile   │
│ DYNAMIC  │ │ DYNAMIC  │                   │ DYNAMIC  │
│ 10.8.0.11│ │ 10.8.0.14│                   │ 10.8.0.x │
└──────────┘ └──────────┘                   └──────────┘
```

**The critical insight:** The server config has NO `Endpoint =` for branch peers. The branch router initiates the outbound connection to the server's static IP. The server learns the branch's current public IP automatically when the tunnel handshake happens. `PersistentKeepalive = 25` keeps the tunnel alive and re-establishes it within 25 seconds if the IP changes.

Result: **A branch can be on Starlink with a changing IP and the VPN tunnel just works, silently, always.** FreeRADIUS only ever sees the stable tunnel IP (10.8.0.x) — it never knows or cares what the public IP is.

### Reference: ZimSmart Villages wg0.conf (server side)

```ini
[Interface]
Address = 10.8.0.1/24
ListenPort = 51820
PrivateKey = <SERVER_PRIVATE_KEY>

PostUp   = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Branch 1 — no Endpoint = dynamic IP works automatically
[Peer]
PublicKey = YCc4rvf7tWYlSpNsi8SqYIP+i/rmovAmdJRhoBPUoFY=
AllowedIPs = 10.8.0.11/32
PersistentKeepalive = 25

# Branch 2
[Peer]
PublicKey = uN5PVSHI1+Qo1j9u61tfUWsessUfnJJX9OH5+UZFkmk=
AllowedIPs = 10.8.0.12/32
PersistentKeepalive = 25

# Branch 3
[Peer]
PublicKey = lXbhS8JI+1KvKO48hyalAgnjHB5KtnYl+bFO3G0r6Uo=
AllowedIPs = 10.8.0.13/32
PersistentKeepalive = 25

# Branch 4
[Peer]
PublicKey = 8gS3Gs4VP16a4k+CdCuXe9+M/qxltilDo37CyjQL038=
AllowedIPs = 10.8.0.14/32
PersistentKeepalive = 25

# Branch 5
[Peer]
PublicKey = OMeV0wqoZ75kNyYt30v74J2puaNPnjLflSPc5bLQakY=
AllowedIPs = 10.8.0.15/32
PersistentKeepalive = 25

# Branch 6
[Peer]
PublicKey = lw7LsqYP4t0J+0l3A0M5YTAYbFxq/+TDpUWrTBy2X1k=
AllowedIPs = 10.8.0.16/32
PersistentKeepalive = 25
```

### What NexRAD adds on top

NexRAD manages all of this from a UI. No more `nano wg0.conf` and manually editing files.

**Adding a new branch from the UI:**
1. Admin clicks "Add Branch" → fills in name and location
2. NexRAD generates a WireGuard keypair server-side (or accepts pasted public key)
3. Assigns the next available tunnel IP (10.8.0.17, 10.8.0.18 etc.)
4. Writes the `[Peer]` block to `/etc/wireguard/wg0.conf` via the API
5. Runs `wg addpeer` (live, no restart needed)
6. Adds the NAS entry to MySQL for FreeRADIUS
7. Generates and displays the branch router config as:
   - Text (copy/paste)
   - QR code (scan with WireGuard mobile app or router)
   - Downloadable `.conf` file

**Branch router config (generated for the operator):**

```ini
[Interface]
PrivateKey = <GENERATED_FOR_BRANCH>
Address = 10.8.0.11/24
DNS = 1.1.1.1

[Peer]
PublicKey = <SERVER_PUBLIC_KEY>
Endpoint = 173.212.195.88:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
```

The branch operator **only needs to paste this config into their router or scan the QR code**. No IP knowledge required. Works on Starlink, mobile data, fiber, ADSL — anything.

### Supported connection types

| Connection Type | Works? | Notes |
|---|---|---|
| Static IP (fiber, dedicated) | ✓ | Endpoint can be set if desired |
| Starlink (dynamic IP) | ✓ | PersistentKeepalive handles reconnects |
| Mobile data (CGNAT) | ✓ | Outbound-only tunnel, no port-forward needed |
| Shared ADSL (dynamic) | ✓ | Same as Starlink |
| Double-NAT | ✓ | As long as outbound UDP 51820 is not blocked |

### WireGuard monitoring in NexRAD

NexRAD reads `wg show wg0 dump` and parses:
- `latest-handshake` timestamp → branch online/offline status
- `transfer-rx / transfer-tx` → data through the tunnel
- `endpoint` → current public IP of the branch (informational)

```
Branch 4 — Redcliff ●  Online
  Tunnel IP:    10.8.0.14
  Public IP:    196.207.xx.xx (Starlink, changes)
  Last seen:    2 minutes ago
  Data in/out:  1.2 GB / 340 MB
```

This data feeds the dashboard branch status cards in real-time.

---

## Simplicity — Design Philosophy

> "So simple a non-technical branch operator can run it. So powerful it beats daloRADIUS entirely."

This is a core design constraint, not an afterthought. Every feature must pass the **"branch operator test"**: could a person with basic smartphone literacy use this without training?

### The two user types

**Type A — HQ Admin (technical, you)**
- Sets up the server once
- Manages billing plans, commission rates, branches
- Reviews financial reports
- Adds new branches (click, fill form, scan QR)

**Type B — Branch Operator (non-technical, at the branch)**
- Logs in on their phone
- Generates 20 tokens for today
- Prints vouchers (or screenshots them)
- Checks how many sessions are active right now
- That's it. Nothing else.

### UX rules for Type B screens

1. **One action per screen** — token generation page has one big "Generate" button. No configuration visible unless advanced mode is toggled.
2. **Numbers, not tables** — branch operators see card tiles (big number + label), not data tables.
3. **Color = status** — green means working, red means problem. No technical error messages exposed.
4. **Mobile-first layout** — all branch operator screens designed for 390px screen first, desktop second.
5. **No jargon** — "Sessions active now" not "radacct open sessions". "Tokens available" not "unused radcheck entries".
6. **Offline-aware** — if the tunnel drops, show a friendly banner "Branch connection interrupted" not a blank page or PHP error.

### Onboarding a new branch — full flow (target: under 10 minutes)

```
Admin side (HQ):
  1. Click "Add Branch"
  2. Enter: Branch name, Location, Operator name
  3. Click "Generate Config"
  → System creates WireGuard keypair, assigns 10.8.0.x, adds NAS entry
  → Shows QR code + .conf download

Branch side (non-technical operator):
  4. Open WireGuard app on router or phone
  5. Scan QR code (or paste .conf)
  6. Toggle VPN ON
  → Tunnel connects automatically, branch shows "Online" in dashboard

Done. Branch is live. Operator can now generate tokens and accept customers.
```

### Token generation — simplest possible flow

```
Branch Operator opens NexRAD on phone:

  [  Select Package  ▼  ]
  [  Quantity:   [ 10 ] ]
  [      GENERATE       ]

  → 10 vouchers appear
  → [Print] [Screenshot] [Share via WhatsApp]
```

Everything else (prefix, batch tracking, expiry) is hidden behind "Advanced" — default state is zero config.

---

## Starlink — Marketing Selling Point

**Headline for the README / landing page:**

> "Works with Starlink. Works with mobile data. Works with any internet — even dynamic IPs. No port forwarding. No static IP required. Just point, connect, go."

This is a genuine differentiator in the African market where:
- Fiber with static IP is expensive and unavailable outside major cities
- Starlink is exploding across rural Africa (Zimbabwe, Zambia, Mozambique, etc.)
- Mobile data hotspot routers are common at smaller branches
- ISPs charge a premium for static IPs that small operators can't afford

NexRAD is the first RADIUS management system built with dynamic-IP branches as the **default assumption**, not an afterthought.

**Competitor comparison on this point:**

| Feature | daloRADIUS | NexRAD |
|---|---|---|
| WireGuard support | None | Built-in |
| Dynamic IP branches | Manual config | Automatic |
| Starlink compatible | No (no WireGuard) | Yes, natively |
| Add branch from UI | No | Yes, with QR |
| Branch online/offline | No | Real-time |
| Works with mobile data | No | Yes |

---

## Name Options (decide before going public)

- **NexRAD** — clean, tech-sounding (working name)
- **RadiantOS** — "radiant" plays on RADIUS, "OS" implies platform
- **HotspotHQ** — descriptive, operator-friendly
- **OpenRAD** — signals open source clearly
- **VaultRAD** — implies security + control

---

*Document created: 2026-05-04*
*Author: Ignatious Chihwayi + Claude*
*Status: Pre-development — architecture phase*

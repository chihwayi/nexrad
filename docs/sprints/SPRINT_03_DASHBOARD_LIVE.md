# Sprint 3 — Live Dashboard & WebSocket Sessions

**Duration:** 4 days | **Goal:** Real-time dashboard showing live sessions, KPI cards with live data, branch status cards, Socket.io WebSocket layer, Redis pub/sub pipeline.

> **AI ASSISTANT:** Before implementing this sprint, read `docs/GROUND_TRUTH.md` for canonical component APIs, import paths, and store names. Sprint docs may conflict — GROUND_TRUTH.md wins.

> After this sprint: any user who logs in sees a real-time dashboard. Numbers update without page refresh. Branch operators see only their branch.

---

## Prerequisites

- Sprint 0, 1, 2 sign-off checklists all ✓
- Docker stack running (`pnpm docker:dev`)
- At least one branch record exists in `nx_branches` (can be seeded)
- `radacct` table exists and has at least a few test rows (or will use empty state UI)

---

## Task 3.1 — Socket.io Server Setup

### `packages/api/src/ws/socket.ts`

```typescript
import { Server as SocketServer } from 'socket.io'
import type { Server as HttpServer } from 'http'
import { redis } from '../db/redis.js'
import { verifyAccessToken } from '../modules/auth/auth.service.js'
import type { AuthUser } from '@nexrad/shared'

export let io: SocketServer

export function initSocket(httpServer: HttpServer) {
  io = new SocketServer(httpServer, {
    cors: { origin: '*', credentials: true },
    transports: ['websocket', 'polling'],
  })

  // Auth middleware — validates JWT on handshake
  io.use(async (socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '')

    if (!token) return next(new Error('Unauthorized'))

    try {
      const user = verifyAccessToken(token)
      socket.data.user = user
      next()
    } catch {
      next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    const user: AuthUser = socket.data.user
    console.info(`WS connected: user=${user.username} role=${user.role}`)

    // Join org room — broadcasts scoped to org
    socket.join(`org:${user.orgId}`)

    // Branch operators join their branch room
    if (user.role === 'branchmanager' || user.role === 'operator') {
      if (user.branchIp) socket.join(`branch:${user.branchIp}`)
    }

    socket.on('subscribe:stats', () => {
      socket.emit('stats:subscribed', { message: 'Streaming live stats' })
    })

    socket.on('disconnect', () => {
      console.info(`WS disconnected: user=${user.username}`)
    })
  })

  // Subscribe to Redis pub/sub for cross-process events
  subscribeToRedisEvents()

  return io
}

async function subscribeToRedisEvents() {
  const subscriber = redis.duplicate()
  await subscriber.connect()

  await subscriber.subscribe('session:start', (message) => {
    const data = JSON.parse(message)
    io.to(`org:${data.orgId}`).emit('session:started', data)
    if (data.nasIp) io.to(`branch:${data.nasIp}`).emit('session:started', data)
  })

  await subscriber.subscribe('session:stop', (message) => {
    const data = JSON.parse(message)
    io.to(`org:${data.orgId}`).emit('session:stopped', data)
    if (data.nasIp) io.to(`branch:${data.nasIp}`).emit('session:stopped', data)
  })

  await subscriber.subscribe('stats:update', (message) => {
    const data = JSON.parse(message)
    io.to(`org:${data.orgId}`).emit('stats:update', data)
  })
}
```

### Update `packages/api/src/server.ts`

```typescript
import { buildApp } from './app.js'
import { connectRedis } from './db/redis.js'
import { pool } from './db/mysql.js'
import { config } from './config.js'
import { initSocket } from './ws/socket.js'
import http from 'http'

async function start() {
  try {
    await pool.query('SELECT 1')
    console.info('MySQL connected')

    await connectRedis()

    const app = await buildApp()

    // Create raw HTTP server so socket.io can attach
    const httpServer = http.createServer(app.server)
    initSocket(httpServer)

    httpServer.listen(config.port, config.host as string, () => {
      console.info(`API listening on http://${config.host}:${config.port}`)
    })
  } catch (err) {
    console.error('Fatal startup error:', err)
    process.exit(1)
  }
}

start()
```

---

## Task 3.2 — Stats Service (API Layer)

### `packages/api/src/modules/stats/stats.service.ts`

```typescript
import { query, queryOne } from '../../db/mysql.js'

export interface GlobalStats {
  activeSessions: number
  todaySessions: number
  uniqueUsersToday: number
  realizedRevenueToday: number
  totalTokens: number
  usedTokens: number
  unusedTokens: number
}

export interface BranchStats {
  nasIp: string
  shortname: string
  name: string
  activeSessions: number
  todaySessions: number
  realizedRevenue: number
  lastSeen: string | null
  status: 'online' | 'recent' | 'inactive'
}

export async function getGlobalStats(orgId: number): Promise<GlobalStats> {
  const [active] = await query<{ count: number }>(
    `
    SELECT COUNT(*) AS count
    FROM radacct
    WHERE acctstoptime IS NULL
      AND nasipaddress IN (
        SELECT nas_ip FROM nx_branches WHERE org_id = ? AND is_active = 1
      )
  `,
    [orgId]
  )

  const [today] = await query<{ count: number; unique: number }>(
    `
    SELECT COUNT(*) AS count, COUNT(DISTINCT username) AS unique_count
    FROM radacct
    WHERE DATE(acctstarttime) = CURDATE()
      AND nasipaddress IN (
        SELECT nas_ip FROM nx_branches WHERE org_id = ? AND is_active = 1
      )
  `,
    [orgId]
  )

  const [revenue] = await query<{ total: number }>(
    `
    SELECT COALESCE(SUM(bp.planCost), 0) AS total
    FROM userbillinfo ubi
    JOIN billing_plans bp ON bp.planName = ubi.planName
    WHERE DATE(ubi.creationdate) = CURDATE()
      AND EXISTS (SELECT 1 FROM radacct ra WHERE ra.username = ubi.username)
      AND ubi.creationby IN (
        SELECT shortname FROM nx_branches WHERE org_id = ?
      )
  `,
    [orgId]
  )

  const [tokens] = await query<{ total: number; used: number }>(
    `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN EXISTS (
        SELECT 1 FROM radacct ra WHERE ra.username = ubi.username
      ) THEN 1 ELSE 0 END) AS used
    FROM userbillinfo ubi
    WHERE ubi.creationby IN (
      SELECT shortname FROM nx_branches WHERE org_id = ?
    )
  `,
    [orgId]
  )

  return {
    activeSessions: Number(active?.count ?? 0),
    todaySessions: Number((today as any)?.count ?? 0),
    uniqueUsersToday: Number((today as any)?.unique_count ?? 0),
    realizedRevenueToday: Number(revenue?.total ?? 0),
    totalTokens: Number(tokens?.total ?? 0),
    usedTokens: Number(tokens?.used ?? 0),
    unusedTokens: Number(tokens?.total ?? 0) - Number(tokens?.used ?? 0),
  }
}

export async function getBranchStats(orgId: number): Promise<BranchStats[]> {
  const branches = await query<{
    nas_ip: string
    shortname: string
    name: string
  }>(
    `
    SELECT nas_ip, shortname, name
    FROM nx_branches
    WHERE org_id = ? AND is_active = 1
    ORDER BY name
  `,
    [orgId]
  )

  const results: BranchStats[] = []

  for (const branch of branches) {
    const [active] = await query<{ count: number }>(
      `
      SELECT COUNT(*) AS count FROM radacct
      WHERE acctstoptime IS NULL AND nasipaddress = ?
    `,
      [branch.nas_ip]
    )

    const [today] = await query<{ count: number }>(
      `
      SELECT COUNT(*) AS count FROM radacct
      WHERE DATE(acctstarttime) = CURDATE() AND nasipaddress = ?
    `,
      [branch.nas_ip]
    )

    const [revenue] = await query<{ total: number }>(
      `
      SELECT COALESCE(SUM(bp.planCost), 0) AS total
      FROM userbillinfo ubi
      JOIN billing_plans bp ON bp.planName = ubi.planName
      WHERE ubi.creationby = ?
        AND DATE(ubi.creationdate) = CURDATE()
        AND EXISTS (SELECT 1 FROM radacct ra WHERE ra.username = ubi.username)
    `,
      [branch.shortname]
    )

    const [lastActivity] = await query<{ last_seen: string | null }>(
      `
      SELECT MAX(acctstarttime) AS last_seen FROM radacct
      WHERE nasipaddress = ?
    `,
      [branch.nas_ip]
    )

    const lastSeen = (lastActivity as any)?.last_seen ?? null
    const minutesAgo = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) / 60000 : Infinity

    const status: BranchStats['status'] =
      minutesAgo < 5 ? 'online' : minutesAgo < 60 ? 'recent' : 'inactive'

    results.push({
      nasIp: branch.nas_ip,
      shortname: branch.shortname,
      name: branch.name,
      activeSessions: Number(active?.count ?? 0),
      todaySessions: Number(today?.count ?? 0),
      realizedRevenue: Number(revenue?.total ?? 0),
      lastSeen,
      status,
    })
  }

  return results
}

export async function getLiveSessions(orgId: number, limit = 50) {
  return query<{
    username: string
    nasipaddress: string
    framedipaddress: string
    acctstarttime: string
    acctsessiontime: number
    acctinputoctets: number
    acctoutputoctets: number
    calledstationid: string
  }>(
    `
    SELECT
      ra.username,
      ra.nasipaddress,
      ra.framedipaddress,
      ra.acctstarttime,
      ra.acctsessiontime,
      ra.acctinputoctets,
      ra.acctoutputoctets,
      ra.calledstationid
    FROM radacct ra
    WHERE ra.acctstoptime IS NULL
      AND ra.nasipaddress IN (
        SELECT nas_ip FROM nx_branches WHERE org_id = ? AND is_active = 1
      )
    ORDER BY ra.acctstarttime DESC
    LIMIT ?
  `,
    [orgId, limit]
  )
}
```

### `packages/api/src/modules/stats/stats.routes.ts`

```typescript
import type { FastifyInstance } from 'fastify'
import { authenticate, requireRole } from '../auth/auth.middleware.js'
import { getGlobalStats, getBranchStats, getLiveSessions } from './stats.service.js'

export async function statsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  app.get('/stats/global', async (req, reply) => {
    const user = req.user!
    const stats = await getGlobalStats(user.orgId)
    return stats
  })

  app.get('/stats/branches', async (req, reply) => {
    const user = req.user!
    const stats = await getBranchStats(user.orgId)
    return stats
  })

  app.get('/stats/sessions/live', async (req, reply) => {
    const user = req.user!
    const sessions = await getLiveSessions(user.orgId)
    return sessions
  })
}
```

### Register in `packages/api/src/app.ts` — add to route registrations:

```typescript
import { statsRoutes } from './modules/stats/stats.routes.js'
// inside buildApp, after other route registrations:
await app.register(statsRoutes, { prefix: '/api' })
```

---

## Task 3.3 — Stats Polling Job (Redis pub/sub broadcaster)

### `packages/api/src/jobs/stats.job.ts`

```typescript
import { redis } from '../db/redis.js'
import { getGlobalStats, getBranchStats } from '../modules/stats/stats.service.js'
import { query } from '../db/mysql.js'

/**
 * Every 10 seconds: fetch global stats per org and publish to Redis.
 * Socket.io subscribers will forward to connected clients.
 */
export async function startStatsJob() {
  const broadcastStats = async () => {
    try {
      const orgs = await query<{ id: number }>(
        'SELECT id FROM nx_organizations WHERE is_active = 1'
      )

      for (const org of orgs) {
        const [global, branches] = await Promise.all([
          getGlobalStats(org.id),
          getBranchStats(org.id),
        ])

        await redis.publish(
          'stats:update',
          JSON.stringify({ orgId: org.id, global, branches, timestamp: new Date().toISOString() })
        )
      }
    } catch (err) {
      console.error('Stats job error:', err)
    }
  }

  // Initial broadcast
  await broadcastStats()

  // Every 10 seconds
  setInterval(broadcastStats, 10_000)
  console.info('Stats broadcast job started (10s interval)')
}
```

### Update `packages/api/src/server.ts` — add job start:

```typescript
import { startStatsJob } from './jobs/stats.job.js'
// After initSocket(httpServer):
await startStatsJob()
```

---

## Task 3.4 — Frontend: Socket.io Client Hook

### Install socket.io-client:

```bash
cd packages/web
pnpm add socket.io-client
```

### `packages/web/src/hooks/useSocket.ts`

```typescript
import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuth } from '@/stores/auth.store'

let socketInstance: Socket | null = null

export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(import.meta.env.VITE_API_URL || 'http://localhost:3000', {
      autoConnect: false,
      transports: ['websocket'],
    })
  }
  return socketInstance
}

export function useSocket() {
  const token = useAuth((s) => s.accessToken)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!token) return

    const socket = getSocket()
    socket.auth = { token }
    socket.connect()
    socketRef.current = socket

    return () => {
      socket.disconnect()
      socketInstance = null
    }
  }, [token])

  return socketRef.current
}
```

### `packages/web/src/hooks/useLiveStats.ts`

```typescript
import { useEffect, useState } from 'react'
import { getSocket } from './useSocket'
import { api } from '@/lib/api'
import type { GlobalStats, BranchStats } from '@nexrad/shared'

interface LiveStatsState {
  global: GlobalStats | null
  branches: BranchStats[]
  loading: boolean
  lastUpdated: string | null
}

export function useLiveStats() {
  const [state, setState] = useState<LiveStatsState>({
    global: null,
    branches: [],
    loading: true,
    lastUpdated: null,
  })

  // Initial HTTP fetch
  useEffect(() => {
    Promise.all([api.get<GlobalStats>('/stats/global'), api.get<BranchStats[]>('/stats/branches')])
      .then(([globalRes, branchRes]) => {
        setState((s) => ({
          ...s,
          global: globalRes.data,
          branches: branchRes.data,
          loading: false,
          lastUpdated: new Date().toISOString(),
        }))
      })
      .catch(() => setState((s) => ({ ...s, loading: false })))
  }, [])

  // WebSocket real-time updates
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    const handleUpdate = (data: {
      global: GlobalStats
      branches: BranchStats[]
      timestamp: string
    }) => {
      setState({
        global: data.global,
        branches: data.branches,
        loading: false,
        lastUpdated: data.timestamp,
      })
    }

    socket.on('stats:update', handleUpdate)
    socket.emit('subscribe:stats')

    return () => {
      socket.off('stats:update', handleUpdate)
    }
  }, [])

  return state
}
```

### `packages/web/src/hooks/useLiveSessions.ts`

```typescript
import { useEffect, useState } from 'react'
import { getSocket } from './useSocket'
import { api } from '@/lib/api'

export interface LiveSession {
  username: string
  nasipaddress: string
  framedipaddress: string
  acctstarttime: string
  acctsessiontime: number
  acctinputoctets: number
  acctoutputoctets: number
  calledstationid: string
}

export function useLiveSessions() {
  const [sessions, setSessions] = useState<LiveSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<LiveSession[]>('/stats/sessions/live').then((res) => {
      setSessions(res.data)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    socket.on('session:started', (session: LiveSession) => {
      setSessions((prev) => [session, ...prev].slice(0, 100))
    })

    socket.on('session:stopped', ({ username }: { username: string }) => {
      setSessions((prev) => prev.filter((s) => s.username !== username))
    })

    return () => {
      socket.off('session:started')
      socket.off('session:stopped')
    }
  }, [])

  return { sessions, loading }
}
```

---

## Task 3.5 — Dashboard Page (Full Implementation)

### `packages/web/src/pages/Dashboard.tsx`

```tsx
import { useLiveStats } from '@/hooks/useLiveStats'
import { useLiveSessions } from '@/hooks/useLiveSessions'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { formatCurrency, formatBytes, formatDuration } from '@/lib/utils'
import { Users, Wifi, DollarSign, Ticket, TrendingUp, Activity } from 'lucide-react'

export default function Dashboard() {
  const { global, branches, loading, lastUpdated } = useLiveStats()
  const { sessions, loading: sessionsLoading } = useLiveSessions()

  const sessionColumns = [
    { key: 'username', header: 'Username' },
    {
      key: 'nasipaddress',
      header: 'Branch',
      cell: (row: LiveSession) => {
        const branch = branches.find((b) => b.nasIp === row.nasipaddress)
        return branch?.name ?? row.nasipaddress
      },
    },
    { key: 'framedipaddress', header: 'IP Address' },
    {
      key: 'acctstarttime',
      header: 'Connected',
      cell: (row: LiveSession) => new Date(row.acctstarttime).toLocaleTimeString(),
    },
    {
      key: 'acctsessiontime',
      header: 'Duration',
      cell: (row: LiveSession) => formatDuration(row.acctsessiontime),
    },
    {
      key: 'acctinputoctets',
      header: 'Down',
      cell: (row: LiveSession) => formatBytes(row.acctinputoctets),
    },
    {
      key: 'acctoutputoctets',
      header: 'Up',
      cell: (row: LiveSession) => formatBytes(row.acctoutputoctets),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Dashboard"
        subtitle={
          lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : 'Connecting...'
        }
        actions={
          <span className="flex items-center gap-1.5 text-sm text-success">
            <span className="live-dot" />
            Live
          </span>
        }
      />

      {/* Global KPI Cards */}
      <div className="kpi-grid">
        <StatCard
          label="Active Sessions"
          value={global?.activeSessions ?? 0}
          icon={Wifi}
          colour="green"
          loading={loading}
        />
        <StatCard
          label="Sessions Today"
          value={global?.todaySessions ?? 0}
          icon={Activity}
          colour="blue"
          loading={loading}
        />
        <StatCard
          label="Revenue Today"
          value={formatCurrency(global?.realizedRevenueToday ?? 0)}
          icon={DollarSign}
          colour="amber"
          loading={loading}
        />
        <StatCard
          label="Unique Users"
          value={global?.uniqueUsersToday ?? 0}
          icon={Users}
          colour="default"
          loading={loading}
        />
        <StatCard
          label="Tokens Used"
          value={global?.usedTokens ?? 0}
          icon={Ticket}
          colour="default"
          loading={loading}
        />
        <StatCard
          label="Tokens Available"
          value={global?.unusedTokens ?? 0}
          icon={TrendingUp}
          colour="default"
          loading={loading}
        />
      </div>

      {/* Branch Status Cards */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Branch Status
        </h2>
        {loading ? (
          <div className="card-grid">
            {[1, 2, 3].map((i) => (
              <div key={i} className="kpi-card animate-pulse h-28 bg-muted/30" />
            ))}
          </div>
        ) : branches.length === 0 ? (
          <p className="text-muted-foreground text-sm">No branches configured.</p>
        ) : (
          <div className="card-grid">
            {branches.map((branch) => (
              <BranchCard key={branch.nasIp} branch={branch} />
            ))}
          </div>
        )}
      </section>

      {/* Live Sessions Table */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Live Sessions ({sessions.length})
        </h2>
        <DataTable
          data={sessions}
          columns={sessionColumns}
          rowKey={(row) => row.username}
          loading={sessionsLoading}
          emptyText="No active sessions right now."
        />
      </section>
    </div>
  )
}

interface BranchCardProps {
  branch: {
    nasIp: string
    name: string
    shortname: string
    activeSessions: number
    todaySessions: number
    realizedRevenue: number
    status: 'online' | 'recent' | 'inactive'
    lastSeen: string | null
  }
}

function BranchCard({ branch }: BranchCardProps) {
  const statusClass = {
    online: 'badge-online',
    recent: 'badge-warning',
    inactive: 'badge-offline',
  }[branch.status]

  const statusLabel = {
    online: 'Online',
    recent: 'Recent',
    inactive: 'Inactive',
  }[branch.status]

  return (
    <div className="kpi-card group hover:shadow-md transition-shadow cursor-default">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-foreground">{branch.name}</p>
          <p className="text-xs text-muted-foreground">{branch.nasIp}</p>
        </div>
        <span className={statusClass}>{statusLabel}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-bold text-foreground">{branch.activeSessions}</p>
          <p className="text-xs text-muted-foreground">Live</p>
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">{branch.todaySessions}</p>
          <p className="text-xs text-muted-foreground">Today</p>
        </div>
        <div>
          <p className="text-lg font-bold text-success">{formatCurrency(branch.realizedRevenue)}</p>
          <p className="text-xs text-muted-foreground">Revenue</p>
        </div>
      </div>
      {branch.lastSeen && (
        <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
          Last seen: {new Date(branch.lastSeen).toLocaleTimeString()}
        </p>
      )}
    </div>
  )
}
```

---

## Task 3.6 — Shared Types Update

### Add to `packages/shared/src/types/report.types.ts` (or create stats.types.ts):

### `packages/shared/src/types/stats.types.ts`

```typescript
export interface GlobalStats {
  activeSessions: number
  todaySessions: number
  uniqueUsersToday: number
  realizedRevenueToday: number
  totalTokens: number
  usedTokens: number
  unusedTokens: number
}

export interface BranchStats {
  nasIp: string
  shortname: string
  name: string
  activeSessions: number
  todaySessions: number
  realizedRevenue: number
  lastSeen: string | null
  status: 'online' | 'recent' | 'inactive'
}

export interface WsStatsUpdate {
  orgId: number
  global: GlobalStats
  branches: BranchStats[]
  timestamp: string
}
```

### Update `packages/shared/src/index.ts` — add export:

```typescript
export * from './types/stats.types.js'
```

---

## Task 3.7 — Wire Dashboard into Router

### Update `packages/web/src/App.tsx`:

> **IMPORTANT:** BrowserRouter is already in `main.tsx` — do NOT add it here. AppShell uses `<Outlet />` — do NOT pass children to it. Just add the Dashboard import and lazy-load it under the existing protected shell route.

```tsx
// Add this import at the top of the existing App.tsx:
const Dashboard = lazy(() => import('@/pages/Dashboard'))

// Replace the existing /dashboard placeholder route with:
<Route
  path="/dashboard"
  element={
    <Suspense fallback={<Fallback />}>
      <Dashboard />
    </Suspense>
  }
/>
```

The full App.tsx after Sprint 3 should look like:

```tsx
import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/stores/auth.store'
import AppShell from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { PageSkeleton } from '@/components/shared/PageSkeleton'

const Login = lazy(() => import('@/pages/Login'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))

function Fallback() {
  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6">
      <PageSkeleton />
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { user } = useAuth()

  return (
    <ErrorBoundary>
      <Routes>
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Suspense fallback={<div className="min-h-screen bg-background" />}>
                <Login />
              </Suspense>
            )
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<Fallback />}>
                <Dashboard />
              </Suspense>
            }
          />
          {/* Sprint 4+ routes added below here */}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}
```

---

## Task 3.8 — Connect Socket on App Load

### Update `packages/web/src/App.tsx` — add socket init effect:

```tsx
import { useEffect } from 'react'
import { useSocket } from './hooks/useSocket'

// Inside App component, add at the top:
// useSocket() — manages connect/disconnect lifecycle based on auth state
// Call it here so socket is alive for the entire authenticated session
function SocketManager() {
  useSocket()
  return null
}

// Add <SocketManager /> inside ProtectedRoute before AppShell content
```

Add `SocketManager` to the existing `App.tsx` — update `ProtectedRoute` only:

```tsx
import { useSocket } from '@/hooks/useSocket'

function SocketManager() {
  useSocket()
  return null
}

// Update ProtectedRoute in existing App.tsx to include SocketManager:
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return (
    <>
      <SocketManager />
      {children}
    </>
  ) : (
    <Navigate to="/login" replace />
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppShell>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                </Routes>
              </AppShell>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
```

---

## Task 3.9 — Environment Variables

### Add to `packages/web/.env` (create from `.env.example`):

```
VITE_API_URL=http://localhost:3000
```

### Add to `.env.example` at repo root:

```
# Web
VITE_API_URL=http://localhost:3000
```

---

## Task 3.10 — Integration Test (API Stats Endpoints)

### `packages/api/src/modules/stats/__tests__/stats.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../../app.js'
import type { FastifyInstance } from 'fastify'

describe('Stats endpoints', () => {
  let app: FastifyInstance
  let token: string

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()

    // Login as admin to get token
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'admin', password: 'admin123' },
    })
    token = res.json().accessToken
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /api/stats/global returns stats shape', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/stats/global',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(typeof body.activeSessions).toBe('number')
    expect(typeof body.realizedRevenueToday).toBe('number')
    expect(typeof body.totalTokens).toBe('number')
  })

  it('GET /api/stats/branches returns array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/stats/branches',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })

  it('GET /api/stats/sessions/live returns array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/stats/sessions/live',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stats/global' })
    expect(res.statusCode).toBe(401)
  })
})
```

---

## Task 3.11 — Sidebar Nav Update (add Dashboard link if not present)

### Verify `packages/web/src/components/Sidebar.tsx` contains a Dashboard nav item:

```tsx
// The nav items array should include:
{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['superadmin','orgadmin','branchmanager','operator','readonly'] }
```

---

## Sprint 3 Sign-Off Checklist

Before marking Sprint 3 complete, every item must be ✓:

- [ ] `pnpm typecheck` exits 0 in all packages
- [ ] `pnpm lint` exits 0 in all packages
- [ ] `pnpm test` passes (stats.test.ts all green, coverage >60%)
- [ ] `GET /api/stats/global` returns correct shape with a valid JWT
- [ ] `GET /api/stats/branches` returns array (may be empty if no branches)
- [ ] `GET /api/stats/sessions/live` returns array
- [ ] Socket.io connection works: open browser devtools Network tab, filter `ws://`, see connection established after login
- [ ] Dashboard loads without console errors
- [ ] KPI cards show numbers (or 0 if no data) — no blank/undefined values
- [ ] Branch status cards render (online/recent/inactive badge shows correctly)
- [ ] Live sessions table renders (empty state message if no sessions)
- [ ] Stats update in real-time: start a test radacct entry in MySQL, stats update within 15 seconds without page refresh
- [ ] Branch operator (role=operator) sees only their branch in branch stats
- [ ] `pnpm build` succeeds
- [ ] `pnpm docker:dev` still starts all containers cleanly

**CI must be green before Sprint 4 begins.**

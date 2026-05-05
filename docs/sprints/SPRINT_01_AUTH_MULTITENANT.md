# Sprint 1 — Auth & Multi-tenant Foundation

**Duration:** 5 days | **Goal:** Login/logout working, JWT + refresh tokens, RBAC middleware enforced, multi-tenant org isolation in place.

> **AI ASSISTANT:** Before implementing this sprint, read `docs/GROUND_TRUTH.md` for canonical component APIs, import paths, and store names. Sprint docs may conflict — GROUND_TRUTH.md wins.

> Every subsequent sprint builds features on top of this auth layer. Get it right here.

---

## Prerequisites

- Sprint 0 sign-off complete ✓
- Docker dev stack running
- Migrations 001 + 002 applied

---

## Task 1.1 — Seed Super Admin

Add to migration 002 or a separate seed file `003_seed.sql`:

```sql
-- Password: 'admin123' (bcrypt, cost 12) — CHANGE IN PRODUCTION
INSERT IGNORE INTO nx_users (id, org_id, username, email, password, role)
VALUES (
  1, NULL, 'superadmin', 'admin@nexrad.io',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniMNou58b4kHFRZ3K3nIMnm7.',
  'superadmin'
);
```

---

## Task 1.2 — Auth Service

**File:** `packages/api/src/services/auth.service.ts`

```typescript
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { query, queryOne } from '../db/mysql.js'
import { redis } from '../db/redis.js'
import { config } from '../config.js'
import type { AuthUser, JwtPayload, LoginResponse } from '@nexrad/shared'

export class AuthService {
  async login(username: string, password: string): Promise<LoginResponse> {
    const user = await queryOne<any>(
      `SELECT id, org_id, username, email, password, role, branch_ip, is_active
       FROM nx_users WHERE username = ? LIMIT 1`,
      [username]
    )
    if (!user || !user.is_active) throw new Error('Invalid credentials')

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) throw new Error('Invalid credentials')

    // Fetch org slug for context
    const org = user.org_id
      ? await queryOne<any>('SELECT slug FROM nx_organizations WHERE id = ?', [user.org_id])
      : null

    await query('UPDATE nx_users SET last_login = NOW() WHERE id = ?', [user.id])

    const authUser: AuthUser = {
      id: user.id,
      orgId: user.org_id,
      username: user.username,
      email: user.email,
      role: user.role,
      branchIp: user.branch_ip,
      orgSlug: org?.slug ?? null,
    }

    const accessToken = this.signAccess(authUser)
    const refreshToken = await this.createRefresh(user.id)

    return { accessToken, refreshToken, user: authUser }
  }

  async refresh(token: string): Promise<{ accessToken: string }> {
    // Verify token is in DB and not revoked
    const hash = await this.hashToken(token)
    const row = await queryOne<any>(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked,
              u.id as uid, u.org_id, u.username, u.email, u.role,
              u.branch_ip, u.is_active
       FROM nx_refresh_tokens rt JOIN nx_users u ON u.id = rt.user_id
       WHERE rt.token_hash = ? LIMIT 1`,
      [hash]
    )
    if (!row || row.revoked || new Date(row.expires_at) < new Date()) {
      throw new Error('Invalid or expired refresh token')
    }
    if (!row.is_active) throw new Error('Account disabled')

    const authUser: AuthUser = {
      id: row.uid,
      orgId: row.org_id,
      username: row.username,
      email: row.email,
      role: row.role,
      branchIp: row.branch_ip,
      orgSlug: null,
    }

    return { accessToken: this.signAccess(authUser) }
  }

  async logout(refreshToken: string): Promise<void> {
    const hash = await this.hashToken(refreshToken)
    await query('UPDATE nx_refresh_tokens SET revoked = 1 WHERE token_hash = ?', [hash])
  }

  private signAccess(user: AuthUser): string {
    return jwt.sign(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
        orgId: user.orgId,
        branchIp: user.branchIp,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn as any }
    )
  }

  private async createRefresh(userId: number): Promise<string> {
    const token = uuidv4()
    const hash = await this.hashToken(token)
    const exp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await query('INSERT INTO nx_refresh_tokens (user_id, token_hash, expires_at) VALUES (?,?,?)', [
      userId,
      hash,
      exp,
    ])
    return token
  }

  private async hashToken(token: string): Promise<string> {
    const { createHash } = await import('crypto')
    return createHash('sha256').update(token).digest('hex')
  }
}

export const authService = new AuthService()
```

---

## Task 1.3 — Auth Middleware

**File:** `packages/api/src/middleware/auth.ts`

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import type { JwtPayload, UserRole } from '@nexrad/shared'

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload
  }
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return reply.code(401).send({ success: false, error: 'Unauthorized' })
  }
  try {
    const payload = jwt.verify(auth.slice(7), config.jwt.secret) as JwtPayload
    req.user = payload
  } catch {
    return reply.code(401).send({ success: false, error: 'Token expired or invalid' })
  }
}

// Role guard factory — use as preHandler
export function requireRole(...roles: UserRole[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await authenticate(req, reply)
    if (reply.sent) return
    if (!roles.includes(req.user.role)) {
      return reply.code(403).send({ success: false, error: 'Insufficient permissions' })
    }
  }
}

// Scope guard — enforces org isolation
export function requireOrg() {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await authenticate(req, reply)
    if (reply.sent) return
    if (req.user.role === 'superadmin') return // superadmin sees all
    const paramOrgId = (req.params as any).orgId
    if (paramOrgId && Number(paramOrgId) !== req.user.orgId) {
      return reply.code(403).send({ success: false, error: 'Access denied to this organization' })
    }
  }
}

// Branch scope guard
export function requireBranchAccess() {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await authenticate(req, reply)
    if (reply.sent) return
    const { role, branchIp } = req.user
    if (['superadmin', 'orgadmin'].includes(role)) return
    if (role === 'branchmanager' || role === 'operator') {
      const paramIp = (req.params as any).branchIp || (req.query as any).branchIp
      if (paramIp && paramIp !== branchIp) {
        return reply.code(403).send({ success: false, error: 'Access denied to this branch' })
      }
    }
  }
}
```

---

## Task 1.4 — Auth Routes

**File:** `packages/api/src/routes/auth.ts`

```typescript
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authService } from '../services/auth.service.js'
import { authenticate } from '../middleware/auth.js'

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (req, reply) => {
    const body = loginSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid input' })
    try {
      const result = await authService.login(body.data.username, body.data.password)
      return reply.send({ success: true, data: result })
    } catch (err: any) {
      return reply.code(401).send({ success: false, error: err.message })
    }
  })

  app.post('/auth/refresh', async (req, reply) => {
    const { refreshToken } = req.body as any
    if (!refreshToken)
      return reply.code(400).send({ success: false, error: 'refreshToken required' })
    try {
      const result = await authService.refresh(refreshToken)
      return reply.send({ success: true, data: result })
    } catch (err: any) {
      return reply.code(401).send({ success: false, error: err.message })
    }
  })

  app.post('/auth/logout', { preHandler: [authenticate] }, async (req, reply) => {
    const { refreshToken } = req.body as any
    if (refreshToken) await authService.logout(refreshToken)
    return reply.send({ success: true })
  })

  app.get('/auth/me', { preHandler: [authenticate] }, async (req, reply) => {
    return reply.send({ success: true, data: req.user })
  })
}
```

---

## Task 1.5 — Organization Routes

**File:** `packages/api/src/routes/organizations.ts`

```typescript
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireRole } from '../middleware/auth.js'
import { query, queryOne } from '../db/mysql.js'
import bcrypt from 'bcryptjs'

const createOrgSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
  commissionRate: z.number().min(0).max(1).default(0.1),
  adminUsername: z.string().min(3),
  adminPassword: z.string().min(8),
  adminEmail: z.string().email().optional(),
})

export async function organizationRoutes(app: FastifyInstance) {
  // List all orgs — superadmin only
  app.get(
    '/organizations',
    {
      preHandler: [requireRole('superadmin')],
    },
    async (_req, reply) => {
      const orgs = await query(`
      SELECT o.*, COUNT(DISTINCT u.id) as user_count, COUNT(DISTINCT b.id) as branch_count
      FROM nx_organizations o
      LEFT JOIN nx_users u ON u.org_id = o.id
      LEFT JOIN nx_branches b ON b.org_id = o.id
      GROUP BY o.id ORDER BY o.name
    `)
      return reply.send({ success: true, data: orgs })
    }
  )

  // Create org — superadmin only
  app.post(
    '/organizations',
    {
      preHandler: [requireRole('superadmin')],
    },
    async (req, reply) => {
      const body = createOrgSchema.safeParse(req.body)
      if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })
      const { name, slug, commissionRate, adminUsername, adminPassword, adminEmail } = body.data

      const exists = await queryOne('SELECT id FROM nx_organizations WHERE slug = ?', [slug])
      if (exists) return reply.code(409).send({ success: false, error: 'Slug already taken' })

      const [orgResult]: any = await query(
        'INSERT INTO nx_organizations (name, slug, commission_rate) VALUES (?,?,?)',
        [name, slug, commissionRate]
      )
      const orgId = orgResult.insertId
      const hash = await bcrypt.hash(adminPassword, 12)

      await query(
        `INSERT INTO nx_users (org_id, username, email, password, role)
       VALUES (?,?,?,?,'orgadmin')`,
        [orgId, adminUsername, adminEmail ?? null, hash]
      )

      return reply.code(201).send({ success: true, data: { orgId, slug } })
    }
  )

  // Get own org — orgadmin+
  app.get(
    '/organizations/me',
    {
      preHandler: [requireRole('orgadmin', 'branchmanager', 'operator', 'readonly')],
    },
    async (req, reply) => {
      const org = await queryOne('SELECT * FROM nx_organizations WHERE id = ?', [req.user.orgId])
      return reply.send({ success: true, data: org })
    }
  )
}
```

---

## Task 1.6 — Register All Routes in app.ts

Update `packages/api/src/app.ts` to import and register routes:

```typescript
// Add after existing registrations:
import { authRoutes } from './routes/auth.js'
import { organizationRoutes } from './routes/organizations.js'

// Inside buildApp():
await app.register(authRoutes, { prefix: '/api' })
await app.register(organizationRoutes, { prefix: '/api' })
```

---

## Task 1.7 — Frontend Auth Store

**File:** `packages/web/src/stores/auth.store.ts`

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser } from '@nexrad/shared'
import { api } from '@/lib/api'

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,

      login: async (username, password) => {
        set({ isLoading: true })
        const res = await api.post('/auth/login', { username, password })
        const { accessToken, refreshToken, user } = res.data.data
        set({ user, accessToken, refreshToken, isLoading: false })
      },

      logout: async () => {
        const { refreshToken } = get()
        if (refreshToken) await api.post('/auth/logout', { refreshToken }).catch(() => {})
        set({ user: null, accessToken: null, refreshToken: null })
      },

      refresh: async () => {
        const { refreshToken } = get()
        if (!refreshToken) throw new Error('No refresh token')
        const res = await api.post('/auth/refresh', { refreshToken })
        set({ accessToken: res.data.data.accessToken })
      },
    }),
    {
      name: 'nexrad-auth',
      partialize: (s) => ({ refreshToken: s.refreshToken, user: s.user }),
    }
  )
)
```

**File:** `packages/web/src/lib/api.ts`

```typescript
import axios from 'axios'
import { useAuth } from '@/stores/auth.store'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL + '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        await useAuth.getState().refresh()
        return api(original)
      } catch {
        useAuth.getState().logout()
      }
    }
    return Promise.reject(error)
  }
)
```

---

## Task 1.8 — Login Page UI

**File:** `packages/web/src/pages/Login.tsx`

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InlineAlert } from '@/components/shared/AlertBanner'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/dashboard')
    } catch {
      setError('Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto shadow-lg">
            <span className="text-white text-2xl font-black">N</span>
          </div>
          <h1 className="text-2xl font-bold">NexRAD</h1>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-card"
        >
          {error && <div className="badge-error rounded-lg px-3 py-2 text-sm">{error}</div>}
          <div className="space-y-2">
            <label className="text-sm font-medium">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm
                         focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              placeholder="Enter username"
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm
                         focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              placeholder="Enter password"
              autoComplete="current-password"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold
                       hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          NexRAD — Open Source RADIUS Management
        </p>
      </div>
    </div>
  )
}
```

---

## Task 1.9 — Router Setup + Protected Routes

**File:** `packages/web/src/App.tsx`

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './stores/auth.store'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AppShell from './components/layout/AppShell'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          {/* Additional routes added per sprint */}
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
```

---

## Task 1.10 — API Integration Tests

**File:** `packages/api/src/routes/auth.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../app.js'

describe('POST /api/auth/login', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })

  it('returns 401 for wrong credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nobody', password: 'wrong' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns tokens for valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'superadmin', password: 'admin123' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data).toHaveProperty('accessToken')
    expect(body.data).toHaveProperty('refreshToken')
  })
})
```

---

## Sprint 1 Sign-Off Checklist

- [ ] `POST /api/auth/login` returns tokens for valid credentials
- [ ] `POST /api/auth/login` returns 401 for invalid credentials
- [ ] `GET /api/auth/me` returns user object with valid token, 401 without
- [ ] `POST /api/auth/refresh` returns new access token
- [ ] `POST /api/auth/logout` revokes refresh token
- [ ] `POST /api/organizations` creates org + admin user (superadmin only)
- [ ] Role middleware blocks lower-role access to restricted routes
- [ ] Branch scope middleware blocks cross-branch access
- [ ] Login page renders, submits, redirects to /dashboard on success
- [ ] Auth persists across page reload (Zustand persist)
- [ ] Auto-refresh kicks in on 401 response
- [ ] All auth tests pass: `pnpm test`
- [ ] `pnpm lint && pnpm typecheck` clean
- [ ] CI green ✓

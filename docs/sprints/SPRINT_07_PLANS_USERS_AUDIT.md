# Sprint 7 — Billing Plans, User Management & Audit Log
**Duration:** 4 days | **Goal:** Full billing plan CRUD, user management (invite/deactivate/role assign), session kick, token expiry enforcement, and a searchable audit log.

> After this sprint: admins can manage who accesses the system, configure pricing plans, force-disconnect misbehaving sessions, and view a full audit trail of every action.

---

## Prerequisites
- Sprint 0–6 sign-off checklists all ✓
- `nx_billing_plans`, `nx_users`, `nx_audit_log` tables exist (from Migration 002)

---

## Task 7.1 — Billing Plan Service (API)

### `packages/api/src/modules/plans/plan.service.ts`
```typescript
import { query, queryOne } from '../../db/mysql.js'

export interface BillingPlan {
  id: number
  orgId: number
  name: string
  displayName: string | null
  timeBankHours: number
  dataLimitMb: number | null
  cost: number
  currency: string
  frGroupName: string | null
  isActive: boolean
  createdAt: string
}

export interface CreatePlanInput {
  orgId: number
  name: string
  displayName?: string
  timeBankHours: number
  dataLimitMb?: number
  cost: number
  currency: string
  frGroupName?: string
}

export async function listPlans(orgId: number, includeInactive = false): Promise<BillingPlan[]> {
  return query<BillingPlan>(`
    SELECT id, org_id AS orgId, name, display_name AS displayName,
           time_bank_hours AS timeBankHours, data_limit_mb AS dataLimitMb,
           cost, currency, fr_group_name AS frGroupName,
           is_active AS isActive, created_at AS createdAt
    FROM nx_billing_plans
    WHERE org_id = ? ${includeInactive ? '' : 'AND is_active = 1'}
    ORDER BY cost
  `, [orgId])
}

export async function getPlan(orgId: number, id: number): Promise<BillingPlan | null> {
  return queryOne<BillingPlan>(`
    SELECT id, org_id AS orgId, name, display_name AS displayName,
           time_bank_hours AS timeBankHours, data_limit_mb AS dataLimitMb,
           cost, currency, fr_group_name AS frGroupName,
           is_active AS isActive, created_at AS createdAt
    FROM nx_billing_plans
    WHERE id = ? AND org_id = ?
  `, [id, orgId])
}

export async function createPlan(input: CreatePlanInput): Promise<BillingPlan> {
  const [result] = await query<{ insertId: number }>(`
    INSERT INTO nx_billing_plans
      (org_id, name, display_name, time_bank_hours, data_limit_mb, cost, currency, fr_group_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    input.orgId, input.name, input.displayName ?? null, input.timeBankHours,
    input.dataLimitMb ?? null, input.cost, input.currency, input.frGroupName ?? null,
  ])

  // Sync to FreeRADIUS billing_plans table for daloRADIUS compat
  await query(`
    INSERT IGNORE INTO billing_plans (planName, planCost, planCurrency, planTimeBank)
    VALUES (?, ?, ?, ?)
  `, [input.name, input.cost, input.currency, input.timeBankHours])

  // Create FreeRADIUS group policy if frGroupName specified
  if (input.frGroupName) {
    await syncFrGroupPolicy(input.frGroupName, input.timeBankHours, input.dataLimitMb)
  }

  return getPlan(input.orgId, (result as any).insertId) as Promise<BillingPlan>
}

export async function updatePlan(
  orgId: number,
  id: number,
  updates: Partial<Omit<CreatePlanInput, 'orgId'>>
): Promise<BillingPlan | null> {
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
  if (updates.displayName !== undefined) { fields.push('display_name = ?'); values.push(updates.displayName) }
  if (updates.timeBankHours !== undefined) { fields.push('time_bank_hours = ?'); values.push(updates.timeBankHours) }
  if (updates.dataLimitMb !== undefined) { fields.push('data_limit_mb = ?'); values.push(updates.dataLimitMb) }
  if (updates.cost !== undefined) { fields.push('cost = ?'); values.push(updates.cost) }
  if (updates.currency !== undefined) { fields.push('currency = ?'); values.push(updates.currency) }
  if (updates.frGroupName !== undefined) { fields.push('fr_group_name = ?'); values.push(updates.frGroupName) }

  if (!fields.length) return getPlan(orgId, id)

  values.push(id, orgId)
  await query(`UPDATE nx_billing_plans SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`, values)
  return getPlan(orgId, id)
}

export async function togglePlanActive(orgId: number, id: number): Promise<BillingPlan | null> {
  await query(
    'UPDATE nx_billing_plans SET is_active = NOT is_active WHERE id = ? AND org_id = ?',
    [id, orgId]
  )
  return getPlan(orgId, id)
}

/**
 * Sync FreeRADIUS radgroupcheck/radgroupreply for a plan group.
 * Enforces Max-All-Session (total seconds) and Octets-Limit if dataLimitMb set.
 */
async function syncFrGroupPolicy(
  groupName: string,
  timeBankHours: number,
  dataLimitMb?: number | null
) {
  const totalSeconds = timeBankHours * 3600

  // Remove existing policies for this group
  await query('DELETE FROM radgroupcheck WHERE groupname = ?', [groupName])
  await query('DELETE FROM radgroupreply WHERE groupname = ?', [groupName])

  // Time limit check
  await query(`
    INSERT INTO radgroupcheck (groupname, attribute, op, value)
    VALUES (?, 'Max-All-Session', ':=', ?)
  `, [groupName, String(totalSeconds)])

  // Data limit reply (if set)
  if (dataLimitMb) {
    const bytes = dataLimitMb * 1048576
    await query(`
      INSERT INTO radgroupreply (groupname, attribute, op, value)
      VALUES (?, 'ChilliSpot-Max-Total-Octets', ':=', ?)
    `, [groupName, String(bytes)])
  }

  // Session timeout reply
  await query(`
    INSERT INTO radgroupreply (groupname, attribute, op, value)
    VALUES (?, 'Session-Timeout', ':=', ?)
  `, [groupName, String(totalSeconds)])
}
```

---

## Task 7.2 — Full Plan Routes (replaces Sprint 5 stub)

### Update `packages/api/src/modules/plans/plan.routes.ts`:
```typescript
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireRole } from '../auth/auth.middleware.js'
import { listPlans, getPlan, createPlan, updatePlan, togglePlanActive } from './plan.service.js'

const PlanSchema = z.object({
  name: z.string().min(2).max(100),
  displayName: z.string().max(100).optional(),
  timeBankHours: z.number().int().positive(),
  dataLimitMb: z.number().int().positive().optional(),
  cost: z.number().nonnegative(),
  currency: z.string().length(3),
  frGroupName: z.string().max(64).optional(),
})

export async function planRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  app.get('/plans', async (req) => {
    const showAll = (req.query as any).all === 'true'
    return listPlans(req.user!.orgId, showAll)
  })

  app.get<{ Params: { id: string } }>('/plans/:id', async (req, reply) => {
    const plan = await getPlan(req.user!.orgId, Number(req.params.id))
    if (!plan) return reply.status(404).send({ error: 'Plan not found' })
    return plan
  })

  app.post(
    '/plans',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      const body = PlanSchema.parse(req.body)
      const plan = await createPlan({ ...body, orgId: req.user!.orgId })
      return reply.status(201).send(plan)
    }
  )

  app.patch<{ Params: { id: string } }>(
    '/plans/:id',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      const updates = PlanSchema.partial().parse(req.body)
      const plan = await updatePlan(req.user!.orgId, Number(req.params.id), updates)
      if (!plan) return reply.status(404).send({ error: 'Plan not found' })
      return plan
    }
  )

  app.post<{ Params: { id: string } }>(
    '/plans/:id/toggle',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      const plan = await togglePlanActive(req.user!.orgId, Number(req.params.id))
      if (!plan) return reply.status(404).send({ error: 'Plan not found' })
      return plan
    }
  )
}
```

---

## Task 7.3 — User Management Service (API)

### `packages/api/src/modules/users/user.service.ts`
```typescript
import bcrypt from 'bcryptjs'
import { query, queryOne } from '../../db/mysql.js'
import type { UserRole } from '@nexrad/shared'

export interface AppUser {
  id: number
  orgId: number | null
  username: string
  email: string | null
  role: UserRole
  branchIp: string | null
  isActive: boolean
  lastLogin: string | null
  createdAt: string
}

export async function listUsers(orgId: number): Promise<AppUser[]> {
  return query<AppUser>(`
    SELECT id, org_id AS orgId, username, email, role,
           branch_ip AS branchIp, is_active AS isActive,
           last_login AS lastLogin, created_at AS createdAt
    FROM nx_users
    WHERE org_id = ?
    ORDER BY username
  `, [orgId])
}

export async function getUser(orgId: number, id: number): Promise<AppUser | null> {
  return queryOne<AppUser>(`
    SELECT id, org_id AS orgId, username, email, role,
           branch_ip AS branchIp, is_active AS isActive,
           last_login AS lastLogin, created_at AS createdAt
    FROM nx_users
    WHERE id = ? AND org_id = ?
  `, [id, orgId])
}

export async function createUser(opts: {
  orgId: number
  username: string
  email?: string
  password: string
  role: UserRole
  branchIp?: string
}): Promise<AppUser> {
  const hash = await bcrypt.hash(opts.password, 12)
  const [result] = await query<{ insertId: number }>(`
    INSERT INTO nx_users (org_id, username, email, password, role, branch_ip)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [opts.orgId, opts.username, opts.email ?? null, hash, opts.role, opts.branchIp ?? null])
  return getUser(opts.orgId, (result as any).insertId) as Promise<AppUser>
}

export async function updateUser(
  orgId: number,
  id: number,
  updates: Partial<{
    email: string
    role: UserRole
    branchIp: string
    isActive: boolean
    password: string
  }>
): Promise<AppUser | null> {
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.email !== undefined) { fields.push('email = ?'); values.push(updates.email) }
  if (updates.role !== undefined) { fields.push('role = ?'); values.push(updates.role) }
  if (updates.branchIp !== undefined) { fields.push('branch_ip = ?'); values.push(updates.branchIp) }
  if (updates.isActive !== undefined) { fields.push('is_active = ?'); values.push(updates.isActive ? 1 : 0) }
  if (updates.password) {
    const hash = await bcrypt.hash(updates.password, 12)
    fields.push('password = ?')
    values.push(hash)
  }

  if (!fields.length) return getUser(orgId, id)

  values.push(id, orgId)
  await query(`UPDATE nx_users SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`, values)
  return getUser(orgId, id)
}

export async function deleteUser(orgId: number, id: number): Promise<void> {
  await query('DELETE FROM nx_users WHERE id = ? AND org_id = ?', [id, orgId])
}
```

---

## Task 7.4 — User Routes (API)

### `packages/api/src/modules/users/user.routes.ts`
```typescript
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireRole } from '../auth/auth.middleware.js'
import { listUsers, getUser, createUser, updateUser, deleteUser } from './user.service.js'

const UserRoleEnum = z.enum(['superadmin', 'orgadmin', 'branchmanager', 'operator', 'readonly'])

const CreateUserSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email().optional(),
  password: z.string().min(8),
  role: UserRoleEnum,
  branchIp: z.string().ip().optional(),
})

const UpdateUserSchema = z.object({
  email: z.string().email().optional(),
  role: UserRoleEnum.optional(),
  branchIp: z.string().ip().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
})

export async function userRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  app.get('/users', { preHandler: requireRole('orgadmin') }, async (req) => {
    return listUsers(req.user!.orgId)
  })

  app.get<{ Params: { id: string } }>('/users/:id', { preHandler: requireRole('orgadmin') }, async (req, reply) => {
    const user = await getUser(req.user!.orgId, Number(req.params.id))
    if (!user) return reply.status(404).send({ error: 'User not found' })
    return user
  })

  app.post('/users', { preHandler: requireRole('orgadmin') }, async (req, reply) => {
    const body = CreateUserSchema.parse(req.body)
    const user = await createUser({ ...body, orgId: req.user!.orgId })
    return reply.status(201).send(user)
  })

  app.patch<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      const updates = UpdateUserSchema.parse(req.body)
      const user = await updateUser(req.user!.orgId, Number(req.params.id), updates)
      if (!user) return reply.status(404).send({ error: 'User not found' })
      return user
    }
  )

  app.delete<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      // Prevent self-deletion
      if (Number(req.params.id) === req.user!.id) {
        return reply.status(400).send({ error: 'Cannot delete your own account' })
      }
      await deleteUser(req.user!.orgId, Number(req.params.id))
      return reply.status(204).send()
    }
  )
}
```

### Register in `packages/api/src/app.ts`:
```typescript
import { planRoutes } from './modules/plans/plan.routes.js'
import { userRoutes } from './modules/users/user.routes.js'
await app.register(planRoutes, { prefix: '/api' })
await app.register(userRoutes, { prefix: '/api' })
```

---

## Task 7.5 — Session Kick (API)

### `packages/api/src/modules/sessions/session.routes.ts`
```typescript
import type { FastifyInstance } from 'fastify'
import { authenticate, requireRole } from '../auth/auth.middleware.js'
import { query } from '../../db/mysql.js'
import { execSync } from 'child_process'

export async function sessionRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  // List active sessions
  app.get('/sessions/active', async (req) => {
    return query<{
      acctsessionid: string
      username: string
      nasipaddress: string
      framedipaddress: string
      acctstarttime: string
      acctsessiontime: number
    }>(`
      SELECT acctsessionid, username, nasipaddress, framedipaddress,
             acctstarttime, acctsessiontime
      FROM radacct
      WHERE acctstoptime IS NULL
        AND nasipaddress IN (
          SELECT nas_ip FROM nx_branches WHERE org_id = ? AND is_active = 1
        )
      ORDER BY acctstarttime DESC
    `, [req.user!.orgId])
  })

  // Disconnect a session via RADIUS CoA (Change of Authorization)
  // Requires `radclient` or FreeRADIUS disconnect message support
  app.post<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/disconnect',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      const [session] = await query<{
        username: string
        nasipaddress: string
        acctsessionid: string
      }>(`
        SELECT username, nasipaddress, acctsessionid
        FROM radacct
        WHERE acctsessionid = ? AND acctstoptime IS NULL
      `, [req.params.sessionId])

      if (!session) return reply.status(404).send({ error: 'Session not found or already closed' })

      try {
        // Mark session stopped in accounting (soft disconnect)
        await query(`
          UPDATE radacct
          SET acctstoptime = NOW(), acctterminatecause = 'Admin-Reset'
          WHERE acctsessionid = ?
        `, [req.params.sessionId])

        // Attempt CoA via radclient if available
        execSync(
          `echo "User-Name = ${session.username}, Acct-Session-Id = ${req.params.sessionId}" | ` +
          `radclient -x ${session.nasipaddress}:3799 disconnect testing123 2>/dev/null || true`
        )

        return { success: true, message: `Session for ${session.username} disconnected` }
      } catch (e) {
        return reply.status(500).send({ error: 'Failed to disconnect session' })
      }
    }
  )
}
```

### Register in `packages/api/src/app.ts`:
```typescript
import { sessionRoutes } from './modules/sessions/session.routes.js'
await app.register(sessionRoutes, { prefix: '/api' })
```

---

## Task 7.6 — Audit Log Service (API)

### `packages/api/src/modules/audit/audit.service.ts`
```typescript
import { query } from '../../db/mysql.js'
import { redis } from '../../db/redis.js'

export interface AuditEntry {
  id: number
  orgId: number | null
  userId: number | null
  action: string
  resource: string | null
  resourceId: string | null
  meta: Record<string, unknown> | null
  ipAddress: string | null
  createdAt: string
  // Joined
  username?: string
}

export async function logAudit(opts: {
  orgId?: number
  userId?: number
  action: string
  resource?: string
  resourceId?: string
  meta?: Record<string, unknown>
  ipAddress?: string
}) {
  await query(`
    INSERT INTO nx_audit_log (org_id, user_id, action, resource, resource_id, meta, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    opts.orgId ?? null,
    opts.userId ?? null,
    opts.action,
    opts.resource ?? null,
    opts.resourceId ?? null,
    opts.meta ? JSON.stringify(opts.meta) : null,
    opts.ipAddress ?? null,
  ])
}

export async function getAuditLog(orgId: number, opts: {
  page?: number
  pageSize?: number
  action?: string
  userId?: number
  resource?: string
  dateFrom?: string
  dateTo?: string
}): Promise<{ entries: AuditEntry[]; total: number }> {
  const page = opts.page ?? 1
  const pageSize = Math.min(opts.pageSize ?? 50, 200)
  const offset = (page - 1) * pageSize

  const conditions = ['al.org_id = ?']
  const params: unknown[] = [orgId]

  if (opts.action) { conditions.push('al.action LIKE ?'); params.push(`%${opts.action}%`) }
  if (opts.userId) { conditions.push('al.user_id = ?'); params.push(opts.userId) }
  if (opts.resource) { conditions.push('al.resource = ?'); params.push(opts.resource) }
  if (opts.dateFrom) { conditions.push('DATE(al.created_at) >= ?'); params.push(opts.dateFrom) }
  if (opts.dateTo) { conditions.push('DATE(al.created_at) <= ?'); params.push(opts.dateTo) }

  const where = conditions.join(' AND ')

  const [countRow] = await query<{ total: number }>(`
    SELECT COUNT(*) AS total FROM nx_audit_log al WHERE ${where}
  `, params)

  const entries = await query<AuditEntry>(`
    SELECT al.id, al.org_id AS orgId, al.user_id AS userId, al.action,
           al.resource, al.resource_id AS resourceId, al.meta,
           al.ip_address AS ipAddress, al.created_at AS createdAt,
           u.username
    FROM nx_audit_log al
    LEFT JOIN nx_users u ON u.id = al.user_id
    WHERE ${where}
    ORDER BY al.created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, pageSize, offset])

  return {
    entries: entries.map((e) => ({
      ...e,
      meta: e.meta ? (typeof e.meta === 'string' ? JSON.parse(e.meta) : e.meta) : null,
    })),
    total: Number((countRow as any)?.total ?? 0),
  }
}
```

### `packages/api/src/modules/audit/audit.routes.ts`
```typescript
import type { FastifyInstance } from 'fastify'
import { authenticate, requireRole } from '../auth/auth.middleware.js'
import { getAuditLog } from './audit.service.js'

export async function auditRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  app.get('/audit', { preHandler: requireRole('orgadmin') }, async (req) => {
    const q = req.query as Record<string, string>
    return getAuditLog(req.user!.orgId, {
      page: q.page ? Number(q.page) : 1,
      pageSize: q.pageSize ? Number(q.pageSize) : 50,
      action: q.action,
      userId: q.userId ? Number(q.userId) : undefined,
      resource: q.resource,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
    })
  })
}
```

### Register in `packages/api/src/app.ts`:
```typescript
import { auditRoutes } from './modules/audit/audit.routes.js'
await app.register(auditRoutes, { prefix: '/api' })
```

### Add audit hooks in key service functions (example in auth.service.ts after login):
```typescript
import { logAudit } from '../audit/audit.service.js'
// After successful login:
await logAudit({
  orgId: user.org_id,
  userId: user.id,
  action: 'auth.login',
  resource: 'user',
  resourceId: String(user.id),
  ipAddress: request.ip,
})
```

---

## Task 7.7 — Frontend: Plans Page

### `packages/web/src/pages/Plans.tsx`
```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { PageHeader } from '../components/PageHeader'
import { DataTable } from '../components/DataTable'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Switch } from '../components/ui/switch'
import { Plus, ToggleLeft } from 'lucide-react'
import type { BillingPlan } from '@nexrad/shared'

export default function Plans() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['plans', 'all'],
    queryFn: () => api.get<BillingPlan[]>('/plans?all=true').then((r) => r.data),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: number) => api.post(`/plans/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
  })

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'displayName', header: 'Display Name', render: (v: string | null) => v ?? '—' },
    { key: 'timeBankHours', header: 'Hours', render: (v: number) => `${v}h` },
    {
      key: 'dataLimitMb',
      header: 'Data Limit',
      render: (v: number | null) => v ? `${v} MB` : 'Unlimited',
    },
    {
      key: 'cost',
      header: 'Price',
      render: (v: number, r: BillingPlan) => `${r.currency} ${v.toFixed(2)}`,
    },
    {
      key: 'frGroupName',
      header: 'FR Group',
      render: (v: string | null) => v ? (
        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{v}</span>
      ) : '—',
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (v: boolean, r: BillingPlan) => (
        <button
          onClick={() => toggleMutation.mutate(r.id)}
          className={`${v ? 'badge-online' : 'badge-offline'} cursor-pointer hover:opacity-80`}
        >
          {v ? 'Active' : 'Inactive'}
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing Plans"
        subtitle="Configure WiFi plans and FreeRADIUS policy groups"
        actions={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Plan
          </Button>
        }
      />
      <DataTable
        data={plans}
        columns={columns as any}
        keyField="id"
        loading={isLoading}
        emptyMessage="No billing plans. Create your first plan to start generating tokens."
      />
      <AddPlanDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['plans'] })
          setShowAdd(false)
        }}
      />
    </div>
  )
}

function AddPlanDialog({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void
}) {
  const [form, setForm] = useState({
    name: '', displayName: '', timeBankHours: 1, dataLimitMb: '',
    cost: '', currency: 'USD', frGroupName: '',
  })
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.post('/plans', {
        name: data.name,
        displayName: data.displayName || undefined,
        timeBankHours: Number(data.timeBankHours),
        dataLimitMb: data.dataLimitMb ? Number(data.dataLimitMb) : undefined,
        cost: Number(data.cost),
        currency: data.currency,
        frGroupName: data.frGroupName || undefined,
      }).then((r) => r.data),
    onSuccess: onCreated,
    onError: (e: any) => setError(e.response?.data?.message ?? 'Failed to create plan'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Billing Plan</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Plan Name *</Label>
              <Input placeholder="1Hour" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Display Name</Label>
              <Input placeholder="1 Hour WiFi" value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Time Bank (hours) *</Label>
              <Input type="number" min={1} value={form.timeBankHours} onChange={(e) => setForm((f) => ({ ...f, timeBankHours: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>Data Limit (MB)</Label>
              <Input type="number" placeholder="Leave blank = unlimited" value={form.dataLimitMb} onChange={(e) => setForm((f) => ({ ...f, dataLimitMb: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Price *</Label>
              <Input type="number" step="0.01" placeholder="1.00" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} />
            </div>
            <div>
              <Label>Currency *</Label>
              <Input placeholder="USD" maxLength={3} value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} />
            </div>
          </div>
          <div>
            <Label>FreeRADIUS Group Name</Label>
            <Input placeholder="1hour-group" value={form.frGroupName} onChange={(e) => setForm((f) => ({ ...f, frGroupName: e.target.value }))} />
            <p className="text-xs text-muted-foreground mt-1">
              Creates radgroupcheck/radgroupreply policies automatically.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending || !form.name || !form.cost}>
              {mutation.isPending ? 'Creating...' : 'Create Plan'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

---

## Task 7.8 — Frontend: Users Page

### `packages/web/src/pages/Users.tsx`
```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { PageHeader } from '../components/PageHeader'
import { DataTable } from '../components/DataTable'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Plus, ShieldCheck, UserX } from 'lucide-react'

const ROLES = ['orgadmin', 'branchmanager', 'operator', 'readonly'] as const

export default function Users() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data as any[]),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      api.patch(`/users/${id}`, { isActive: !isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  const roleBadge = (role: string) => {
    const map: Record<string, string> = {
      superadmin: 'badge-error',
      orgadmin: 'badge-warning',
      branchmanager: 'badge-online',
      operator: 'badge-info',
      readonly: 'text-muted-foreground text-xs',
    }
    return <span className={map[role] ?? 'text-xs'}>{role}</span>
  }

  const columns = [
    { key: 'username', header: 'Username', render: (v: string) => <span className="font-medium">{v}</span> },
    { key: 'email', header: 'Email', render: (v: string | null) => v ?? '—' },
    { key: 'role', header: 'Role', render: roleBadge },
    {
      key: 'isActive', header: 'Status',
      render: (v: boolean) => v ? <span className="badge-online">Active</span> : <span className="badge-offline">Inactive</span>,
    },
    {
      key: 'lastLogin', header: 'Last Login',
      render: (v: string | null) => v ? new Date(v).toLocaleString() : 'Never',
    },
    {
      key: 'id', header: '',
      render: (id: number, row: any) => (
        <Button
          variant="ghost" size="sm"
          onClick={() => toggleMutation.mutate({ id, isActive: row.isActive })}
          title={row.isActive ? 'Deactivate user' : 'Activate user'}
        >
          {row.isActive
            ? <UserX className="h-4 w-4 text-destructive" />
            : <ShieldCheck className="h-4 w-4 text-success" />}
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Manage team access and roles"
        actions={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add User
          </Button>
        }
      />
      <DataTable
        data={users}
        columns={columns as any}
        keyField="id"
        loading={isLoading}
        emptyMessage="No users found."
      />
      <AddUserDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['users'] })
          setShowAdd(false)
        }}
      />
    </div>
  )
}

function AddUserDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'operator' as string })
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/users', data).then((r) => r.data),
    onSuccess: onCreated,
    onError: (e: any) => setError(e.response?.data?.message ?? 'Failed to create user'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Username *</Label>
            <Input placeholder="jsmith" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" placeholder="j@example.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label>Password *</Label>
            <Input type="password" placeholder="Min 8 characters" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          </div>
          <div>
            <Label>Role *</Label>
            <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending || !form.username || !form.password}>
              {mutation.isPending ? 'Creating...' : 'Create User'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

---

## Task 7.9 — Sidebar Nav: Add Plans, Users, Audit Links

### Update Sidebar navItems:
```typescript
{ href: '/plans', label: 'Plans', icon: CreditCard, roles: ['superadmin','orgadmin'] },
{ href: '/users', label: 'Users', icon: Users2, roles: ['superadmin','orgadmin'] },
{ href: '/audit', label: 'Audit Log', icon: ClipboardList, roles: ['superadmin','orgadmin'] },
```

### Add routes in `packages/web/src/App.tsx`:
```tsx
import Plans from './pages/Plans'
import Users from './pages/Users'
import AuditLog from './pages/AuditLog'
// Inside Routes:
<Route path="/plans" element={<Plans />} />
<Route path="/users" element={<Users />} />
<Route path="/audit" element={<AuditLog />} />
```

---

## Task 7.10 — Frontend: Audit Log Page

### `packages/web/src/pages/AuditLog.tsx`
```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { PageHeader } from '../components/PageHeader'
import { DataTable } from '../components/DataTable'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

export default function AuditLog() {
  const [filter, setFilter] = useState({ action: '', resource: '' })
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['audit', filter, page],
    queryFn: () => api.get('/audit', { params: { ...filter, page } }).then((r) => r.data as any),
  })

  const columns = [
    {
      key: 'createdAt', header: 'Time',
      render: (v: string) => new Date(v).toLocaleString(),
    },
    { key: 'username', header: 'User', render: (v: string | null) => v ?? 'System' },
    {
      key: 'action', header: 'Action',
      render: (v: string) => <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{v}</span>,
    },
    { key: 'resource', header: 'Resource', render: (v: string | null) => v ?? '—' },
    { key: 'resourceId', header: 'Resource ID', render: (v: string | null) => v ?? '—' },
    { key: 'ipAddress', header: 'IP', render: (v: string | null) => v ?? '—' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" subtitle="Track all admin actions in the system" />

      <div className="flex gap-3">
        <div>
          <Label className="text-xs mb-1 block">Filter by action</Label>
          <Input
            className="w-44" placeholder="e.g. auth.login"
            value={filter.action}
            onChange={(e) => setFilter((f) => ({ ...f, action: e.target.value }))}
          />
        </div>
        <div>
          <Label className="text-xs mb-1 block">Resource</Label>
          <Input
            className="w-32" placeholder="e.g. branch"
            value={filter.resource}
            onChange={(e) => setFilter((f) => ({ ...f, resource: e.target.value }))}
          />
        </div>
      </div>

      <DataTable
        data={data?.entries ?? []}
        columns={columns as any}
        keyField="id"
        loading={isLoading}
        emptyMessage="No audit entries found."
      />
    </div>
  )
}
```

---

## Sprint 7 Sign-Off Checklist

Before marking Sprint 7 complete, every item must be ✓:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` passes
- [ ] `POST /api/plans` creates plan in nx_billing_plans AND billing_plans (FR compat)
- [ ] Creating a plan with `frGroupName` writes to radgroupcheck and radgroupreply
- [ ] `POST /api/plans/:id/toggle` toggles isActive
- [ ] `POST /api/users` creates a user with bcrypt-hashed password
- [ ] Created user can log in via `POST /api/auth/login`
- [ ] `PATCH /api/users/:id` with `isActive: false` blocks the user's next login
- [ ] Cannot delete own user account (400 returned)
- [ ] Audit log entries written on login, branch create, token generate
- [ ] `GET /api/audit` returns paginated entries with username joined
- [ ] Plans page: create plan dialog works end-to-end
- [ ] Plans page: clicking status badge toggles active/inactive
- [ ] Users page: add user creates and appears in table
- [ ] Users page: deactivate button works (two-click — but here single action is acceptable as it's reversible)
- [ ] Audit Log page: entries visible, filter by action works
- [ ] Session disconnect: `POST /api/sessions/:sessionId/disconnect` marks session stopped
- [ ] `pnpm build` succeeds
- [ ] `pnpm docker:dev` starts cleanly

**CI must be green before Sprint 8 begins.**

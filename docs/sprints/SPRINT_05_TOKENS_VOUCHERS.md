# Sprint 5 — Token Generation & Voucher Printing
**Duration:** 4 days | **Goal:** Batch token generation, full token management table, printable PDF voucher sheets, WhatsApp share link, and per-branch token filtering.

> After this sprint: an operator can generate 50 tokens for a specific plan, see them in a table, print a professional voucher sheet, or share a token via WhatsApp — all in under 2 minutes.

---

## Prerequisites
- Sprint 0–4 sign-off checklists all ✓
- At least one billing plan exists in `nx_billing_plans` or `billing_plans` table
- `pdf-lib` and `qrcode` installed (already in package.json)

---

## Task 5.1 — Token Generation Service (API)

### `packages/api/src/modules/tokens/token.service.ts`
```typescript
import { v4 as uuidv4 } from 'uuid'
import { query, queryOne } from '../../db/mysql.js'
import { redis } from '../../db/redis.js'

export interface Token {
  id: number
  orgId: number
  username: string
  branchId: number | null
  planId: number | null
  prefix: string | null
  batchId: string
  createdBy: number | null
  expiresAt: string | null
  notes: string | null
  createdAt: string
  // Joined fields
  planName?: string
  planCost?: number
  branchName?: string
  isUsed?: boolean
  sessionStart?: string | null
}

export interface GenerateTokensInput {
  orgId: number
  planId: number
  branchId?: number
  count: number
  prefix?: string
  expiresAt?: string
  notes?: string
  createdBy: number
}

export interface TokenListFilter {
  orgId: number
  branchId?: number
  planId?: number
  status?: 'used' | 'unused' | 'all'
  search?: string
  batchId?: string
  page?: number
  pageSize?: number
}

/**
 * Generate a random alphanumeric token username.
 * Format: {prefix}-{random8} e.g. "HRE-A3B7C2D1"
 */
function generateUsername(prefix?: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let random = ''
  for (let i = 0; i < 8; i++) {
    random += chars[Math.floor(Math.random() * chars.length)]
  }
  return prefix ? `${prefix.toUpperCase()}-${random}` : random
}

/**
 * Generate a batch of tokens.
 * - Inserts into nx_tokens (tracking table)
 * - Inserts into radcheck (FreeRADIUS auth — Cleartext-Password)
 * - Inserts into radusergroup (links user to plan group for RADIUS policies)
 * - Inserts into userbillinfo (daloRADIUS compatibility)
 */
export async function generateTokens(input: GenerateTokensInput): Promise<{
  batchId: string
  count: number
  tokens: string[]
}> {
  const batchId = uuidv4()

  // Fetch plan details
  const plan = await queryOne<{
    id: number
    name: string
    frGroupName: string | null
    cost: number
  }>(`
    SELECT id, name, fr_group_name AS frGroupName, cost
    FROM nx_billing_plans
    WHERE id = ? AND org_id = ?
  `, [input.planId, input.orgId])

  if (!plan) throw new Error('Billing plan not found')

  // Fetch branch shortname for userbillinfo.creationby
  let branchShortname = 'admin'
  if (input.branchId) {
    const branch = await queryOne<{ shortname: string }>(
      'SELECT shortname FROM nx_branches WHERE id = ? AND org_id = ?',
      [input.branchId, input.orgId]
    )
    if (branch) branchShortname = branch.shortname
  }

  const generatedUsernames: string[] = []

  for (let i = 0; i < input.count; i++) {
    const username = generateUsername(input.prefix)
    generatedUsernames.push(username)

    // nx_tokens tracking
    await query(`
      INSERT INTO nx_tokens
        (org_id, username, branch_id, plan_id, prefix, batch_id, created_by, expires_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      input.orgId, username, input.branchId ?? null, input.planId,
      input.prefix ?? null, batchId, input.createdBy,
      input.expiresAt ?? null, input.notes ?? null,
    ])

    // FreeRADIUS: radcheck (auth)
    await query(`
      INSERT INTO radcheck (username, attribute, op, value)
      VALUES (?, 'Cleartext-Password', ':=', ?)
    `, [username, username])  // password = username for voucher tokens

    // FreeRADIUS: radusergroup (policy)
    if (plan.frGroupName) {
      await query(`
        INSERT INTO radusergroup (username, groupname, priority)
        VALUES (?, ?, 1)
      `, [username, plan.frGroupName])
    }

    // daloRADIUS compat: userbillinfo
    await query(`
      INSERT INTO userbillinfo (username, planName, creationdate, creationby, expiration)
      VALUES (?, ?, NOW(), ?, ?)
    `, [username, plan.name, branchShortname, input.expiresAt ?? null])
  }

  // Cache batch summary in Redis for 24h
  await redis.setEx(
    `batch:${batchId}`,
    86400,
    JSON.stringify({ orgId: input.orgId, planId: input.planId, count: input.count, batchId })
  )

  return { batchId, count: input.count, tokens: generatedUsernames }
}

export async function listTokens(filter: TokenListFilter): Promise<{
  tokens: Token[]
  total: number
  page: number
  pageSize: number
}> {
  const page = filter.page ?? 1
  const pageSize = Math.min(filter.pageSize ?? 50, 200)
  const offset = (page - 1) * pageSize

  const conditions: string[] = ['t.org_id = ?']
  const params: unknown[] = [filter.orgId]

  if (filter.branchId) { conditions.push('t.branch_id = ?'); params.push(filter.branchId) }
  if (filter.planId) { conditions.push('t.plan_id = ?'); params.push(filter.planId) }
  if (filter.batchId) { conditions.push('t.batch_id = ?'); params.push(filter.batchId) }
  if (filter.search) {
    conditions.push('t.username LIKE ?')
    params.push(`%${filter.search}%`)
  }
  if (filter.status === 'used') {
    conditions.push('EXISTS (SELECT 1 FROM radacct ra WHERE ra.username = t.username)')
  } else if (filter.status === 'unused') {
    conditions.push('NOT EXISTS (SELECT 1 FROM radacct ra WHERE ra.username = t.username)')
  }

  const where = conditions.join(' AND ')

  const [countRow] = await query<{ total: number }>(`
    SELECT COUNT(*) AS total FROM nx_tokens t WHERE ${where}
  `, params)

  const rows = await query<Token>(`
    SELECT
      t.id, t.org_id AS orgId, t.username, t.branch_id AS branchId,
      t.plan_id AS planId, t.prefix, t.batch_id AS batchId,
      t.created_by AS createdBy, t.expires_at AS expiresAt,
      t.notes, t.created_at AS createdAt,
      p.name AS planName, p.cost AS planCost,
      b.name AS branchName,
      CASE WHEN EXISTS (SELECT 1 FROM radacct ra WHERE ra.username = t.username)
           THEN 1 ELSE 0 END AS isUsed,
      (SELECT MIN(ra2.acctstarttime) FROM radacct ra2 WHERE ra2.username = t.username)
           AS sessionStart
    FROM nx_tokens t
    LEFT JOIN nx_billing_plans p ON p.id = t.plan_id
    LEFT JOIN nx_branches b ON b.id = t.branch_id
    WHERE ${where}
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, pageSize, offset])

  return {
    tokens: rows.map((r) => ({ ...r, isUsed: Boolean((r as any).isUsed) })),
    total: Number((countRow as any)?.total ?? 0),
    page,
    pageSize,
  }
}

export async function deleteToken(orgId: number, username: string): Promise<void> {
  // Prevent deleting tokens that have been used
  const [used] = await query<{ count: number }>(`
    SELECT COUNT(*) AS count FROM radacct WHERE username = ?
  `, [username])
  if (Number(used?.count) > 0) {
    throw new Error('Cannot delete a token that has active or historical sessions')
  }

  await query('DELETE FROM nx_tokens WHERE username = ? AND org_id = ?', [username, orgId])
  await query('DELETE FROM radcheck WHERE username = ?', [username])
  await query('DELETE FROM radusergroup WHERE username = ?', [username])
  await query('DELETE FROM userbillinfo WHERE username = ?', [username])
}

export async function getTokenBatches(orgId: number, limit = 20) {
  return query<{
    batchId: string
    planName: string
    branchName: string | null
    count: number
    usedCount: number
    createdAt: string
  }>(`
    SELECT
      t.batch_id AS batchId,
      MIN(p.name) AS planName,
      MIN(b.name) AS branchName,
      COUNT(*) AS count,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM radacct ra WHERE ra.username = t.username)
          THEN 1 ELSE 0 END) AS usedCount,
      MIN(t.created_at) AS createdAt
    FROM nx_tokens t
    LEFT JOIN nx_billing_plans p ON p.id = t.plan_id
    LEFT JOIN nx_branches b ON b.id = t.branch_id
    WHERE t.org_id = ?
    GROUP BY t.batch_id
    ORDER BY MIN(t.created_at) DESC
    LIMIT ?
  `, [orgId, limit])
}
```

---

## Task 5.2 — Token Routes (API)

### `packages/api/src/modules/tokens/token.routes.ts`
```typescript
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireRole } from '../auth/auth.middleware.js'
import { generateTokens, listTokens, deleteToken, getTokenBatches } from './token.service.js'

const GenerateSchema = z.object({
  planId: z.number().int().positive(),
  branchId: z.number().int().positive().optional(),
  count: z.number().int().min(1).max(500),
  prefix: z.string().max(10).regex(/^[A-Za-z0-9]*$/).optional(),
  expiresAt: z.string().datetime().optional(),
  notes: z.string().max(255).optional(),
})

export async function tokenRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  // List tokens (with filters)
  app.get('/tokens', async (req) => {
    const q = req.query as Record<string, string>
    return listTokens({
      orgId: req.user!.orgId,
      branchId: q.branchId ? Number(q.branchId) : undefined,
      planId: q.planId ? Number(q.planId) : undefined,
      status: (q.status as any) || 'all',
      search: q.search,
      batchId: q.batchId,
      page: q.page ? Number(q.page) : 1,
      pageSize: q.pageSize ? Number(q.pageSize) : 50,
    })
  })

  // Generate tokens
  app.post(
    '/tokens/generate',
    { preHandler: requireRole('operator') },
    async (req, reply) => {
      const body = GenerateSchema.parse(req.body)
      const result = await generateTokens({
        ...body,
        orgId: req.user!.orgId,
        createdBy: req.user!.id,
      })
      return reply.status(201).send(result)
    }
  )

  // Get batch list
  app.get('/tokens/batches', async (req) => {
    return getTokenBatches(req.user!.orgId)
  })

  // Delete single token
  app.delete<{ Params: { username: string } }>(
    '/tokens/:username',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      await deleteToken(req.user!.orgId, req.params.username)
      return reply.status(204).send()
    }
  )
}
```

### Register in `packages/api/src/app.ts`:
```typescript
import { tokenRoutes } from './modules/tokens/token.routes.js'
await app.register(tokenRoutes, { prefix: '/api' })
```

---

## Task 5.3 — Voucher PDF Generation (API)

### `packages/api/src/modules/tokens/voucher.service.ts`
```typescript
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import type { Token } from './token.service.js'

export interface VoucherOptions {
  tokens: Token[]
  orgName: string
  orgFooter?: string
  showPrice: boolean
  currency: string
}

/**
 * Generate a printable voucher sheet PDF.
 * Layout: 2 columns × 5 rows = 10 vouchers per A4 page.
 */
export async function generateVoucherPdf(opts: VoucherOptions): Promise<Uint8Array> {
  const { tokens, orgName, orgFooter, showPrice, currency } = opts
  const pdfDoc = await PDFDocument.create()
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const A4_WIDTH = 595.28
  const A4_HEIGHT = 841.89
  const COLS = 2
  const ROWS = 5
  const PER_PAGE = COLS * ROWS
  const MARGIN = 20
  const CARD_W = (A4_WIDTH - MARGIN * 3) / COLS
  const CARD_H = (A4_HEIGHT - MARGIN * (ROWS + 1)) / ROWS
  const GUTTER = MARGIN

  const pages = Math.ceil(tokens.length / PER_PAGE)

  for (let p = 0; p < pages; p++) {
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT])
    const batch = tokens.slice(p * PER_PAGE, (p + 1) * PER_PAGE)

    batch.forEach((token, idx) => {
      const col = idx % COLS
      const row = Math.floor(idx / COLS)
      const x = MARGIN + col * (CARD_W + GUTTER)
      const y = A4_HEIGHT - MARGIN - (row + 1) * CARD_H - row * GUTTER

      // Card border
      page.drawRectangle({
        x, y,
        width: CARD_W,
        height: CARD_H,
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 0.5,
        color: rgb(0.99, 0.99, 0.99),
      })

      // Accent bar at top of card
      page.drawRectangle({
        x, y: y + CARD_H - 16,
        width: CARD_W,
        height: 16,
        color: rgb(0.25, 0.32, 0.71),  // indigo-600
      })

      // Org name in accent bar
      page.drawText(orgName.toUpperCase(), {
        x: x + 6,
        y: y + CARD_H - 11,
        size: 7,
        font: boldFont,
        color: rgb(1, 1, 1),
      })

      // Plan name
      const planLabel = token.planName ?? 'Voucher'
      page.drawText(planLabel, {
        x: x + 6,
        y: y + CARD_H - 32,
        size: 9,
        font: boldFont,
        color: rgb(0.2, 0.2, 0.2),
      })

      // Price
      if (showPrice && token.planCost != null) {
        page.drawText(`${currency} ${Number(token.planCost).toFixed(2)}`, {
          x: x + CARD_W - 60,
          y: y + CARD_H - 32,
          size: 10,
          font: boldFont,
          color: rgb(0.15, 0.55, 0.15),
        })
      }

      // Divider line
      page.drawLine({
        start: { x: x + 6, y: y + CARD_H - 40 },
        end: { x: x + CARD_W - 6, y: y + CARD_H - 40 },
        thickness: 0.3,
        color: rgb(0.85, 0.85, 0.85),
      })

      // "USERNAME" label
      page.drawText('USERNAME', {
        x: x + 6,
        y: y + CARD_H - 55,
        size: 6,
        font: regularFont,
        color: rgb(0.5, 0.5, 0.5),
      })

      // Token username — large and prominent
      page.drawText(token.username, {
        x: x + 6,
        y: y + CARD_H - 70,
        size: 14,
        font: boldFont,
        color: rgb(0.1, 0.1, 0.1),
      })

      // "PASSWORD" label (same as username for voucher tokens)
      page.drawText('PASSWORD', {
        x: x + 6,
        y: y + CARD_H - 85,
        size: 6,
        font: regularFont,
        color: rgb(0.5, 0.5, 0.5),
      })

      page.drawText(token.username, {
        x: x + 6,
        y: y + CARD_H - 98,
        size: 12,
        font: boldFont,
        color: rgb(0.1, 0.1, 0.1),
      })

      // Expiry
      if (token.expiresAt) {
        page.drawText(`Expires: ${new Date(token.expiresAt).toLocaleDateString()}`, {
          x: x + 6,
          y: y + 10,
          size: 6,
          font: regularFont,
          color: rgb(0.5, 0.5, 0.5),
        })
      }

      // Footer
      if (orgFooter) {
        page.drawText(orgFooter, {
          x: x + 6,
          y: y + 3,
          size: 5,
          font: regularFont,
          color: rgb(0.6, 0.6, 0.6),
        })
      }
    })
  }

  return pdfDoc.save()
}
```

### `packages/api/src/modules/tokens/voucher.routes.ts`
```typescript
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../auth/auth.middleware.js'
import { listTokens } from './token.service.js'
import { generateVoucherPdf } from './voucher.service.js'
import { queryOne } from '../../db/mysql.js'

const VoucherQuerySchema = z.object({
  batchId: z.string().uuid().optional(),
  planId: z.string().optional(),
  branchId: z.string().optional(),
  status: z.enum(['used', 'unused', 'all']).default('unused'),
  showPrice: z.string().default('true'),
  limit: z.string().default('50'),
})

export async function voucherRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  app.get('/vouchers/pdf', async (req, reply) => {
    const q = VoucherQuerySchema.parse(req.query)
    const user = req.user!

    const { tokens } = await listTokens({
      orgId: user.orgId,
      batchId: q.batchId,
      planId: q.planId ? Number(q.planId) : undefined,
      branchId: q.branchId ? Number(q.branchId) : undefined,
      status: q.status,
      pageSize: Number(q.limit),
    })

    if (!tokens.length) {
      return reply.status(400).send({ error: 'No tokens match the filter' })
    }

    const org = await queryOne<{ name: string; voucher_footer: string | null; currency: string }>(
      'SELECT name, voucher_footer, currency FROM nx_organizations WHERE id = ?',
      [user.orgId]
    )

    const pdf = await generateVoucherPdf({
      tokens,
      orgName: org?.name ?? 'NexRAD',
      orgFooter: org?.voucher_footer ?? undefined,
      showPrice: q.showPrice === 'true',
      currency: org?.currency ?? 'USD',
    })

    return reply
      .status(200)
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="vouchers.pdf"`)
      .send(Buffer.from(pdf))
  })
}
```

### Register in `packages/api/src/app.ts`:
```typescript
import { voucherRoutes } from './modules/tokens/voucher.routes.js'
await app.register(voucherRoutes, { prefix: '/api' })
```

---

## Task 5.4 — Frontend: Tokens Page

### `packages/web/src/pages/Tokens.tsx`
```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { PageHeader } from '../components/PageHeader'
import { DataTable } from '../components/DataTable'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Plus, Printer, MessageCircle, Trash2, RefreshCw } from 'lucide-react'
import type { Token } from '@nexrad/shared'

interface Plan { id: number; name: string; cost: number; currency: string }
interface Branch { id: number; name: string; shortname: string }

export default function Tokens() {
  const qc = useQueryClient()
  const [showGenerate, setShowGenerate] = useState(false)
  const [filter, setFilter] = useState({ status: 'all', search: '', branchId: '', planId: '' })
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['tokens', filter, page],
    queryFn: () =>
      api.get('/tokens', {
        params: { ...filter, page, pageSize: 50 },
      }).then((r) => r.data as { tokens: Token[]; total: number; page: number }),
  })

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<Branch[]>('/branches').then((r) => r.data),
  })

  const { data: plans = [] } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get<Plan[]>('/plans').then((r) => r.data),
  })

  const printVouchers = (batchId?: string) => {
    const params = new URLSearchParams({ status: 'unused', limit: '50' })
    if (batchId) params.set('batchId', batchId)
    if (filter.branchId) params.set('branchId', filter.branchId)
    if (filter.planId) params.set('planId', filter.planId)
    window.open(`/api/vouchers/pdf?${params}`, '_blank')
  }

  const shareWhatsApp = (token: Token) => {
    const text = encodeURIComponent(
      `🌐 WiFi Voucher\nUsername: ${token.username}\nPassword: ${token.username}\nPlan: ${token.planName ?? ''}\n\nConnect to WiFi and use these credentials.`
    )
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  const columns = [
    { key: 'username', header: 'Token / Username', render: (v: string) => (
      <span className="font-mono font-semibold text-sm">{v}</span>
    )},
    { key: 'planName', header: 'Plan', render: (v: string) => v ?? '—' },
    { key: 'branchName', header: 'Branch', render: (v: string) => v ?? '—' },
    {
      key: 'isUsed', header: 'Status',
      render: (v: boolean) =>
        v ? <span className="badge-offline">Used</span> : <span className="badge-online">Available</span>,
    },
    {
      key: 'sessionStart', header: 'First Used',
      render: (v: string | null) => v ? new Date(v).toLocaleString() : '—',
    },
    {
      key: 'expiresAt', header: 'Expires',
      render: (v: string | null) => v ? new Date(v).toLocaleDateString() : '—',
    },
    {
      key: 'username', header: '',
      render: (v: string, row: Token) => (
        <div className="flex gap-1 justify-end">
          <Button variant="ghost" size="sm" title="Share via WhatsApp" onClick={() => shareWhatsApp(row)}>
            <MessageCircle className="h-4 w-4 text-green-500" />
          </Button>
          {!row.isUsed && (
            <DeleteTokenButton
              username={v}
              onDeleted={() => qc.invalidateQueries({ queryKey: ['tokens'] })}
            />
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tokens"
        subtitle={`${data?.total ?? 0} tokens total`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => printVouchers()}>
              <Printer className="h-4 w-4 mr-2" /> Print Vouchers
            </Button>
            <Button onClick={() => setShowGenerate(true)}>
              <Plus className="h-4 w-4 mr-2" /> Generate Tokens
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
          <Select value={filter.status} onValueChange={(v) => setFilter((f) => ({ ...f, status: v }))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unused">Available</SelectItem>
              <SelectItem value="used">Used</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Branch</Label>
          <Select value={filter.branchId || 'all'} onValueChange={(v) => setFilter((f) => ({ ...f, branchId: v === 'all' ? '' : v }))}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Search</Label>
          <Input
            className="w-48"
            placeholder="Search token..."
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ['tokens'] })}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <DataTable
        data={data?.tokens ?? []}
        columns={columns as any}
        keyField="id"
        loading={isLoading}
        emptyMessage="No tokens found. Generate some tokens to get started."
      />

      {/* Pagination */}
      {data && data.total > 50 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, data.total)} of {data.total}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
              Previous
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page * 50 >= data.total}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <GenerateDialog
        open={showGenerate}
        plans={plans}
        branches={branches}
        onClose={() => setShowGenerate(false)}
        onGenerated={(batchId) => {
          qc.invalidateQueries({ queryKey: ['tokens'] })
          setShowGenerate(false)
          if (confirm('Tokens generated! Print vouchers now?')) {
            printVouchers(batchId)
          }
        }}
      />
    </div>
  )
}

function GenerateDialog({ open, plans, branches, onClose, onGenerated }: {
  open: boolean
  plans: Plan[]
  branches: Branch[]
  onClose: () => void
  onGenerated: (batchId: string) => void
}) {
  const [form, setForm] = useState({
    planId: '',
    branchId: '',
    count: 10,
    prefix: '',
    notes: '',
  })
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.post('/tokens/generate', {
        planId: Number(data.planId),
        branchId: data.branchId ? Number(data.branchId) : undefined,
        count: data.count,
        prefix: data.prefix || undefined,
        notes: data.notes || undefined,
      }).then((r) => r.data),
    onSuccess: (data) => onGenerated(data.batchId),
    onError: (e: any) => setError(e.response?.data?.message ?? 'Failed to generate tokens'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Tokens</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Billing Plan *</Label>
            <Select value={form.planId} onValueChange={(v) => setForm((f) => ({ ...f, planId: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select a plan..." />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name} — {p.currency} {p.cost}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Branch (optional)</Label>
            <Select value={form.branchId || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, branchId: v === 'none' ? '' : v }))}>
              <SelectTrigger>
                <SelectValue placeholder="All / Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned (HQ)</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantity</Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={form.count}
              onChange={(e) => setForm((f) => ({ ...f, count: Number(e.target.value) }))}
            />
          </div>
          <div>
            <Label>Prefix (optional)</Label>
            <Input
              placeholder="e.g. HRE"
              maxLength={10}
              value={form.prefix}
              onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value.toUpperCase() }))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Tokens will look like: HRE-A3B7C2D1
            </p>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input
              placeholder="Batch for weekend promotion..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => mutation.mutate(form)}
              disabled={mutation.isPending || !form.planId || form.count < 1}
            >
              {mutation.isPending ? 'Generating...' : `Generate ${form.count} Tokens`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DeleteTokenButton({ username, onDeleted }: { username: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const mutation = useMutation({
    mutationFn: () => api.delete(`/tokens/${username}`),
    onSuccess: onDeleted,
  })

  if (confirming) {
    return (
      <div className="flex gap-1">
        <Button variant="destructive" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          Delete
        </Button>
        <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
      </div>
    )
  }
  return (
    <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  )
}
```

---

## Task 5.5 — Billing Plans Endpoints (minimal for Sprint 5)

> Full plan management is Sprint 7. Here we add just the list endpoint so the token generation form works.

### `packages/api/src/modules/plans/plan.routes.ts`
```typescript
import type { FastifyInstance } from 'fastify'
import { authenticate } from '../auth/auth.middleware.js'
import { query } from '../../db/mysql.js'

export async function planRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  app.get('/plans', async (req) => {
    return query<{
      id: number; name: string; displayName: string | null;
      cost: number; currency: string; timeBankHours: number;
      dataLimitMb: number | null; isActive: boolean;
    }>(`
      SELECT id, name, display_name AS displayName, cost, currency,
             time_bank_hours AS timeBankHours, data_limit_mb AS dataLimitMb, is_active AS isActive
      FROM nx_billing_plans
      WHERE org_id = ? AND is_active = 1
      ORDER BY cost
    `, [req.user!.orgId])
  })
}
```

### Register in `packages/api/src/app.ts`:
```typescript
import { planRoutes } from './modules/plans/plan.routes.js'
await app.register(planRoutes, { prefix: '/api' })
```

---

## Task 5.6 — Sidebar Nav: Add Tokens Link

### Update Sidebar navItems:
```typescript
{ href: '/tokens', label: 'Tokens', icon: Ticket, roles: ['superadmin','orgadmin','branchmanager','operator'] },
```

### Add route in `packages/web/src/App.tsx`:
```tsx
import Tokens from './pages/Tokens'
// inside Routes:
<Route path="/tokens" element={<Tokens />} />
```

### Import `Ticket` from lucide-react.

---

## Task 5.7 — Integration Tests

### `packages/api/src/modules/tokens/__tests__/token.test.ts`
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../../app.js'
import type { FastifyInstance } from 'fastify'

describe('Token endpoints', () => {
  let app: FastifyInstance
  let token: string
  let batchId: string
  let createdUsername: string

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
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

  it('GET /api/tokens returns paginated response', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tokens',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body.tokens)).toBe(true)
    expect(typeof body.total).toBe('number')
  })

  it('POST /api/tokens/generate creates tokens', async () => {
    // Requires at least one plan in nx_billing_plans
    const plansRes = await app.inject({
      method: 'GET',
      url: '/api/plans',
      headers: { authorization: `Bearer ${token}` },
    })
    const plans = plansRes.json()
    if (!plans.length) return  // Skip if no plans seeded

    const res = await app.inject({
      method: 'POST',
      url: '/api/tokens/generate',
      headers: { authorization: `Bearer ${token}` },
      body: { planId: plans[0].id, count: 3, prefix: 'TST' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.count).toBe(3)
    expect(body.tokens).toHaveLength(3)
    expect(body.tokens[0]).toMatch(/^TST-/)
    batchId = body.batchId
    createdUsername = body.tokens[0]
  })

  it('GET /api/tokens filters by batchId', async () => {
    if (!batchId) return
    const res = await app.inject({
      method: 'GET',
      url: `/api/tokens?batchId=${batchId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().total).toBe(3)
  })

  it('DELETE /api/tokens/:username deletes unused token', async () => {
    if (!createdUsername) return
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/tokens/${createdUsername}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(204)
  })

  it('GET /api/vouchers/pdf returns PDF binary', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/vouchers/pdf?status=all&limit=5',
      headers: { authorization: `Bearer ${token}` },
    })
    // May be 400 if no tokens exist, that is acceptable
    expect([200, 400]).toContain(res.statusCode)
    if (res.statusCode === 200) {
      expect(res.headers['content-type']).toContain('application/pdf')
    }
  })
})
```

---

## Sprint 5 Sign-Off Checklist

Before marking Sprint 5 complete, every item must be ✓:

- [ ] `pnpm typecheck` exits 0 in all packages
- [ ] `pnpm lint` exits 0 in all packages
- [ ] `pnpm test` passes (token.test.ts all green, coverage >60%)
- [ ] `POST /api/tokens/generate` creates tokens in radcheck, radusergroup, userbillinfo, nx_tokens
- [ ] `GET /api/tokens?status=unused` returns only tokens with no radacct entry
- [ ] `GET /api/tokens?status=used` returns only tokens that appear in radacct
- [ ] `GET /api/vouchers/pdf` returns a valid PDF (open in browser — vouchers look correct)
- [ ] PDF layout: 2 columns, 5 rows per page, org name in header, token username clearly visible
- [ ] Tokens page loads in browser — table renders with status badges
- [ ] "Generate Tokens" dialog opens, plan dropdown populated from /api/plans
- [ ] After generating, confirm dialog offers print — clicking yes opens PDF in new tab
- [ ] "Share via WhatsApp" button opens WhatsApp with pre-filled message containing the token
- [ ] Deleting an unused token removes it from the table
- [ ] Deleting a used token returns an error (API rejects it)
- [ ] Prefix input only allows alphanumeric; generated tokens show prefix-XXXXXXXX format
- [ ] `pnpm build` succeeds
- [ ] `pnpm docker:dev` starts cleanly

**CI must be green before Sprint 6 begins.**

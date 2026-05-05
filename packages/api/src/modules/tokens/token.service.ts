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
  }>(
    `
    SELECT id, name, fr_group_name AS frGroupName, cost
    FROM nx_billing_plans WHERE id = ? AND org_id = ?
  `,
    [input.planId, input.orgId]
  )

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
    await query(
      `
      INSERT INTO nx_tokens
        (org_id, username, branch_id, plan_id, prefix, batch_id, created_by, expires_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        input.orgId,
        username,
        input.branchId ?? null,
        input.planId,
        input.prefix ?? null,
        batchId,
        input.createdBy,
        input.expiresAt ?? null,
        input.notes ?? null,
      ]
    )

    // FreeRADIUS: radcheck (auth)
    await query(
      `
      INSERT INTO radcheck (username, attribute, op, value)
      VALUES (?, 'Cleartext-Password', ':=', ?)
    `,
      [username, username]
    ) // password = username for voucher tokens

    // FreeRADIUS: radusergroup (policy)
    if (plan.frGroupName) {
      await query(
        `
        INSERT INTO radusergroup (username, groupname, priority)
        VALUES (?, ?, 1)
      `,
        [username, plan.frGroupName]
      )
    }

    // daloRADIUS compat: userbillinfo
    await query(
      `
      INSERT INTO userbillinfo (username, planName, creationdate, creationby, expiration)
      VALUES (?, ?, NOW(), ?, ?)
    `,
      [username, plan.name, branchShortname, input.expiresAt ?? null]
    )
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

  if (filter.branchId) {
    conditions.push('t.branch_id = ?')
    params.push(filter.branchId)
  }
  if (filter.planId) {
    conditions.push('t.plan_id = ?')
    params.push(filter.planId)
  }
  if (filter.batchId) {
    conditions.push('t.batch_id = ?')
    params.push(filter.batchId)
  }
  if (filter.search) {
    conditions.push('t.username LIKE ?')
    params.push(`%${filter.search}%`)
  }
  if (filter.status === 'used') {
    conditions.push('EXISTS (SELECT 1 FROM radacct ra WHERE ra.username = t.username)')
  } else if (filter.status === 'unused') {
    conditions.push('NOT EXISTS (SELECT 1 FROM radacct ra WHERE ra.username = t.username)')
  }

  const scopedWhere =
    conditions.length > 1 ? `t.org_id = ? AND ${conditions.slice(1).join(' AND ')}` : 't.org_id = ?'

  const [countRow] = await query<{ total: number }>(
    `
    SELECT COUNT(*) AS total FROM nx_tokens t WHERE t.org_id = ? AND ${scopedWhere.replace('t.org_id = ? AND ', '').replace('t.org_id = ?', '1=1')}
  `,
    params
  )

  const rows = await query<Token>(
    `
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
    FROM nx_tokens t LEFT JOIN nx_billing_plans p ON p.id = t.plan_id LEFT JOIN nx_branches b ON b.id = t.branch_id WHERE t.org_id = ? AND ${scopedWhere.replace('t.org_id = ? AND ', '').replace('t.org_id = ?', '1=1')}
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `,
    [...params, pageSize, offset]
  )

  return {
    tokens: rows.map((r) => ({ ...r, isUsed: Boolean((r as any).isUsed) })),
    total: Number((countRow as any)?.total ?? 0),
    page,
    pageSize,
  }
}

export async function deleteToken(orgId: number, username: string): Promise<void> {
  // Prevent deleting tokens that have been used
  const [used] = await query<{ count: number }>(
    `
    SELECT COUNT(*) AS count FROM radacct WHERE username = ?
  `,
    [username]
  )
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
  }>(
    `
    SELECT
      t.batch_id AS batchId,
      MIN(p.name) AS planName,
      MIN(b.name) AS branchName,
      COUNT(*) AS count,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM radacct ra WHERE ra.username = t.username)
          THEN 1 ELSE 0 END) AS usedCount,
      MIN(t.created_at) AS createdAt
    FROM nx_tokens t LEFT JOIN nx_billing_plans p ON p.id = t.plan_id LEFT JOIN nx_branches b ON b.id = t.branch_id WHERE t.org_id = ?
    GROUP BY t.batch_id
    ORDER BY MIN(t.created_at) DESC
    LIMIT ?
  `,
    [orgId, limit]
  )
}

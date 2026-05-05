import { query } from '../../db/mysql.js'

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
  await query(
    `
    INSERT INTO nx_audit_log (org_id, user_id, action, resource, resource_id, meta, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    [
      opts.orgId ?? null,
      opts.userId ?? null,
      opts.action,
      opts.resource ?? null,
      opts.resourceId ?? null,
      opts.meta ? JSON.stringify(opts.meta) : null,
      opts.ipAddress ?? null,
    ]
  )
}

export async function getAuditLog(
  orgId: number,
  opts: {
    page?: number
    pageSize?: number
    action?: string
    userId?: number
    resource?: string
    dateFrom?: string
    dateTo?: string
  }
): Promise<{ entries: AuditEntry[]; total: number }> {
  const page = opts.page ?? 1
  const pageSize = Math.min(opts.pageSize ?? 50, 200)
  const offset = (page - 1) * pageSize

  const conditions = ['al.org_id = ?']
  const params: unknown[] = [orgId]

  if (opts.action) {
    conditions.push('al.action LIKE ?')
    params.push(`%${opts.action}%`)
  }
  if (opts.userId) {
    conditions.push('al.user_id = ?')
    params.push(opts.userId)
  }
  if (opts.resource) {
    conditions.push('al.resource = ?')
    params.push(opts.resource)
  }
  if (opts.dateFrom) {
    conditions.push('DATE(al.created_at) >= ?')
    params.push(opts.dateFrom)
  }
  if (opts.dateTo) {
    conditions.push('DATE(al.created_at) <= ?')
    params.push(opts.dateTo)
  }

  const where = conditions.join(' AND ')

  const [countRow] = await query<{ total: number }>(
    `
    SELECT COUNT(*) AS total FROM nx_audit_log al WHERE ${where}
  `,
    params
  )

  const entries = await query<AuditEntry>(
    `
    SELECT al.id, al.org_id AS orgId, al.user_id AS userId, al.action,
           al.resource, al.resource_id AS resourceId, al.meta,
           al.ip_address AS ipAddress, al.created_at AS createdAt,
           u.username
    FROM nx_audit_log al
    LEFT JOIN nx_users u ON u.id = al.user_id
    WHERE ${where}
    ORDER BY al.created_at DESC
    LIMIT ? OFFSET ?
  `,
    [...params, pageSize, offset]
  )

  return {
    entries: entries.map((e) => ({
      ...e,
      meta: e.meta ? (typeof e.meta === 'string' ? JSON.parse(e.meta as any) : e.meta) : null,
    })),
    total: Number((countRow as any)?.total ?? 0),
  }
}

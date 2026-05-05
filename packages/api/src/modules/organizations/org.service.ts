import bcrypt from 'bcryptjs'
import type { ResultSetHeader } from 'mysql2'
import { query, queryOne } from '../../db/mysql.js'

export interface Organization {
  id: number
  name: string
  slug: string
  commissionRate: number
  logoUrl: string | null
  currency: string
  timezone: string
  voucherFooter: string | null
  isActive: boolean
  createdAt: string
  userCount?: number
  branchCount?: number
  tokenCount?: number
}

export async function listOrgs(): Promise<Organization[]> {
  return query<Organization>(`
    SELECT
      o.id, o.name, o.slug, o.commission_rate AS commissionRate,
      o.logo_url AS logoUrl, o.currency, o.timezone,
      o.voucher_footer AS voucherFooter, o.is_active AS isActive,
      o.created_at AS createdAt,
      (SELECT COUNT(*) FROM nx_users u WHERE u.org_id = o.id) AS userCount,
      (SELECT COUNT(*) FROM nx_branches b WHERE b.org_id = o.id) AS branchCount,
      (SELECT COUNT(*) FROM nx_tokens t WHERE t.org_id = o.id) AS tokenCount
    FROM nx_organizations o
    ORDER BY o.created_at DESC
  `)
}

export async function getOrg(id: number): Promise<Organization | null> {
  return queryOne<Organization>(
    `
    SELECT id, name, slug, commission_rate AS commissionRate,
           logo_url AS logoUrl, currency, timezone,
           voucher_footer AS voucherFooter, is_active AS isActive, created_at AS createdAt
    FROM nx_organizations
    WHERE id = ?
  `,
    [id]
  )
}

export async function getOrgBySlug(slug: string): Promise<Organization | null> {
  return queryOne<Organization>('SELECT * FROM nx_organizations WHERE slug = ?', [slug])
}

export async function createOrg(input: {
  name: string
  slug: string
  commissionRate?: number
  currency?: string
  timezone?: string
  adminUsername: string
  adminPassword: string
  adminEmail?: string
}): Promise<Organization> {
  const hash = await bcrypt.hash(input.adminPassword, 12)

  const [orgResult] = await query<ResultSetHeader>(
    `
    INSERT INTO nx_organizations (name, slug, commission_rate, currency, timezone)
    VALUES (?, ?, ?, ?, ?)
  `,
    [
      input.name,
      input.slug,
      input.commissionRate ?? 0.1,
      input.currency ?? 'USD',
      input.timezone ?? 'UTC',
    ]
  )
  const orgId = orgResult.insertId

  await query(
    `
    INSERT INTO nx_users (org_id, username, email, password, role)
    VALUES (?, ?, ?, ?, 'orgadmin')
  `,
    [orgId, input.adminUsername, input.adminEmail ?? null, hash]
  )

  return getOrg(orgId) as Promise<Organization>
}

export async function updateOrg(
  id: number,
  updates: Partial<{
    name: string
    commissionRate: number
    currency: string
    timezone: string
    voucherFooter: string
    logoUrl: string
    isActive: boolean
  }>
): Promise<Organization | null> {
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) {
    fields.push('name = ?')
    values.push(updates.name)
  }
  if (updates.commissionRate !== undefined) {
    fields.push('commission_rate = ?')
    values.push(updates.commissionRate)
  }
  if (updates.currency !== undefined) {
    fields.push('currency = ?')
    values.push(updates.currency)
  }
  if (updates.timezone !== undefined) {
    fields.push('timezone = ?')
    values.push(updates.timezone)
  }
  if (updates.voucherFooter !== undefined) {
    fields.push('voucher_footer = ?')
    values.push(updates.voucherFooter)
  }
  if (updates.logoUrl !== undefined) {
    fields.push('logo_url = ?')
    values.push(updates.logoUrl)
  }
  if (updates.isActive !== undefined) {
    fields.push('is_active = ?')
    values.push(updates.isActive ? 1 : 0)
  }

  if (!fields.length) return getOrg(id)
  values.push(id)
  const sql = `UPDATE nx_organizations SET ${fields.join(', ')} WHERE id = ?`
  await query(sql, values)
  return getOrg(id)
}

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
  return query<AppUser>(
    `
    SELECT id, org_id AS orgId, username, email, role,
           branch_ip AS branchIp, is_active AS isActive,
           last_login AS lastLogin, created_at AS createdAt
    FROM nx_users WHERE org_id = ?
    ORDER BY username
  `,
    [orgId]
  )
}

export async function getUser(orgId: number, id: number): Promise<AppUser | null> {
  return queryOne<AppUser>(
    `
    SELECT id, org_id AS orgId, username, email, role,
           branch_ip AS branchIp, is_active AS isActive,
           last_login AS lastLogin, created_at AS createdAt
    FROM nx_users WHERE id = ? AND org_id = ?
  `,
    [id, orgId]
  )
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
  const [result] = await query<{ insertId: number }>(
    `
    INSERT INTO nx_users (org_id, username, email, password, role, branch_ip)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
    [opts.orgId, opts.username, opts.email ?? null, hash, opts.role, opts.branchIp ?? null]
  )
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

  if (updates.email !== undefined) {
    fields.push('email = ?')
    values.push(updates.email)
  }
  if (updates.role !== undefined) {
    fields.push('role = ?')
    values.push(updates.role)
  }
  if (updates.branchIp !== undefined) {
    fields.push('branch_ip = ?')
    values.push(updates.branchIp)
  }
  if (updates.isActive !== undefined) {
    fields.push('is_active = ?')
    values.push(updates.isActive ? 1 : 0)
  }
  if (updates.password) {
    const hash = await bcrypt.hash(updates.password, 12)
    fields.push('password = ?')
    values.push(hash)
  }

  if (!fields.length) return getUser(orgId, id)

  values.push(id, orgId)
  const sql = `UPDATE nx_users SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`
  await query(sql, values)
  return getUser(orgId, id)
}

export async function deleteUser(orgId: number, id: number): Promise<void> {
  await query('DELETE FROM nx_users WHERE id = ? AND org_id = ?', [id, orgId])
}

import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { query, queryOne } from '../db/mysql.js'
import { config } from '../config.js'
import type { SignOptions } from 'jsonwebtoken'
import type { AuthUser, LoginResponse, UserRole } from '@nexrad/shared'

interface DbUser {
  id: number
  org_id: number | null
  username: string
  email: string | null
  password: string
  role: string
  branch_ip: string | null
  is_active: number
}
interface DbOrg {
  slug: string
}
interface DbRefreshRow {
  id: number
  user_id: number
  expires_at: string
  revoked: number
  uid: number
  org_id: number | null
  username: string
  email: string | null
  role: string
  branch_ip: string | null
  is_active: number
}

export class AuthService {
  async login(username: string, password: string): Promise<LoginResponse> {
    const user = await queryOne<DbUser>(
      `SELECT id, org_id, username, email, password, role, branch_ip, is_active
       FROM nx_users WHERE username = ? LIMIT 1`,
      [username]
    )
    if (!user || !user.is_active) throw new Error('Invalid credentials')

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) throw new Error('Invalid credentials')

    const org = user.org_id
      ? await queryOne<DbOrg>('SELECT slug FROM nx_organizations WHERE id = ?', [user.org_id])
      : null

    await query('UPDATE nx_users SET last_login = NOW() WHERE id = ?', [user.id])

    const authUser: AuthUser = {
      id: user.id,
      orgId: user.org_id,
      username: user.username,
      email: user.email,
      role: user.role as UserRole,
      branchIp: user.branch_ip,
      orgSlug: org?.slug ?? null,
    }

    const accessToken = this.signAccess(authUser)
    const refreshToken = await this.createRefresh(user.id)

    return { accessToken, refreshToken, user: authUser }
  }

  async refresh(token: string): Promise<{ accessToken: string }> {
    const hash = await this.hashToken(token)
    const row = await queryOne<DbRefreshRow>(
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
      role: row.role as UserRole,
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
      { expiresIn: config.jwt.expiresIn as unknown as SignOptions['expiresIn'] }
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

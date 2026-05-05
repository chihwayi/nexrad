import { randomBytes, createHash } from 'crypto'
import type { ResultSetHeader } from 'mysql2'
import { query, queryOne } from '../../db/mysql.js'
import { redis } from '../../db/redis.js'

export interface ApiKey {
  id: number
  orgId: number
  name: string
  keyPrefix: string
  scopes: string[]
  lastUsed: string | null
  expiresAt: string | null
  isActive: boolean
  createdAt: string
  createdByUsername?: string
}

const CACHE_TTL = 300

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex')
}

function parseScopes(scopes: string[] | string | null): string[] {
  if (Array.isArray(scopes)) return scopes
  if (!scopes) return []
  return JSON.parse(scopes)
}

export async function generateApiKey(opts: {
  orgId: number
  name: string
  scopes: string[]
  expiresAt?: string
  createdBy: number
}): Promise<{ apiKey: ApiKey; rawKey: string }> {
  const prefix = randomBytes(4).toString('hex').toUpperCase()
  const secret = randomBytes(32).toString('hex')
  const rawKey = `nxk_${prefix}_${secret}`
  const keyHash = hashKey(rawKey)

  const [result] = await query<ResultSetHeader>(
    `
    INSERT INTO nx_api_keys
      (org_id, name, key_hash, key_prefix, scopes, expires_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    [
      opts.orgId,
      opts.name,
      keyHash,
      prefix,
      JSON.stringify(opts.scopes),
      opts.expiresAt ?? null,
      opts.createdBy,
    ]
  )

  const apiKey = await getApiKey(opts.orgId, result.insertId)
  return { apiKey: apiKey!, rawKey }
}

export async function validateApiKey(rawKey: string): Promise<{
  orgId: number
  scopes: string[]
  keyId: number
} | null> {
  if (!rawKey.startsWith('nxk_')) return null

  const keyHash = hashKey(rawKey)
  const cacheKey = `apikey:${keyHash}`

  const cached = await redis.get(cacheKey)
  if (cached) {
    const parsed = JSON.parse(cached)
    if (!parsed) return null
    return parsed
  }

  const key = await queryOne<{
    id: number
    org_id: number
    scopes: string[] | string | null
    expires_at: string | null
    is_active: boolean
  }>(
    `
    SELECT id, org_id, scopes, expires_at, is_active
    FROM nx_api_keys
    WHERE key_hash = ?
  `,
    [keyHash]
  )

  if (!key || !key.is_active) {
    await redis.setEx(cacheKey, 60, JSON.stringify(null))
    return null
  }

  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    await redis.setEx(cacheKey, 60, JSON.stringify(null))
    return null
  }

  const result = {
    orgId: key.org_id,
    scopes: parseScopes(key.scopes),
    keyId: key.id,
  }

  await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(result))
  query('UPDATE nx_api_keys SET last_used = NOW() WHERE id = ?', [key.id]).catch(() => {})

  return result
}

export async function listApiKeys(orgId: number): Promise<ApiKey[]> {
  const keys = await query<ApiKey & { scopes: string[] | string | null }>(
    `
    SELECT k.id, k.org_id AS orgId, k.name, k.key_prefix AS keyPrefix,
           k.scopes, k.last_used AS lastUsed, k.expires_at AS expiresAt,
           k.is_active AS isActive, k.created_at AS createdAt,
           u.username AS createdByUsername
    FROM nx_api_keys k
    LEFT JOIN nx_users u ON u.id = k.created_by
    WHERE k.org_id = ?
    ORDER BY k.created_at DESC
  `,
    [orgId]
  )
  return keys.map((key) => ({ ...key, scopes: parseScopes(key.scopes) }))
}

export async function getApiKey(orgId: number, id: number): Promise<ApiKey | null> {
  const key = await queryOne<ApiKey & { scopes: string[] | string | null }>(
    `
    SELECT k.id, k.org_id AS orgId, k.name, k.key_prefix AS keyPrefix,
           k.scopes, k.last_used AS lastUsed, k.expires_at AS expiresAt,
           k.is_active AS isActive, k.created_at AS createdAt
    FROM nx_api_keys k
    WHERE k.id = ? AND k.org_id = ?
  `,
    [id, orgId]
  )
  return key ? { ...key, scopes: parseScopes(key.scopes) } : null
}

export async function revokeApiKey(orgId: number, id: number): Promise<void> {
  await query('UPDATE nx_api_keys SET is_active = 0 WHERE id = ? AND org_id = ?', [id, orgId])
  const [key] = await query<{ key_hash: string }>(
    'SELECT key_hash FROM nx_api_keys WHERE id = ? AND org_id = ?',
    [id, orgId]
  )
  if (key) await redis.del(`apikey:${key.key_hash}`)
}

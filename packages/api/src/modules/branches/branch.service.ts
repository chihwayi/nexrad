import { randomBytes } from 'crypto'
import { query, queryOne } from '../../db/mysql.js'
import {
  allocateTunnelIp,
  buildRouterOSScript,
  addWgPeer,
  removeWgPeer,
  getServerPublicKey,
} from '../wireguard/wg.service.js'
import { config } from '../../config.js'

export interface Branch {
  id: number
  orgId: number
  nasIp: string
  shortname: string
  name: string
  location: string | null
  wgPubkey: string | null
  tunnelIp: string | null
  radiusSecret: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  // Derived at runtime from wg show
  status?: 'online' | 'recent' | 'inactive' | 'pending'
  activeSessions?: number
}

export interface CreateBranchInput {
  orgId: number
  name: string
  shortname: string
  location?: string
}

function generateRadiusSecret(): string {
  // 20 random hex chars — strong enough, short enough to fit in RouterOS terminal
  return randomBytes(10).toString('hex')
}

function generateRegToken(): string {
  return randomBytes(32).toString('hex')
}

export async function listBranches(orgId: number): Promise<Branch[]> {
  return query<Branch>(
    `
    SELECT id, org_id AS orgId, nas_ip AS nasIp, shortname, name, location,
           wg_pubkey AS wgPubkey, tunnel_ip AS tunnelIp,
           radius_secret AS radiusSecret,
           is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
    FROM nx_branches WHERE org_id = ?
    ORDER BY name
  `,
    [orgId]
  )
}

export async function getBranch(orgId: number, id: number): Promise<Branch | null> {
  return queryOne<Branch>(
    `
    SELECT id, org_id AS orgId, nas_ip AS nasIp, shortname, name, location,
           wg_pubkey AS wgPubkey, tunnel_ip AS tunnelIp,
           radius_secret AS radiusSecret,
           is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
    FROM nx_branches WHERE id = ? AND org_id = ?
  `,
    [id, orgId]
  )
}

/**
 * Create a branch:
 * 1. Allocate a tunnel IP from 10.8.0.2 upward
 * 2. Generate a unique RADIUS secret and a one-time registration token
 * 3. Insert into nx_branches (wg_pubkey stays NULL until MikroTik self-registers)
 * 4. Insert into FreeRADIUS nas table with the real secret
 * Returns the branch record. The RouterOS script is built on demand via getProvisionScript().
 */
export async function createBranch(input: CreateBranchInput): Promise<Branch> {
  const tunnelIp = await allocateTunnelIp()
  const radiusSecret = generateRadiusSecret()
  const regToken = generateRegToken()
  const nasIp = tunnelIp

  const [result] = await query<{ insertId: number }>(
    `
    INSERT INTO nx_branches
      (org_id, nas_ip, shortname, name, location, tunnel_ip, radius_secret, reg_token, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `,
    [
      input.orgId,
      nasIp,
      input.shortname,
      input.name,
      input.location ?? null,
      tunnelIp,
      radiusSecret,
      regToken,
    ]
  )

  const branchId = result.insertId

  await query(
    `
    INSERT IGNORE INTO nas (nasname, shortname, type, secret, description)
    VALUES (?, ?, 'other', ?, ?)
  `,
    [nasIp, input.shortname, radiusSecret, input.name]
  )

  return (await getBranch(input.orgId, branchId))!
}

/**
 * Build and return the RouterOS .rsc provisioning script for a branch.
 * Called by the download endpoint. Safe to call multiple times.
 */
export async function getProvisionScript(branch: Branch): Promise<string> {
  if (!config.wg.endpoint) {
    throw new Error('WG_SERVER_ENDPOINT not configured — cannot generate provisioning script')
  }
  if (!config.wg.serverPublicKey) {
    throw new Error('WG_SERVER_PUBLIC_KEY not configured — cannot generate provisioning script')
  }

  // Fetch the one-time reg token for this branch
  const row = await queryOne<{ reg_token: string | null }>(
    'SELECT reg_token FROM nx_branches WHERE id = ? AND org_id = ?',
    [branch.id, branch.orgId]
  )

  if (!row?.reg_token) {
    throw new Error(
      'Branch is already activated or reg token has been used. Delete and recreate the branch to reprovision.'
    )
  }

  return buildRouterOSScript({
    branchShortname: branch.shortname,
    branchName: branch.name,
    tunnelIp: branch.tunnelIp!,
    radiusSecret: branch.radiusSecret,
    serverPublicKey: config.wg.serverPublicKey || getServerPublicKey(),
    serverEndpoint: config.wg.endpoint,
    serverPort: config.wg.port,
    serverRadiusIp: config.wg.serverIp,
    registrationToken: row.reg_token,
    apiBaseUrl: config.apiBaseUrl,
  })
}

/**
 * Called when the MikroTik POSTs its public key after running the provisioning script.
 * Validates the one-time token, adds the WireGuard peer, updates the DB.
 */
export async function registerPeer(token: string, publicKey: string): Promise<Branch> {
  const branch = await queryOne<Branch & { reg_token: string }>(
    `SELECT id, org_id AS orgId, name, shortname, tunnel_ip AS tunnelIp,
            wg_pubkey AS wgPubkey, radius_secret AS radiusSecret, reg_token
     FROM nx_branches WHERE reg_token = ? AND org_id IS NOT NULL`,
    [token]
  )

  if (!branch)
    throw Object.assign(new Error('Invalid or expired registration token'), { statusCode: 403 })
  if (branch.wgPubkey)
    throw Object.assign(new Error('Branch already registered'), { statusCode: 409 })

  // Add the peer to the live WireGuard interface and conf file
  await addWgPeer({
    publicKey,
    tunnelIp: branch.tunnelIp!,
    branchName: branch.name,
  })

  // Persist public key and consume the token
  await query('UPDATE nx_branches SET wg_pubkey = ?, reg_token = NULL WHERE id = ?', [
    publicKey,
    branch.id,
  ])

  return (await getBranch(branch.orgId, branch.id))!
}

/**
 * Manual activation path — admin pastes the public key into the NexRAD UI.
 * Used as a fallback when auto-registration (MikroTik HTTP callback) fails.
 */
export async function activateBranch(orgId: number, id: number, wgPubkey: string): Promise<Branch> {
  const branch = await getBranch(orgId, id)
  if (!branch) throw Object.assign(new Error('Branch not found'), { statusCode: 404 })
  if (branch.wgPubkey)
    throw Object.assign(new Error('Branch already activated'), { statusCode: 409 })
  if (!branch.tunnelIp) throw Object.assign(new Error('No tunnel IP assigned'), { statusCode: 400 })

  await addWgPeer({ publicKey: wgPubkey, tunnelIp: branch.tunnelIp, branchName: branch.name })
  await query(
    'UPDATE nx_branches SET wg_pubkey = ?, reg_token = NULL WHERE id = ? AND org_id = ?',
    [wgPubkey, id, orgId]
  )

  return (await getBranch(orgId, id))!
}

export async function updateBranch(
  orgId: number,
  id: number,
  updates: Partial<{ name: string; location: string; isActive: boolean }>
): Promise<Branch | null> {
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) {
    fields.push('name = ?')
    values.push(updates.name)
  }
  if (updates.location !== undefined) {
    fields.push('location = ?')
    values.push(updates.location)
  }
  if (updates.isActive !== undefined) {
    fields.push('is_active = ?')
    values.push(updates.isActive ? 1 : 0)
  }

  if (!fields.length) return getBranch(orgId, id)

  values.push(id, orgId)
  const sql = `UPDATE nx_branches SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`
  await query(sql, values)
  return getBranch(orgId, id)
}

export async function deleteBranch(orgId: number, id: number): Promise<void> {
  const branch = await getBranch(orgId, id)
  if (!branch) return

  if (branch.wgPubkey) removeWgPeer(branch.wgPubkey)

  await query('DELETE FROM nx_branches WHERE id = ? AND org_id = ?', [id, orgId])
  await query('DELETE FROM nas WHERE nasname = ?', [branch.nasIp])
}

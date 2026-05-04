# Sprint 4 — Branches & WireGuard Management
**Duration:** 4 days | **Goal:** Full branch CRUD, WireGuard peer config generation, QR code download, branch status monitoring, and the first truly Starlink-capable branch onboarding flow.

> After this sprint: an admin can add a branch, download a WireGuard config or scan a QR code, and the branch is live within minutes — no static IP required.

---

## Prerequisites
- Sprint 0–3 sign-off checklists all ✓
- WireGuard installed on server (`wg` command available)
- `wg genkey`, `wg pubkey`, `wg genpsk` commands available in API container
- `qrcode` npm package installed (already in package.json from Sprint 0)

---

## Task 4.1 — WireGuard Key Generation Service (API)

### `packages/api/src/modules/wireguard/wg.service.ts`
```typescript
import { execSync } from 'child_process'
import { pool } from '../../db/mysql.js'
import { query, queryOne } from '../../db/mysql.js'
import { config } from '../../config.js'

export interface WgPeerConfig {
  privateKey: string
  publicKey: string
  presharedKey: string
  allowedIp: string  // e.g. 10.8.0.5/32
  serverPublicKey: string
  serverEndpoint: string
  serverPort: number
  dns: string
  keepalive: number
}

export interface WgServerStatus {
  interface: string
  peers: WgActivePeer[]
  serverPublicKey: string
}

export interface WgActivePeer {
  publicKey: string
  endpoint: string | null
  lastHandshake: string | null
  rxBytes: number
  txBytes: number
  allowedIps: string
}

/**
 * Generates a new WireGuard keypair + preshared key for a branch peer.
 * Uses exec — only called server-side, input is not user-controlled.
 */
export function generateWgKeypair(): { privateKey: string; publicKey: string; presharedKey: string } {
  const privateKey = execSync('wg genkey').toString().trim()
  const publicKey = execSync(`echo "${privateKey}" | wg pubkey`).toString().trim()
  const presharedKey = execSync('wg genpsk').toString().trim()
  return { privateKey, publicKey, presharedKey }
}

/**
 * Assign the next available tunnel IP in the WireGuard subnet.
 * Reserves 10.8.0.1 for server, starts allocating from 10.8.0.2.
 */
export async function allocateTunnelIp(): Promise<string> {
  const [subnetBase] = config.wg.subnet.split('/')  // '10.8.0.0'
  const parts = subnetBase.split('.').map(Number)

  const existing = await query<{ tunnel_ip: string }>(
    'SELECT tunnel_ip FROM nx_branches WHERE tunnel_ip IS NOT NULL ORDER BY tunnel_ip'
  )
  const usedLast = new Set(existing.map((r) => {
    const last = r.tunnel_ip.split('.')[3]
    return Number(last)
  }))

  // Start from .2 (.1 = server), find first unused
  for (let i = 2; i < 254; i++) {
    if (!usedLast.has(i)) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.${i}`
    }
  }
  throw new Error('No tunnel IPs available in subnet')
}

/**
 * Build the client-side WireGuard config file content.
 * The server peer has NO Endpoint when using dynamic/Starlink IPs.
 * The client side MUST have the server endpoint so it can initiate the connection.
 */
export function buildClientConfig(peer: WgPeerConfig): string {
  return `[Interface]
PrivateKey = ${peer.privateKey}
Address = ${peer.allowedIp}
DNS = ${peer.dns}

[Peer]
PublicKey = ${peer.serverPublicKey}
PresharedKey = ${peer.presharedKey}
AllowedIPs = ${config.wg.serverIp}/32
Endpoint = ${peer.serverEndpoint}:${peer.serverPort}
PersistentKeepalive = ${peer.keepalive}
`
}

/**
 * Build the server-side peer stanza to append to wg0.conf.
 * NOTE: No Endpoint= here — Starlink/dynamic IP branches initiate the tunnel.
 * FreeRADIUS sees the stable tunnel IP (10.8.0.x) regardless of real IP.
 */
export function buildServerPeerStanza(opts: {
  publicKey: string
  presharedKey: string
  tunnelIp: string
  branchName: string
}): string {
  return `
# Branch: ${opts.branchName}
[Peer]
PublicKey = ${opts.publicKey}
PresharedKey = ${opts.presharedKey}
AllowedIPs = ${opts.tunnelIp}/32
# No Endpoint= — branch initiates connection (supports Starlink/dynamic IP)
PersistentKeepalive = 25
`
}

/**
 * Parse `wg show wg0 dump` output into structured peer data.
 */
export function parseWgDump(dump: string): WgActivePeer[] {
  const lines = dump.trim().split('\n').slice(1) // skip header line
  return lines.map((line) => {
    const [pubkey, preshared, endpoint, allowedIps, lastHandshake, rxBytes, txBytes] =
      line.split('\t')
    return {
      publicKey: pubkey,
      endpoint: endpoint === '(none)' ? null : endpoint,
      lastHandshake:
        lastHandshake === '0'
          ? null
          : new Date(Number(lastHandshake) * 1000).toISOString(),
      rxBytes: Number(rxBytes ?? 0),
      txBytes: Number(txBytes ?? 0),
      allowedIps,
    }
  })
}

export async function getWgStatus(): Promise<WgActivePeer[]> {
  try {
    const dump = execSync(`wg show ${config.wg.interface} dump 2>/dev/null`).toString()
    return parseWgDump(dump)
  } catch {
    return []
  }
}

export async function getServerPublicKey(): Promise<string> {
  try {
    return execSync(`wg show ${config.wg.interface} public-key 2>/dev/null`).toString().trim()
  } catch {
    return config.wg.interface  // fallback — should not happen in prod
  }
}
```

---

## Task 4.2 — Branch CRUD Service (API)

### `packages/api/src/modules/branches/branch.service.ts`
```typescript
import { query, queryOne } from '../../db/mysql.js'
import {
  generateWgKeypair,
  allocateTunnelIp,
  buildClientConfig,
  buildServerPeerStanza,
  getServerPublicKey,
  getWgStatus,
} from '../wireguard/wg.service.js'
import { config } from '../../config.js'
import { execSync } from 'child_process'
import { writeFileSync, appendFileSync } from 'fs'

export interface Branch {
  id: number
  orgId: number
  nasIp: string
  shortname: string
  name: string
  location: string | null
  wgPubkey: string | null
  wgEndpoint: string | null
  tunnelIp: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  // Derived at runtime
  status?: 'online' | 'recent' | 'inactive'
  activeSessions?: number
}

export interface CreateBranchInput {
  orgId: number
  name: string
  shortname: string
  location?: string
  enableWireguard?: boolean
}

export async function listBranches(orgId: number): Promise<Branch[]> {
  return query<Branch>(`
    SELECT id, org_id AS orgId, nas_ip AS nasIp, shortname, name, location,
           wg_pubkey AS wgPubkey, wg_endpoint AS wgEndpoint, tunnel_ip AS tunnelIp,
           is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
    FROM nx_branches
    WHERE org_id = ?
    ORDER BY name
  `, [orgId])
}

export async function getBranch(orgId: number, id: number): Promise<Branch | null> {
  return queryOne<Branch>(`
    SELECT id, org_id AS orgId, nas_ip AS nasIp, shortname, name, location,
           wg_pubkey AS wgPubkey, wg_endpoint AS wgEndpoint, tunnel_ip AS tunnelIp,
           is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
    FROM nx_branches
    WHERE id = ? AND org_id = ?
  `, [id, orgId])
}

/**
 * Create a branch. If enableWireguard=true:
 * 1. Generate keypair
 * 2. Allocate tunnel IP
 * 3. Append peer stanza to wg0.conf
 * 4. Apply with `wg addpeer` (no restart needed)
 * 5. Store keys in DB
 * Returns the client WireGuard config string.
 */
export async function createBranch(
  input: CreateBranchInput,
  createdBy: number
): Promise<{ branch: Branch; wgClientConfig?: string; wgPrivateKey?: string }> {
  let tunnelIp: string | null = null
  let wgPubkey: string | null = null
  let wgClientConfig: string | undefined
  let wgPrivateKey: string | undefined
  let presharedKey: string | null = null

  if (input.enableWireguard) {
    const keys = generateWgKeypair()
    tunnelIp = await allocateTunnelIp()
    wgPubkey = keys.publicKey
    wgPrivateKey = keys.privateKey
    presharedKey = keys.presharedKey

    const serverPublicKey = await getServerPublicKey()

    // Append to wg0.conf
    const stanza = buildServerPeerStanza({
      publicKey: keys.publicKey,
      presharedKey: keys.presharedKey,
      tunnelIp,
      branchName: input.name,
    })
    appendFileSync(config.wg.configPath, stanza, 'utf8')

    // Apply live without restart
    try {
      execSync(
        `wg set ${config.wg.interface} peer ${keys.publicKey} preshared-key <(echo ${presharedKey}) allowed-ips ${tunnelIp}/32`,
        { shell: '/bin/bash' }
      )
    } catch (e) {
      console.warn('wg set failed (non-fatal, conf updated):', e)
    }

    wgClientConfig = buildClientConfig({
      privateKey: keys.privateKey,
      publicKey: keys.publicKey,
      presharedKey: keys.presharedKey,
      allowedIp: `${tunnelIp}/32`,
      serverPublicKey,
      serverEndpoint: config.wg.endpoint,
      serverPort: config.wg.port,
      dns: config.wg.serverIp,
      keepalive: 25,
    })
  }

  const nasIp = tunnelIp ?? '0.0.0.0'  // Placeholder if no WG

  const [result] = await query<{ insertId: number }>(`
    INSERT INTO nx_branches
      (org_id, nas_ip, shortname, name, location, wg_pubkey, tunnel_ip, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `, [input.orgId, nasIp, input.shortname, input.name, input.location ?? null, wgPubkey, tunnelIp])

  const branchId = (result as any).insertId

  // Also add to FreeRADIUS nas table so it can authenticate
  await query(`
    INSERT IGNORE INTO nas (nasname, shortname, type, secret, description)
    VALUES (?, ?, 'other', 'testing123', ?)
  `, [nasIp, input.shortname, input.name])

  const branch = await getBranch(input.orgId, branchId)

  return { branch: branch!, wgClientConfig, wgPrivateKey }
}

export async function updateBranch(
  orgId: number,
  id: number,
  updates: Partial<{ name: string; location: string; isActive: boolean }>
): Promise<Branch | null> {
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
  if (updates.location !== undefined) { fields.push('location = ?'); values.push(updates.location) }
  if (updates.isActive !== undefined) { fields.push('is_active = ?'); values.push(updates.isActive ? 1 : 0) }

  if (!fields.length) return getBranch(orgId, id)

  values.push(id, orgId)
  await query(`UPDATE nx_branches SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`, values)
  return getBranch(orgId, id)
}

export async function deleteBranch(orgId: number, id: number): Promise<void> {
  const branch = await getBranch(orgId, id)
  if (!branch) return

  // Remove WireGuard peer if configured
  if (branch.wgPubkey) {
    try {
      execSync(`wg set ${config.wg.interface} peer ${branch.wgPubkey} remove`)
    } catch {
      console.warn('Failed to remove wg peer (peer may not exist)')
    }
  }

  await query('DELETE FROM nx_branches WHERE id = ? AND org_id = ?', [id, orgId])
  await query('DELETE FROM nas WHERE nasname = ?', [branch.nasIp])
}
```

---

## Task 4.3 — Branch Routes (API)

### `packages/api/src/modules/branches/branch.routes.ts`
```typescript
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireRole } from '../auth/auth.middleware.js'
import {
  listBranches, getBranch, createBranch, updateBranch, deleteBranch
} from './branch.service.js'
import { getWgStatus } from '../wireguard/wg.service.js'
import QRCode from 'qrcode'

const CreateBranchSchema = z.object({
  name: z.string().min(2).max(100),
  shortname: z.string().min(2).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  location: z.string().max(255).optional(),
  enableWireguard: z.boolean().default(true),
})

const UpdateBranchSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  location: z.string().max(255).optional(),
  isActive: z.boolean().optional(),
})

export async function branchRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  // List branches
  app.get('/branches', async (req) => {
    return listBranches(req.user!.orgId)
  })

  // Get single branch
  app.get<{ Params: { id: string } }>('/branches/:id', async (req, reply) => {
    const branch = await getBranch(req.user!.orgId, Number(req.params.id))
    if (!branch) return reply.status(404).send({ error: 'Branch not found' })
    return branch
  })

  // Create branch (orgadmin+)
  app.post(
    '/branches',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      const body = CreateBranchSchema.parse(req.body)
      const result = await createBranch(
        { ...body, orgId: req.user!.orgId },
        req.user!.id
      )
      return reply.status(201).send(result)
    }
  )

  // Update branch
  app.patch<{ Params: { id: string } }>(
    '/branches/:id',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      const updates = UpdateBranchSchema.parse(req.body)
      const branch = await updateBranch(req.user!.orgId, Number(req.params.id), updates)
      if (!branch) return reply.status(404).send({ error: 'Branch not found' })
      return branch
    }
  )

  // Delete branch
  app.delete<{ Params: { id: string } }>(
    '/branches/:id',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      await deleteBranch(req.user!.orgId, Number(req.params.id))
      return reply.status(204).send()
    }
  )

  // Download WireGuard config file
  app.get<{ Params: { id: string } }>(
    '/branches/:id/wireguard/config',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      const branch = await getBranch(req.user!.orgId, Number(req.params.id))
      if (!branch) return reply.status(404).send({ error: 'Branch not found' })
      if (!branch.wgPubkey) return reply.status(400).send({ error: 'WireGuard not configured for this branch' })

      // Config file is generated on demand from stored public key
      // Private key is NOT stored (zero-knowledge) — returned once at creation
      return reply.status(400).send({
        error: 'Private key not stored. Download config at branch creation time.',
        hint: 'Re-create the branch to get a new WireGuard config.',
      })
    }
  )

  // Generate QR code for WireGuard config (returns base64 PNG)
  app.post<{ Params: { id: string } }>(
    '/branches/:id/wireguard/qr',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      // QR generation requires the config string — passed in body after creation
      const { configString } = req.body as { configString: string }
      if (!configString) return reply.status(400).send({ error: 'configString required' })

      const qr = await QRCode.toDataURL(configString, {
        errorCorrectionLevel: 'M',
        width: 400,
      })
      return { qrDataUrl: qr }
    }
  )

  // WireGuard live peer status
  app.get(
    '/branches/wireguard/status',
    { preHandler: requireRole('orgadmin') },
    async () => {
      const peers = await getWgStatus()
      return { peers }
    }
  )
}
```

### Register in `packages/api/src/app.ts`:
```typescript
import { branchRoutes } from './modules/branches/branch.routes.js'
// inside buildApp:
await app.register(branchRoutes, { prefix: '/api' })
```

---

## Task 4.4 — Frontend: Branches Page

### `packages/web/src/pages/Branches.tsx`
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
import { Plus, Download, QrCode, Trash2, Wifi, WifiOff } from 'lucide-react'
import type { Branch } from '@nexrad/shared'

export default function Branches() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [wgResult, setWgResult] = useState<{ configString: string; branchName: string } | null>(null)

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<Branch[]>('/branches').then((r) => r.data),
    refetchInterval: 15_000,
  })

  const columns = [
    { key: 'name', header: 'Branch Name' },
    { key: 'shortname', header: 'Shortname' },
    { key: 'nasIp', header: 'Tunnel IP / NAS IP' },
    { key: 'location', header: 'Location', render: (v: string | null) => v ?? '—' },
    {
      key: 'wgPubkey',
      header: 'WireGuard',
      render: (v: string | null) =>
        v ? (
          <span className="flex items-center gap-1 text-success text-sm">
            <Wifi className="h-4 w-4" /> Configured
          </span>
        ) : (
          <span className="flex items-center gap-1 text-muted-foreground text-sm">
            <WifiOff className="h-4 w-4" /> None
          </span>
        ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (v: boolean) =>
        v ? <span className="badge-online">Active</span> : <span className="badge-offline">Inactive</span>,
    },
    {
      key: 'id',
      header: '',
      render: (_: number, row: Branch) => (
        <div className="flex gap-2 justify-end">
          <DeleteButton branch={row} onDeleted={() => qc.invalidateQueries({ queryKey: ['branches'] })} />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branches"
        subtitle="Manage branch locations and WireGuard VPN connections"
        actions={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Branch
          </Button>
        }
      />

      <DataTable
        data={branches}
        columns={columns as any}
        keyField="id"
        loading={isLoading}
        emptyMessage="No branches yet. Add your first branch to get started."
      />

      <AddBranchDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={(result) => {
          qc.invalidateQueries({ queryKey: ['branches'] })
          setShowAdd(false)
          if (result.wgClientConfig) {
            setWgResult({ configString: result.wgClientConfig, branchName: result.branch.name })
          }
        }}
      />

      {wgResult && (
        <WgConfigDialog
          {...wgResult}
          onClose={() => setWgResult(null)}
        />
      )}
    </div>
  )
}

function AddBranchDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (result: any) => void
}) {
  const [form, setForm] = useState({
    name: '',
    shortname: '',
    location: '',
    enableWireguard: true,
  })
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/branches', data).then((r) => r.data),
    onSuccess: (data) => onCreated(data),
    onError: (e: any) => setError(e.response?.data?.message ?? 'Failed to create branch'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Branch</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="name">Branch Name</Label>
            <Input
              id="name"
              placeholder="Harare Central"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="shortname">Shortname</Label>
            <Input
              id="shortname"
              placeholder="hre-central"
              value={form.shortname}
              onChange={(e) => setForm((f) => ({ ...f, shortname: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Letters, numbers, hyphens only. Used in reports and voucher labels.
            </p>
          </div>
          <div>
            <Label htmlFor="location">Location (optional)</Label>
            <Input
              id="location"
              placeholder="123 Samora Machel Ave"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
          </div>
          <div className="flex items-center justify-between py-2 border-t border-border">
            <div>
              <p className="font-medium text-sm">Enable WireGuard VPN</p>
              <p className="text-xs text-muted-foreground">
                Required for Starlink/dynamic IP branches
              </p>
            </div>
            <Switch
              checked={form.enableWireguard}
              onCheckedChange={(v) => setForm((f) => ({ ...f, enableWireguard: v }))}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => mutation.mutate(form)}
              disabled={mutation.isPending || !form.name || !form.shortname}
            >
              {mutation.isPending ? 'Creating...' : 'Create Branch'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function WgConfigDialog({
  configString,
  branchName,
  onClose,
}: {
  configString: string
  branchName: string
  onClose: () => void
}) {
  const [qrData, setQrData] = useState<string | null>(null)

  const generateQr = async () => {
    const res = await api.post('/branches/0/wireguard/qr', { configString })
    setQrData(res.data.qrDataUrl)
  }

  const downloadConfig = () => {
    const blob = new Blob([configString], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${branchName.replace(/\s+/g, '-').toLowerCase()}-wg0.conf`
    a.click()
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>WireGuard Config — {branchName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-muted rounded-lg p-3">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all">
              {configString}
            </pre>
          </div>
          <p className="text-sm text-warning font-medium">
            Save this now — the private key will not be shown again.
          </p>
          <div className="flex gap-2">
            <Button onClick={downloadConfig} className="flex-1">
              <Download className="h-4 w-4 mr-2" /> Download .conf
            </Button>
            <Button variant="outline" onClick={generateQr} className="flex-1">
              <QrCode className="h-4 w-4 mr-2" /> Show QR Code
            </Button>
          </div>
          {qrData && (
            <div className="flex flex-col items-center gap-2 pt-2 border-t border-border">
              <p className="text-sm text-muted-foreground">Scan with the WireGuard mobile app</p>
              <img src={qrData} alt="WireGuard QR Code" className="w-64 h-64 rounded-lg" />
            </div>
          )}
          <Button variant="outline" onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DeleteButton({ branch, onDeleted }: { branch: Branch; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)

  const mutation = useMutation({
    mutationFn: () => api.delete(`/branches/${branch.id}`),
    onSuccess: onDeleted,
  })

  if (confirming) {
    return (
      <div className="flex gap-1">
        <Button
          variant="destructive"
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          Confirm
        </Button>
        <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
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

## Task 4.5 — Install React Query

### Install in web package:
```bash
cd packages/web
pnpm add @tanstack/react-query
```

### `packages/web/src/lib/query.ts`
```typescript
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})
```

### Update `packages/web/src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/query'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
```

---

## Task 4.6 — Sidebar Nav: Add Branches Link

### Update `packages/web/src/components/Sidebar.tsx` — nav items array:
```typescript
const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['superadmin','orgadmin','branchmanager','operator','readonly'] },
  { href: '/branches', label: 'Branches', icon: MapPin, roles: ['superadmin','orgadmin','branchmanager'] },
  // Sprint 5+
]
```

### Update `packages/web/src/App.tsx` — add route:
```tsx
import Branches from './pages/Branches'
// inside Routes:
<Route path="/branches" element={<Branches />} />
```

### Import `MapPin` from lucide-react in Sidebar.tsx.

---

## Task 4.7 — WireGuard Status Page

### `packages/web/src/pages/WireGuardStatus.tsx`
```tsx
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { PageHeader } from '../components/PageHeader'
import { DataTable } from '../components/DataTable'
import { formatBytes } from '../lib/utils'

interface WgPeer {
  publicKey: string
  endpoint: string | null
  lastHandshake: string | null
  rxBytes: number
  txBytes: number
  allowedIps: string
}

export default function WireGuardStatus() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['wg-status'],
    queryFn: () => api.get<{ peers: WgPeer[] }>('/branches/wireguard/status').then((r) => r.data),
    refetchInterval: 15_000,
  })

  const columns = [
    {
      key: 'allowedIps',
      header: 'Tunnel IP',
      render: (v: string) => v.replace('/32', ''),
    },
    {
      key: 'endpoint',
      header: 'Real Endpoint',
      render: (v: string | null) => v ?? <span className="text-muted-foreground">Not connected</span>,
    },
    {
      key: 'lastHandshake',
      header: 'Last Handshake',
      render: (v: string | null) => {
        if (!v) return <span className="text-muted-foreground">Never</span>
        const minutesAgo = (Date.now() - new Date(v).getTime()) / 60000
        const label = minutesAgo < 2 ? 'Just now' : `${Math.round(minutesAgo)}m ago`
        const cls = minutesAgo < 5 ? 'badge-online' : minutesAgo < 60 ? 'badge-warning' : 'badge-offline'
        return <span className={cls}>{label}</span>
      },
    },
    { key: 'rxBytes', header: 'Received', render: (v: number) => formatBytes(v) },
    { key: 'txBytes', header: 'Sent', render: (v: number) => formatBytes(v) },
    {
      key: 'publicKey',
      header: 'Public Key',
      render: (v: string) => (
        <span className="font-mono text-xs">{v.slice(0, 12)}…</span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="WireGuard Status"
        subtitle="Live peer connection status — updates every 15s"
      />
      <DataTable
        data={data?.peers ?? []}
        columns={columns as any}
        keyField="publicKey"
        loading={isLoading}
        emptyMessage="No WireGuard peers connected. Is wg0 running?"
      />
    </div>
  )
}
```

---

## Task 4.8 — Shared Branch Types Update

### `packages/shared/src/types/branch.types.ts` — verify/update:
```typescript
export type BranchStatus = 'online' | 'recent' | 'inactive'

export interface Branch {
  id: number
  orgId: number
  nasIp: string
  shortname: string
  name: string
  location: string | null
  wgPubkey: string | null
  wgEndpoint: string | null
  tunnelIp: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  status?: BranchStatus
  activeSessions?: number
}

export interface WireGuardPeerConfig {
  privateKey: string
  publicKey: string
  presharedKey: string
  allowedIp: string
  serverPublicKey: string
  serverEndpoint: string
  serverPort: number
  dns: string
  keepalive: number
}

export interface CreateBranchDto {
  name: string
  shortname: string
  location?: string
  enableWireguard?: boolean
}
```

---

## Task 4.9 — Integration Tests

### `packages/api/src/modules/branches/__tests__/branch.test.ts`
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../../app.js'
import type { FastifyInstance } from 'fastify'

describe('Branch endpoints', () => {
  let app: FastifyInstance
  let token: string
  let createdBranchId: number

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
    if (createdBranchId) {
      await app.inject({
        method: 'DELETE',
        url: `/api/branches/${createdBranchId}`,
        headers: { authorization: `Bearer ${token}` },
      })
    }
    await app.close()
  })

  it('GET /api/branches returns array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/branches',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })

  it('POST /api/branches creates branch without WireGuard', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/branches',
      headers: { authorization: `Bearer ${token}` },
      body: {
        name: 'Test Branch',
        shortname: 'test-branch',
        location: 'Test Location',
        enableWireguard: false,
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.branch.name).toBe('Test Branch')
    expect(body.wgClientConfig).toBeUndefined()
    createdBranchId = body.branch.id
  })

  it('GET /api/branches/:id returns the branch', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/branches/${createdBranchId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('Test Branch')
  })

  it('PATCH /api/branches/:id updates branch', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/branches/${createdBranchId}`,
      headers: { authorization: `Bearer ${token}` },
      body: { location: 'Updated Location' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().location).toBe('Updated Location')
  })

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/branches' })
    expect(res.statusCode).toBe(401)
  })
})
```

---

## Sprint 4 Sign-Off Checklist

Before marking Sprint 4 complete, every item must be ✓:

- [ ] `pnpm typecheck` exits 0 in all packages
- [ ] `pnpm lint` exits 0 in all packages
- [ ] `pnpm test` passes (branch.test.ts all green)
- [ ] `GET /api/branches` returns `[]` or populated array with a valid JWT
- [ ] `POST /api/branches` (enableWireguard: false) creates a branch — returns 201 with branch object
- [ ] `POST /api/branches` (enableWireguard: true) returns `wgClientConfig` string in response
- [ ] Downloaded `.conf` file has correct `[Interface]` and `[Peer]` stanzas
- [ ] QR code endpoint returns a valid base64 PNG data URL
- [ ] Branches page renders in browser — table shows existing branches
- [ ] "Add Branch" dialog opens, form validates (shortname rejects spaces)
- [ ] After creating a branch with WireGuard: config dialog appears with download button
- [ ] WireGuard Status page loads (empty if no peers, no errors)
- [ ] Deleting a branch requires confirmation click (two-step UX)
- [ ] `pnpm build` succeeds
- [ ] `pnpm docker:dev` still starts cleanly

**CI must be green before Sprint 5 begins.**

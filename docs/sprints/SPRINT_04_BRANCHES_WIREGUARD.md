# Sprint 4 — Branches & WireGuard Management

**Duration:** 4 days | **Goal:** Full branch CRUD, zero-touch RouterOS provisioning script generation, automatic WireGuard peer self-registration, and branch status monitoring.

> **AI ASSISTANT:** Before implementing this sprint, read `docs/GROUND_TRUTH.md` for canonical component APIs, import paths, and store names. Sprint docs may conflict — GROUND_TRUTH.md wins.

> **After this sprint:** An admin creates a branch in NexRAD, downloads a RouterOS `.rsc` script, the field deployer imports it to a MikroTik via WinBox drag-drop, the router self-configures and calls back to NexRAD with its WireGuard public key, the peer is added live — no SSH, no manual SQL, no key copy-pasting.

---

## Architecture Overview

```
NexRAD UI
  → Create branch (allocate tunnel IP, generate RADIUS secret, generate reg token)
  → Admin downloads RouterOS .rsc provisioning script

Field deployer
  → Factory reset MikroTik → WinBox → drag .rsc to Files → /import filename.rsc
  → MikroTik self-configures: bridge, hotspot, WireGuard (generates its OWN keys), RADIUS
  → Script calls back: POST /api/branches/register-peer { token, publicKey }

NexRAD API (register-peer endpoint)
  → Validates one-time token
  → Runs: wg set wg0 peer <pubKey> allowed-ips <tunnelIp>/32 persistent-keepalive=25
  → Appends [Peer] stanza to /etc/wireguard/wg0.conf
  → Updates nx_branches.wg_pubkey, nulls reg_token

WireGuard tunnel comes up → RADIUS auth works → branch is live
```

The MikroTik generates its own private key (never leaves the device). NexRAD only ever sees the public key.

---

## Prerequisites

- Sprint 0–3 sign-off checklists all ✓
- `wg` command available in the API container (`wireguard-tools` installed)
- `WG_SERVER_ENDPOINT` env var set to the server's public IP (e.g. `173.212.195.88`)
- `WG_SERVER_PUBLIC_KEY` env var set to the server's WireGuard public key (run `wg show wg0 public-key` on the server)
- NexRAD API reachable from the public internet on `API_BASE_URL` (MikroTik calls back to this URL)

---

## Task 4.0 — Config & DB Migration

### Add to `packages/api/src/config.ts` — extend `wg` section:

The existing `wg` block in config.ts (from Sprint 0) needs two new fields. Add them inside the `wg` object:

```typescript
wg: {
  interface:       process.env.WG_INTERFACE        || 'wg0',
  configPath:      process.env.WG_CONFIG_PATH      || '/etc/wireguard/wg0.conf',
  serverIp:        process.env.WG_SERVER_IP        || '10.8.0.1',
  subnet:          process.env.WG_SUBNET           || '10.8.0.0/24',
  endpoint:        process.env.WG_SERVER_ENDPOINT  || '',
  port:            Number(process.env.WG_PORT)     || 51820,
  serverPublicKey: process.env.WG_SERVER_PUBLIC_KEY || '',  // ADD THIS
},
apiBaseUrl: process.env.API_BASE_URL || `http://${process.env.WG_SERVER_ENDPOINT || 'localhost'}`,  // ADD THIS (top-level)
```

### Add to `.env.example`:

```
WG_SERVER_PUBLIC_KEY=        # wg show wg0 public-key on the server
API_BASE_URL=http://173.212.195.88  # NexRAD API base URL reachable from MikroTik
```

### Create `packages/api/src/db/migrations/004_branch_provisioning.sql`:

```sql
-- Add provisioning columns to nx_branches
ALTER TABLE nx_branches
  ADD COLUMN IF NOT EXISTS radius_secret VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reg_token     VARCHAR(64) NULL DEFAULT NULL;
```

### Run the migration:

```bash
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
  < packages/api/src/db/migrations/004_branch_provisioning.sql
```

---

## Task 4.1 — WireGuard Service (API)

### `packages/api/src/modules/wireguard/wg.service.ts`

```typescript
import { execSync } from 'child_process'
import { appendFileSync } from 'fs'
import { query } from '../../db/mysql.js'
import { config } from '../../config.js'

export interface WgActivePeer {
  publicKey: string
  endpoint: string | null
  lastHandshake: string | null
  rxBytes: number
  txBytes: number
  allowedIps: string
}

/**
 * Assign the next available tunnel IP in the WireGuard subnet.
 * Reserves 10.8.0.1 for server, starts allocating from 10.8.0.2.
 */
export async function allocateTunnelIp(): Promise<string> {
  const [subnetBase] = config.wg.subnet.split('/')
  const parts = subnetBase.split('.').map(Number)

  const existing = await query<{ tunnel_ip: string }>(
    'SELECT tunnel_ip FROM nx_branches WHERE tunnel_ip IS NOT NULL ORDER BY tunnel_ip'
  )
  const usedLast = new Set(existing.map((r) => Number(r.tunnel_ip.split('.')[3])))

  for (let i = 2; i < 254; i++) {
    if (!usedLast.has(i)) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.${i}`
    }
  }
  throw new Error('No tunnel IPs available in subnet')
}

/**
 * Build the [Peer] stanza to append to /etc/wireguard/wg0.conf on the server.
 * No Endpoint= — MikroTik initiates the tunnel (supports Starlink/dynamic IP).
 * No PresharedKey — matches deployment guide and keeps the provisioning script simple.
 */
export function buildServerPeerStanza(opts: {
  publicKey: string
  tunnelIp: string
  branchName: string
}): string {
  return `
# Branch: ${opts.branchName}
[Peer]
PublicKey = ${opts.publicKey}
AllowedIPs = ${opts.tunnelIp}/32
PersistentKeepalive = 25
`
}

/**
 * Add a peer to the live WireGuard interface without restarting it.
 * Also appends the stanza to wg0.conf so it survives a server reboot.
 */
export async function addWgPeer(opts: {
  publicKey: string
  tunnelIp: string
  branchName: string
}): Promise<void> {
  // Add to live interface
  execSync(
    `wg set ${config.wg.interface} peer ${opts.publicKey} allowed-ips ${opts.tunnelIp}/32 persistent-keepalive 25`
  )

  // Persist to conf file
  const stanza = buildServerPeerStanza(opts)
  appendFileSync(config.wg.configPath, stanza, 'utf8')
}

/**
 * Remove a peer from the live WireGuard interface.
 * Does NOT edit wg0.conf — the stanza stays in conf but is harmless once the peer is gone.
 * To clean the conf file, redeploy or edit manually.
 */
export function removeWgPeer(publicKey: string): void {
  try {
    execSync(`wg set ${config.wg.interface} peer ${publicKey} remove`)
  } catch {
    // peer may not exist in live interface — non-fatal
  }
}

/**
 * Parse `wg show <iface> dump` output into structured peer data.
 */
export function parseWgDump(dump: string): WgActivePeer[] {
  const lines = dump.trim().split('\n').slice(1) // skip server's own line
  return lines
    .filter((l) => l.trim())
    .map((line) => {
      const [pubkey, , endpoint, allowedIps, lastHandshake, rxBytes, txBytes] = line.split('\t')
      return {
        publicKey: pubkey,
        endpoint: endpoint === '(none)' ? null : endpoint,
        lastHandshake:
          !lastHandshake || lastHandshake === '0'
            ? null
            : new Date(Number(lastHandshake) * 1000).toISOString(),
        rxBytes: Number(rxBytes ?? 0),
        txBytes: Number(txBytes ?? 0),
        allowedIps,
      }
    })
}

export function getWgStatus(): WgActivePeer[] {
  try {
    const dump = execSync(`wg show ${config.wg.interface} dump 2>/dev/null`).toString()
    return parseWgDump(dump)
  } catch {
    return []
  }
}

export function getServerPublicKey(): string {
  try {
    return execSync(`wg show ${config.wg.interface} public-key 2>/dev/null`).toString().trim()
  } catch {
    return config.wg.serverPublicKey
  }
}

/**
 * Build a complete MikroTik RouterOS provisioning script (.rsc).
 *
 * The script is imported via WinBox (drag-drop to Files → /import filename.rsc).
 * The MikroTik generates its own WireGuard keypair — the private key never leaves the device.
 * At the end the script POSTs the public key back to NexRAD to complete peer registration.
 *
 * The script handles both PATH A (blank slate, e.g. after Netinstall) and
 * PATH B (existing bridge, e.g. after /system reset-configuration skip-backup=yes).
 */
export function buildRouterOSScript(opts: {
  branchShortname: string
  branchName: string
  tunnelIp: string // e.g. 10.8.0.2
  radiusSecret: string
  serverPublicKey: string
  serverEndpoint: string // e.g. 173.212.195.88
  serverPort: number // 51820
  serverRadiusIp: string // e.g. 10.8.0.1
  registrationToken: string
  apiBaseUrl: string // e.g. http://173.212.195.88
}): string {
  const {
    branchShortname,
    branchName,
    tunnelIp,
    radiusSecret,
    serverPublicKey,
    serverEndpoint,
    serverPort,
    serverRadiusIp,
    registrationToken,
    apiBaseUrl,
  } = opts

  return `# =============================================================
# NexRAD RouterOS Provisioning Script
# Branch : ${branchName}
# Tunnel : ${tunnelIp}
# Generated by NexRAD — import via WinBox Files tab
# =============================================================
#
# BEFORE IMPORTING:
#   1. Plug Starlink into ether1
#   2. Connect your laptop to ether2 (or any non-ether1 port)
#   3. Factory reset if previously used:
#      /system reset-configuration skip-backup=yes
#      Wait 3 min, reconnect via WinBox Neighbors tab
#   4. Drag this file to WinBox Files panel
#   5. In terminal: /import ${branchShortname}-provision.rsc
#
# You will lose WinBox briefly when your port joins the hotspot bridge.
# WinBox Neighbors tab will find the router again at 10.10.10.1.
# =============================================================

# 1 — Router Identity
/system identity set name="${branchShortname}"

# 2 — WiFi (2.4GHz, open network — captive portal controls access)
/interface wireless set wlan1 \\
  mode=ap-bridge \\
  ssid="ZimSmartVillages" \\
  band=2ghz-b/g/n \\
  channel-width=20/40mhz-Ce \\
  frequency=auto \\
  country=zimbabwe \\
  installation=indoor \\
  disabled=no
/interface wireless security-profiles set [ find default=yes ] mode=none authentication-types=""
/interface wireless set wlan1 security-profile=default

# 3 — Bridge, IP, DHCP
#     Set up bridge-hotspot with DHCP BEFORE moving any ports.
#     This ensures your laptop gets an IP on 10.10.10.x after the brief disconnect.
/interface bridge add name=bridge-hotspot comment="Hotspot Network"
/ip address add address=10.10.10.1/24 interface=bridge-hotspot comment="Hotspot Gateway"
/ip pool add name=hotspot-pool ranges=10.10.10.10-10.10.10.254
/ip dhcp-server network add \\
  address=10.10.10.0/24 gateway=10.10.10.1 dns-server=1.1.1.1,8.8.8.8
/ip dhcp-server add \\
  name=hotspot-dhcp interface=bridge-hotspot address-pool=hotspot-pool \\
  disabled=no lease-time=1h

# Add wlan1 first (no disconnect)
/interface bridge port add interface=wlan1 bridge=bridge-hotspot

# Move ether2-5 from any existing bridge to bridge-hotspot
# (Brief WinBox disconnect when your port moves — reconnect via Neighbors tab)
:foreach i in={2;3;4;5} do={
  :local ifname ("ether" . $i)
  :do { /interface bridge port remove [find interface=$ifname] } on-error={}
  :do { /interface bridge port add interface=$ifname bridge=bridge-hotspot } on-error={}
}

# Remove old bridges and stale config (errors are safe to ignore)
:do { /interface bridge remove [find name!=bridge-hotspot] } on-error={}
:do { /ip address remove [find interface=bridge] } on-error={}
:do { /ip address remove [find interface=bridge1] } on-error={}
:do { /ip address remove [find invalid] } on-error={}
:do { /ip dhcp-server remove [find interface!=bridge-hotspot] } on-error={}
:do { /ip dhcp-client remove [find interface=bridge] } on-error={}
:do { /ip dhcp-client remove [find interface=bridge1] } on-error={}

# 4 — Internet via Starlink on ether1
:if ([:len [/ip dhcp-client find interface=ether1]] = 0) do={
  /ip dhcp-client add interface=ether1 disabled=no \\
    use-peer-dns=yes use-peer-ntp=yes add-default-route=yes comment="Starlink WAN"
}

# 5 — Firewall & NAT
#     IMPORTANT: rules are order-sensitive. Drop rules MUST come last.
/ip firewall filter remove [find]
/ip firewall nat remove [find]
/ip firewall mangle remove [find]

/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade \\
  comment="Masquerade to WAN"
/ip firewall filter add chain=input connection-state=established,related action=accept \\
  comment="Allow established input"
/ip firewall filter add chain=input protocol=icmp action=accept \\
  comment="Allow ICMP"
/ip firewall filter add chain=input in-interface=bridge-hotspot action=accept \\
  comment="Allow from LAN"
/ip firewall filter add chain=forward connection-state=established,related \\
  action=fasttrack-connection comment="FastTrack for speed"
/ip firewall filter add chain=forward connection-state=established,related action=accept \\
  comment="Allow established forward"
/ip firewall filter add chain=forward in-interface=bridge-hotspot out-interface=ether1 \\
  action=accept comment="Hotspot to Internet"
/ip firewall filter add chain=forward connection-state=invalid action=drop \\
  comment="Drop invalid"
/ip firewall filter add chain=input action=drop \\
  comment="Drop all other input"
/ip firewall mangle add chain=forward protocol=tcp tcp-flags=syn \\
  action=change-mss new-mss=1340 comment="Optimize VPN MTU"

# 6 — Hotspot (Persistent Sessions)
#     login-by MUST include cookie for persistent sessions.
#     html-directory="" uses RouterOS built-in pages (avoids 404 on clean installs).
/ip hotspot profile add \\
  name=custom-hotspot \\
  login-by=http-pap,cookie \\
  use-radius=yes \\
  radius-accounting=yes \\
  radius-interim-update=5m \\
  html-directory="" \\
  http-proxy=0.0.0.0:0
/ip hotspot user profile add \\
  name=default-hotspot \\
  shared-users=unlimited \\
  rate-limit="" \\
  keepalive-timeout=none \\
  idle-timeout=none \\
  session-timeout=0 \\
  transparent-proxy=no \\
  add-mac-cookie=yes
/ip hotspot add \\
  name=hotspot1 \\
  interface=bridge-hotspot \\
  address-pool=hotspot-pool \\
  profile=custom-hotspot \\
  addresses-per-mac=2 \\
  keepalive-timeout=none \\
  idle-timeout=none
/ip hotspot enable hotspot1

# 7 — WireGuard VPN
#     RouterOS generates its own keypair here — private key never leaves this device.
/interface wireguard add name=wg-radius listen-port=51821 mtu=1380
/ip address add address=${tunnelIp}/24 interface=wg-radius comment="WireGuard VPN"
/interface wireguard peers add \\
  interface=wg-radius \\
  comment="RADIUS Server" \\
  public-key="${serverPublicKey}" \\
  endpoint-address=${serverEndpoint} \\
  endpoint-port=${serverPort} \\
  allowed-address=${serverRadiusIp}/32 \\
  persistent-keepalive=25s

# 8 — RADIUS (authenticates over WireGuard tunnel)
/radius add \\
  address=${serverRadiusIp} \\
  secret=${radiusSecret} \\
  service=hotspot,login \\
  timeout=3s \\
  comment="RADIUS via WireGuard"

# 9 — Clock & NTP
/system clock set time-zone-name=Africa/Harare
/system ntp client set enabled=yes servers=pool.ntp.org

# 10 — Security hardening
#      WinBox is left unrestricted (0.0.0.0/0) because the firewall drop rule
#      already blocks it from the internet. Restricting by IP breaks Neighbors tab.
/ip service set telnet disabled=yes
/ip service set ftp disabled=yes
/ip service set www address=10.10.10.0/24,10.8.0.0/24
/ip service set ssh address=10.10.10.0/24,10.8.0.0/24
/ip service set winbox address=0.0.0.0/0
/ip service set api disabled=yes
/ip service set api-ssl disabled=yes
/ip neighbor discovery-settings set discover-interface-list=none
/tool mac-server set allowed-interface-list=none
/tool mac-server mac-winbox set allowed-interface-list=none
/interface list add name=LAN-only comment="Local management only"
/interface list member add interface=bridge-hotspot list=LAN-only
/tool mac-server set allowed-interface-list=LAN-only
/tool mac-server mac-winbox set allowed-interface-list=LAN-only

# 11 — Self-register WireGuard public key with NexRAD
#      This call activates the WireGuard peer on the server automatically.
#      On error: the public key is printed — give it to the NexRAD admin manually.
:delay 5s
:local wgPubKey [/interface wireguard get wg-radius public-key]
:local regBody ("{\"token\":\"${registrationToken}\",\"publicKey\":\"" . $wgPubKey . "\"}")
:put ""
:put ">>> Registering WireGuard peer with NexRAD..."
:do {
  /tool fetch \\
    url="${apiBaseUrl}/api/branches/register-peer" \\
    http-method=post \\
    http-header-field="Content-Type: application/json" \\
    http-data=$regBody \\
    output=user \\
    duration=15s
  :put ">>> Peer registered. WireGuard tunnel activating."
} on-error={
  :put ">>> Auto-registration failed (check internet on ether1)."
  :put ">>> Give this public key to your NexRAD admin to activate manually:"
  :put $wgPubKey
  :put ">>> Manual activation: NexRAD → Branches → Activate → paste key above"
}

# 12 — Clear stale connections and save backup
/ip firewall connection remove [find]
/system backup save name=${branchShortname}-initial

:put ""
:put "=== NexRAD provisioning complete for ${branchName} ==="
:put "WiFi: ZimSmartVillages is broadcasting"
:put "VPN : tunnel to ${serverEndpoint} activating (allow 30s)"
:put "Test: connect phone to ZimSmartVillages, open http://google.com"
`
}
```

---

## Task 4.2 — Branch Service (API)

### `packages/api/src/modules/branches/branch.service.ts`

```typescript
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
    FROM nx_branches
    WHERE org_id = ?
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
    FROM nx_branches
    WHERE id = ? AND org_id = ?
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

  const branchId = (result as any).insertId

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
    'SELECT reg_token FROM nx_branches WHERE id = ?',
    [branch.id]
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
  const branch = await queryOne<Branch & { reg_token: string; id: number; org_id: number }>(
    `SELECT id, org_id AS orgId, name, shortname, tunnel_ip AS tunnelIp,
            wg_pubkey AS wgPubkey, radius_secret AS radiusSecret, reg_token
     FROM nx_branches WHERE reg_token = ?`,
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
  await query(`UPDATE nx_branches SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`, values)
  return getBranch(orgId, id)
}

export async function deleteBranch(orgId: number, id: number): Promise<void> {
  const branch = await getBranch(orgId, id)
  if (!branch) return

  if (branch.wgPubkey) removeWgPeer(branch.wgPubkey)

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
  listBranches,
  getBranch,
  createBranch,
  updateBranch,
  deleteBranch,
  getProvisionScript,
  activateBranch,
  registerPeer,
} from './branch.service.js'
import { getWgStatus } from '../wireguard/wg.service.js'

const CreateBranchSchema = z.object({
  name: z.string().min(2).max(100),
  shortname: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/),
  location: z.string().max(255).optional(),
})

const UpdateBranchSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  location: z.string().max(255).optional(),
  isActive: z.boolean().optional(),
})

const ActivateSchema = z.object({
  wgPubkey: z.string().min(40).max(50),
})

const RegisterPeerSchema = z.object({
  token: z.string().length(64),
  publicKey: z.string().min(40).max(50),
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
  app.post('/branches', { preHandler: requireRole('orgadmin') }, async (req, reply) => {
    const body = CreateBranchSchema.parse(req.body)
    const branch = await createBranch({ ...body, orgId: req.user!.orgId })
    return reply.status(201).send(branch)
  })

  // Update branch (orgadmin+)
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

  // Delete branch (orgadmin+)
  app.delete<{ Params: { id: string } }>(
    '/branches/:id',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      await deleteBranch(req.user!.orgId, Number(req.params.id))
      return reply.status(204).send()
    }
  )

  // Download RouterOS provisioning script (.rsc)
  app.get<{ Params: { id: string } }>(
    '/branches/:id/provision/script',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      const branch = await getBranch(req.user!.orgId, Number(req.params.id))
      if (!branch) return reply.status(404).send({ error: 'Branch not found' })

      let script: string
      try {
        script = await getProvisionScript(branch)
      } catch (e: any) {
        return reply.status(400).send({ error: e.message })
      }

      const filename = `${branch.shortname}-provision.rsc`
      return reply
        .header('Content-Type', 'text/plain; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(script)
    }
  )

  // Manual activation fallback — admin pastes public key when auto-registration fails
  app.post<{ Params: { id: string } }>(
    '/branches/:id/activate',
    { preHandler: requireRole('orgadmin') },
    async (req, reply) => {
      const { wgPubkey } = ActivateSchema.parse(req.body)
      try {
        const branch = await activateBranch(req.user!.orgId, Number(req.params.id), wgPubkey)
        return branch
      } catch (e: any) {
        return reply.status(e.statusCode ?? 500).send({ error: e.message })
      }
    }
  )

  // Self-registration endpoint — called by MikroTik RouterOS script via /tool fetch.
  // No authentication required (token IS the auth — it's a 256-bit random secret).
  // Rate-limited to 10 req/min in production (add fastify-rate-limit if available).
  app.post('/branches/register-peer', { config: { skipAuth: true } }, async (req, reply) => {
    const { token, publicKey } = RegisterPeerSchema.parse(req.body)
    try {
      const branch = await registerPeer(token, publicKey)
      return reply.status(200).send({ ok: true, branchName: branch.name })
    } catch (e: any) {
      return reply.status(e.statusCode ?? 500).send({ error: e.message })
    }
  })

  // WireGuard live peer status (superadmin/orgadmin)
  app.get('/branches/wireguard/status', { preHandler: requireRole('orgadmin') }, async () => {
    const peers = getWgStatus()
    return { peers }
  })
}
```

> **Note on `skipAuth`**: The `/branches/register-peer` route has `config: { skipAuth: true }`.
> Ensure the `authenticate` hook in `auth.middleware.ts` checks `req.routeOptions?.config?.skipAuth`
> and returns early when true, so unauthenticated MikroTik callbacks are accepted.

### Register in `packages/api/src/app.ts`:

```typescript
import { branchRoutes } from './modules/branches/branch.routes.js'
// inside buildApp, alongside other route registrations:
await app.register(branchRoutes, { prefix: '/api' })
```

### Update `authenticate` hook in `packages/api/src/modules/auth/auth.middleware.ts`:

Add this check at the top of the `authenticate` function body, before the JWT validation:

```typescript
export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  // Allow routes that explicitly opt out (e.g. register-peer callback)
  if ((req.routeOptions as any)?.config?.skipAuth) return

  // ... existing JWT validation logic ...
}
```

---

## Task 4.4 — Frontend: Branches Page

### `packages/web/src/pages/Branches.tsx`

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/lib/toast'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Plus,
  Download,
  Key,
  Copy,
  Check,
  Wifi,
  WifiOff,
  Clock,
  Trash2,
  ShieldAlert,
} from 'lucide-react'
import type { Branch } from '@nexrad/shared'

export default function Branches() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [provision, setProvision] = useState<Branch | null>(null)
  const [activating, setActivating] = useState<Branch | null>(null)

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<Branch[]>('/branches').then((r) => r.data),
    refetchInterval: 15_000,
  })

  const columns = [
    { key: 'name', header: 'Branch Name' },
    { key: 'shortname', header: 'Shortname' },
    {
      key: 'tunnelIp',
      header: 'Tunnel IP',
      cell: (row: Branch) => <span className="font-mono text-sm">{row.tunnelIp ?? '—'}</span>,
    },
    {
      key: 'location',
      header: 'Location',
      cell: (row: Branch) => row.location ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'wgPubkey',
      header: 'WireGuard',
      cell: (row: Branch) => {
        if (!row.wgPubkey) {
          return (
            <button
              className="flex items-center gap-1 text-warning text-sm hover:underline"
              onClick={() => setActivating(row)}
            >
              <ShieldAlert className="h-4 w-4" /> Pending activation
            </button>
          )
        }
        return (
          <span className="flex items-center gap-1 text-success text-sm">
            <Wifi className="h-4 w-4" />
            <span className="font-mono text-xs">{row.wgPubkey.slice(0, 10)}…</span>
          </span>
        )
      },
    },
    {
      key: 'isActive',
      header: 'Status',
      cell: (row: Branch) =>
        row.isActive ? (
          <span className="badge-online">Active</span>
        ) : (
          <span className="badge-offline">Inactive</span>
        ),
    },
    {
      key: 'id',
      header: '',
      cell: (row: Branch) => (
        <div className="flex gap-2 justify-end">
          {!row.wgPubkey && (
            <Button variant="outline" size="sm" onClick={() => setProvision(row)}>
              <Download className="h-3.5 w-3.5 mr-1" /> Script
            </Button>
          )}
          <DeleteButton
            branch={row}
            onDeleted={() => qc.invalidateQueries({ queryKey: ['branches'] })}
          />
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
        columns={columns}
        rowKey={(row) => row.id}
        loading={isLoading}
        emptyText="No branches yet. Add your first branch to get started."
      />

      <AddBranchDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={(branch) => {
          qc.invalidateQueries({ queryKey: ['branches'] })
          setShowAdd(false)
          setProvision(branch)
        }}
      />

      {provision && <ProvisionDialog branch={provision} onClose={() => setProvision(null)} />}

      {activating && (
        <ActivateDialog
          branch={activating}
          onActivated={() => {
            qc.invalidateQueries({ queryKey: ['branches'] })
            setActivating(null)
          }}
          onClose={() => setActivating(null)}
        />
      )}
    </div>
  )
}

// ── Add Branch Dialog ──────────────────────────────────────────────────────────

function AddBranchDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (branch: Branch) => void
}) {
  const [form, setForm] = useState({ name: '', shortname: '', location: '' })
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (data: typeof form) => api.post<Branch>('/branches', data).then((r) => r.data),
    onSuccess: (branch) => {
      setForm({ name: '', shortname: '', location: '' })
      onCreated(branch)
    },
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
          <p className="text-xs text-muted-foreground border-t border-border pt-3">
            NexRAD will assign a tunnel IP and generate a RADIUS secret automatically. After
            creation, download the RouterOS provisioning script.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate(form)}
              disabled={mutation.isPending || !form.name || !form.shortname}
            >
              {mutation.isPending ? 'Creating…' : 'Create Branch'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Provision Dialog ───────────────────────────────────────────────────────────

function ProvisionDialog({ branch, onClose }: { branch: Branch; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  const downloadScript = async () => {
    try {
      const res = await api.get(`/branches/${branch.id}/provision/script`, {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `${branch.shortname}-provision.rsc`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download script')
    }
  }

  const copySecret = () => {
    navigator.clipboard.writeText(branch.radiusSecret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Provision — {branch.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Assigned values */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="kpi-card py-3">
              <p className="text-xs text-muted-foreground">Tunnel IP</p>
              <p className="font-mono font-semibold mt-1">{branch.tunnelIp}</p>
            </div>
            <div className="kpi-card py-3">
              <p className="text-xs text-muted-foreground">RADIUS Secret</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="font-mono font-semibold">
                  {showSecret ? branch.radiusSecret : '••••••••••••'}
                </p>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setShowSecret((v) => !v)}
                >
                  <Key className="h-3.5 w-3.5" />
                </button>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={copySecret}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-muted rounded-lg p-3 text-sm space-y-1.5">
            <p className="font-semibold">Deployment steps:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Download the RouterOS script below</li>
              <li>
                Factory reset the MikroTik:
                <br />
                <code className="text-xs bg-background px-1 rounded">
                  /system reset-configuration skip-backup=yes
                </code>
              </li>
              <li>Reconnect via WinBox Neighbors tab</li>
              <li>
                Drag the <code className="text-xs bg-background px-1 rounded">.rsc</code> file into
                WinBox Files panel
              </li>
              <li>
                In terminal:{' '}
                <code className="text-xs bg-background px-1 rounded">
                  /import {branch.shortname}-provision.rsc
                </code>
              </li>
              <li>Wait ~60s — the router self-registers and goes live</li>
            </ol>
          </div>

          <p className="text-xs text-muted-foreground">
            The script self-registers the WireGuard key automatically. If the callback fails (e.g.
            no internet on ether1 yet), use the "Activate manually" button on the Branches page and
            paste the public key shown in the WinBox terminal.
          </p>

          <Button onClick={downloadScript} className="w-full">
            <Download className="h-4 w-4 mr-2" /> Download RouterOS Script (.rsc)
          </Button>
          <Button variant="outline" onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Activate Dialog (manual fallback) ─────────────────────────────────────────

function ActivateDialog({
  branch,
  onActivated,
  onClose,
}: {
  branch: Branch
  onActivated: () => void
  onClose: () => void
}) {
  const [pubkey, setPubkey] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => api.post(`/branches/${branch.id}/activate`, { wgPubkey: pubkey.trim() }),
    onSuccess: () => {
      toast.success('Branch activated')
      onActivated()
    },
    onError: (e: any) => setError(e.response?.data?.error ?? 'Activation failed'),
  })

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Activate — {branch.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Auto-registration failed. Run the provisioning script on the MikroTik and copy the
            public key printed at the end of the terminal output.
          </p>
          <div>
            <Label htmlFor="pubkey">WireGuard Public Key</Label>
            <Input
              id="pubkey"
              placeholder="LKMStk1/IpcOy/codwE9dqkAaqzajock..."
              value={pubkey}
              onChange={(e) => setPubkey(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || pubkey.trim().length < 40}
            >
              {mutation.isPending ? 'Activating…' : 'Activate Branch'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Delete Button ──────────────────────────────────────────────────────────────

function DeleteButton({ branch, onDeleted }: { branch: Branch; onDeleted: () => void }) {
  const [open, setOpen] = useState(false)

  const mutation = useMutation({
    mutationFn: () => api.delete(`/branches/${branch.id}`),
    onSuccess: () => {
      toast.success(`Branch "${branch.name}" deleted`)
      onDeleted()
    },
    onError: () => toast.error('Failed to delete branch'),
  })

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
      <ConfirmDialog
        open={open}
        title={`Delete "${branch.name}"?`}
        description="This removes the WireGuard peer and RADIUS NAS entry. The router will stop authenticating users."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          mutation.mutate()
          setOpen(false)
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
```

---

## Task 4.5 — React Query

> `@tanstack/react-query` is already installed from Sprint 0 setup. Only add `QueryClientProvider` if it is not already in `main.tsx` — do NOT remove the existing `BrowserRouter` or Sonner `Toaster`.

### `packages/web/src/lib/query.ts`

```typescript
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})
```

### `packages/web/src/main.tsx` — ensure this structure (do not duplicate providers):

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import App from './App'
import './index.css'
import { queryClient } from './lib/query'
import { useUi } from './stores/ui.store'

function ThemedToaster() {
  const { theme } = useUi()
  return (
    <Toaster
      theme={theme === 'system' ? 'system' : theme}
      richColors
      position="top-right"
      closeButton
      toastOptions={{ duration: 4000 }}
      expand={false}
    />
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <ThemedToaster />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
```

---

## Task 4.6 — Sidebar Nav & Route

> Branches is already in the Sidebar nav items (added during Sprint 2 design system). Skip sidebar edits.

### Update `packages/web/src/App.tsx` — add route:

```tsx
import Branches from './pages/Branches'
// inside <Routes>:
;<Route path="/branches" element={<Branches />} />
```

---

## Task 4.7 — WireGuard Status Page

### `packages/web/src/pages/WireGuardStatus.tsx`

```tsx
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { formatBytes } from '@/lib/utils'
import type { Branch } from '@nexrad/shared'

interface WgPeer {
  publicKey: string
  endpoint: string | null
  lastHandshake: string | null
  rxBytes: number
  txBytes: number
  allowedIps: string
}

export default function WireGuardStatus() {
  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['wg-status'],
    queryFn: () => api.get<{ peers: WgPeer[] }>('/branches/wireguard/status').then((r) => r.data),
    refetchInterval: 15_000,
  })

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<Branch[]>('/branches').then((r) => r.data),
  })

  // Build map: tunnelIp → branch name for display
  const branchByTunnelIp = Object.fromEntries(
    branches.map((b) => [b.tunnelIp?.replace('/32', '') ?? '', b.name])
  )

  const peers = statusData?.peers ?? []

  const columns = [
    {
      key: 'allowedIps',
      header: 'Branch',
      cell: (row: WgPeer) => {
        const ip = row.allowedIps.replace('/32', '')
        const name = branchByTunnelIp[ip]
        return (
          <div>
            <p className="font-medium text-sm">{name ?? 'Unknown'}</p>
            <p className="font-mono text-xs text-muted-foreground">{ip}</p>
          </div>
        )
      },
    },
    {
      key: 'lastHandshake',
      header: 'Status',
      cell: (row: WgPeer) => {
        if (!row.lastHandshake) return <span className="badge-offline">Never connected</span>
        const minutesAgo = (Date.now() - new Date(row.lastHandshake).getTime()) / 60000
        const label = minutesAgo < 2 ? 'Online now' : `${Math.round(minutesAgo)}m ago`
        const cls =
          minutesAgo < 5 ? 'badge-online' : minutesAgo < 60 ? 'badge-warning' : 'badge-offline'
        return <span className={cls}>{label}</span>
      },
    },
    {
      key: 'endpoint',
      header: 'Real IP',
      cell: (row: WgPeer) =>
        row.endpoint ? (
          <span className="font-mono text-xs">{row.endpoint}</span>
        ) : (
          <span className="text-muted-foreground text-sm">Not connected</span>
        ),
    },
    { key: 'rxBytes', header: 'Received', cell: (row: WgPeer) => formatBytes(row.rxBytes) },
    { key: 'txBytes', header: 'Sent', cell: (row: WgPeer) => formatBytes(row.txBytes) },
    {
      key: 'publicKey',
      header: 'Public Key',
      cell: (row: WgPeer) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.publicKey.slice(0, 12)}…
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="WireGuard Status"
        subtitle="Live peer connection status — refreshes every 15s"
      />
      <DataTable
        data={peers}
        columns={columns}
        rowKey={(row) => row.publicKey}
        loading={statusLoading}
        emptyText="No WireGuard peers. Is wg0 running on the server?"
      />
    </div>
  )
}
```

---

## Task 4.8 — Shared Types

### `packages/shared/src/types/branch.types.ts`

```typescript
export type BranchStatus = 'online' | 'recent' | 'inactive' | 'pending'

export interface Branch {
  id: number
  orgId: number
  nasIp: string
  shortname: string
  name: string
  location: string | null
  wgPubkey: string | null // null until MikroTik self-registers
  tunnelIp: string | null
  radiusSecret: string // shown in the Provision dialog
  isActive: boolean
  createdAt: string
  updatedAt: string
  status?: BranchStatus
  activeSessions?: number
}

export interface CreateBranchDto {
  name: string
  shortname: string
  location?: string
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
  let branchId: number

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
    if (branchId) {
      await app.inject({
        method: 'DELETE',
        url: `/api/branches/${branchId}`,
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

  it('POST /api/branches creates branch with tunnel IP and RADIUS secret', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/branches',
      headers: { authorization: `Bearer ${token}` },
      body: { name: 'Test Branch', shortname: 'test-branch', location: 'Test Location' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.name).toBe('Test Branch')
    expect(body.tunnelIp).toMatch(/^10\.8\.0\.\d+$/)
    expect(body.radiusSecret).toBeTruthy()
    expect(body.radiusSecret.length).toBeGreaterThanOrEqual(20)
    expect(body.wgPubkey).toBeNull() // null until MikroTik registers
    branchId = body.id
  })

  it('GET /api/branches/:id returns the branch', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/branches/${branchId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('Test Branch')
  })

  it('PATCH /api/branches/:id updates location', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/branches/${branchId}`,
      headers: { authorization: `Bearer ${token}` },
      body: { location: 'Updated Location' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().location).toBe('Updated Location')
  })

  it('GET /api/branches/:id/provision/script returns .rsc content when WG_SERVER_ENDPOINT is set', async () => {
    // Only runs if env is configured — skip gracefully in CI without server creds
    if (!process.env.WG_SERVER_ENDPOINT || !process.env.WG_SERVER_PUBLIC_KEY) {
      console.log('Skipping provision/script test — WG env vars not set')
      return
    }
    const res = await app.inject({
      method: 'GET',
      url: `/api/branches/${branchId}/provision/script`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-disposition']).toContain('.rsc')
    expect(res.body).toContain('/interface wireguard add name=wg-radius')
    expect(res.body).toContain('/radius add')
    expect(res.body).toContain('register-peer')
  })

  it('POST /branches/register-peer rejects invalid token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/branches/register-peer',
      body: {
        token: 'a'.repeat(64),
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      },
    })
    expect(res.statusCode).toBe(403)
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
- [ ] Migration `004_branch_provisioning.sql` ran — `nx_branches` has `radius_secret` and `reg_token` columns
- [ ] `GET /api/branches` returns array with valid JWT
- [ ] `POST /api/branches` returns 201 with `tunnelIp`, `radiusSecret` set and `wgPubkey: null`
- [ ] Two branches created have sequential tunnel IPs (e.g. `10.8.0.2`, `10.8.0.3`)
- [ ] `GET /api/branches/:id/provision/script` returns a `.rsc` file download (requires `WG_SERVER_ENDPOINT` + `WG_SERVER_PUBLIC_KEY`)
- [ ] Downloaded `.rsc` file contains: `/interface wireguard add name=wg-radius`, `/radius add`, `register-peer`, the branch's tunnel IP, and the RADIUS secret
- [ ] `POST /api/branches/register-peer` with invalid token returns 403
- [ ] Branches page renders — table shows branches with tunnel IPs
- [ ] "Add Branch" dialog creates a branch and immediately opens the Provision dialog
- [ ] Provision dialog shows tunnel IP, masked RADIUS secret with copy/reveal buttons, download button
- [ ] Download button fetches and saves `.rsc` file to disk
- [ ] "Pending activation" badge shows on unregistered branches; clicking opens Activate dialog
- [ ] Activate dialog POSTs to `/activate` and updates the branch row on success
- [ ] Deleting a branch shows ConfirmDialog, then removes the row
- [ ] WireGuard Status page loads without errors
- [ ] `pnpm build` succeeds
- [ ] `pnpm docker:dev` starts cleanly

**CI must be green before Sprint 5 begins.**

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

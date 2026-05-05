import { useLiveStats } from '@/hooks/useLiveStats'
import { useLiveSessions, type LiveSession } from '@/hooks/useLiveSessions'
import { StatCard } from '@/components/shared/StatCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { formatCurrency, formatBytes, formatDuration } from '@/lib/utils'
import { Users, Wifi, DollarSign, Ticket, TrendingUp, Activity } from 'lucide-react'

export default function Dashboard() {
  const { global, branches, loading, lastUpdated } = useLiveStats()
  const { sessions, loading: sessionsLoading } = useLiveSessions()

  const sessionColumns = [
    { key: 'username', header: 'Username' },
    {
      key: 'nasipaddress',
      header: 'Branch',
      cell: (row: LiveSession) => {
        const branch = branches.find((b) => b.nasIp === row.nasipaddress)
        return branch?.name ?? row.nasipaddress
      },
    },
    { key: 'framedipaddress', header: 'IP Address' },
    {
      key: 'acctstarttime',
      header: 'Connected',
      cell: (row: LiveSession) => new Date(row.acctstarttime).toLocaleTimeString(),
    },
    {
      key: 'acctsessiontime',
      header: 'Duration',
      cell: (row: LiveSession) => formatDuration(row.acctsessiontime),
    },
    {
      key: 'acctinputoctets',
      header: 'Down',
      cell: (row: LiveSession) => formatBytes(row.acctinputoctets),
    },
    {
      key: 'acctoutputoctets',
      header: 'Up',
      cell: (row: LiveSession) => formatBytes(row.acctoutputoctets),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Dashboard"
        subtitle={
          lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : 'Connecting...'
        }
        actions={
          <span className="flex items-center gap-1.5 text-sm text-success">
            <span className="live-dot" />
            Live
          </span>
        }
      />

      {/* Global KPI Cards */}
      <div className="kpi-grid">
        <StatCard
          label="Active Sessions"
          value={global?.activeSessions ?? 0}
          icon={Wifi}
          colour="green"
          loading={loading}
        />
        <StatCard
          label="Sessions Today"
          value={global?.todaySessions ?? 0}
          icon={Activity}
          colour="blue"
          loading={loading}
        />
        <StatCard
          label="Revenue Today"
          value={formatCurrency(global?.realizedRevenueToday ?? 0)}
          icon={DollarSign}
          colour="amber"
          loading={loading}
        />
        <StatCard
          label="Unique Users"
          value={global?.uniqueUsersToday ?? 0}
          icon={Users}
          colour="default"
          loading={loading}
        />
        <StatCard
          label="Tokens Used"
          value={global?.usedTokens ?? 0}
          icon={Ticket}
          colour="default"
          loading={loading}
        />
        <StatCard
          label="Tokens Available"
          value={global?.unusedTokens ?? 0}
          icon={TrendingUp}
          colour="default"
          loading={loading}
        />
      </div>

      {/* Branch Status Cards */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Branch Status
        </h2>
        {loading ? (
          <div className="card-grid">
            {[1, 2, 3].map((i) => (
              <div key={i} className="kpi-card animate-pulse h-28 bg-muted/30" />
            ))}
          </div>
        ) : branches.length === 0 ? (
          <p className="text-muted-foreground text-sm">No branches configured.</p>
        ) : (
          <div className="card-grid">
            {branches.map((branch) => (
              <BranchCard key={branch.nasIp} branch={branch} />
            ))}
          </div>
        )}
      </section>

      {/* Live Sessions Table */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Live Sessions ({sessions.length})
        </h2>
        <DataTable
          data={sessions}
          columns={sessionColumns}
          rowKey={(row) => row.username}
          loading={sessionsLoading}
          emptyText="No active sessions right now."
        />
      </section>
    </div>
  )
}

interface BranchCardProps {
  branch: {
    nasIp: string
    name: string
    shortname: string
    activeSessions: number
    todaySessions: number
    realizedRevenue: number
    status: 'online' | 'recent' | 'inactive'
    lastSeen: string | null
  }
}

function BranchCard({ branch }: BranchCardProps) {
  const statusClass = {
    online: 'badge-online',
    recent: 'badge-warning',
    inactive: 'badge-offline',
  }[branch.status]

  const statusLabel = {
    online: 'Online',
    recent: 'Recent',
    inactive: 'Inactive',
  }[branch.status]

  return (
    <div className="kpi-card group hover:shadow-md transition-shadow cursor-default">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-foreground">{branch.name}</p>
          <p className="text-xs text-muted-foreground">{branch.nasIp}</p>
        </div>
        <span className={statusClass}>{statusLabel}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-bold text-foreground">{branch.activeSessions}</p>
          <p className="text-xs text-muted-foreground">Live</p>
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">{branch.todaySessions}</p>
          <p className="text-xs text-muted-foreground">Today</p>
        </div>
        <div>
          <p className="text-lg font-bold text-success">{formatCurrency(branch.realizedRevenue)}</p>
          <p className="text-xs text-muted-foreground">Revenue</p>
        </div>
      </div>
      {branch.lastSeen && (
        <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
          Last seen: {new Date(branch.lastSeen).toLocaleTimeString()}
        </p>
      )}
    </div>
  )
}

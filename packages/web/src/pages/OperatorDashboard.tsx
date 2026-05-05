import { useLiveStats } from '@/hooks/useLiveStats'
import { useLiveSessions } from '@/hooks/useLiveSessions'
import { useAuth } from '@/stores/auth.store'
import { Wifi, Users, DollarSign, Zap } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { Link } from 'react-router-dom'

export default function OperatorDashboard() {
  const user = useAuth((s) => s.user)
  const { global, branches, loading } = useLiveStats()
  const { sessions } = useLiveSessions()

  // Find this operator's branch
  const myBranch = branches.find((b) => b.nasIp === user?.branchIp)

  const stats = myBranch ?? {
    activeSessions: global?.activeSessions ?? 0,
    todaySessions: global?.todaySessions ?? 0,
    realizedRevenue: global?.realizedRevenueToday ?? 0,
    name: 'All Branches',
    status: 'online' as const,
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary px-4 py-5">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-white font-bold text-xl">NexRAD</h1>
            <p className="text-primary-foreground/70 text-sm mt-0.5">
              {myBranch?.name ?? 'Branch Dashboard'}
            </p>
          </div>
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              stats.status === 'online'
                ? 'bg-green-500/20 text-green-200'
                : 'bg-yellow-500/20 text-yellow-200'
            }`}
          >
            {stats.status}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Big active sessions number */}
        <div className="rounded-2xl bg-card border border-border p-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-3">
            <Wifi className="h-8 w-8 text-primary" />
          </div>
          <p className="text-6xl font-bold text-foreground">
            {loading ? '—' : stats.activeSessions}
          </p>
          <p className="text-muted-foreground text-sm mt-2">Active Sessions Right Now</p>
          {sessions.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Last connected: {sessions[0]?.username}
            </p>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-card border border-border p-4 text-center">
            <Users className="h-6 w-6 text-info mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">
              {loading ? '—' : stats.todaySessions}
            </p>
            <p className="text-xs text-muted-foreground">Sessions Today</p>
          </div>
          <div className="rounded-xl bg-card border border-border p-4 text-center">
            <DollarSign className="h-6 w-6 text-success mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">
              {loading ? '—' : formatCurrency(stats.realizedRevenue)}
            </p>
            <p className="text-xs text-muted-foreground">Revenue Today</p>
          </div>
        </div>

        {/* Quick Token CTA */}
        <Link
          to="/quick"
          className="flex items-center justify-between rounded-2xl bg-primary p-5 text-white hover:bg-primary/90 transition-colors"
        >
          <div>
            <p className="font-bold text-lg">Quick Token</p>
            <p className="text-primary-foreground/70 text-sm">Generate & share in seconds</p>
          </div>
          <div className="p-3 bg-white/10 rounded-xl">
            <Zap className="h-7 w-7" />
          </div>
        </Link>

        {/* Recent sessions mini-list */}
        {sessions.length > 0 && (
          <div className="rounded-xl bg-card border border-border">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold text-foreground">Active Sessions</p>
            </div>
            <div className="divide-y divide-border">
              {sessions.slice(0, 5).map((s) => (
                <div key={s.username} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-mono font-semibold">{s.username}</p>
                    <p className="text-xs text-muted-foreground">{s.framedipaddress}</p>
                  </div>
                  <span className="badge-online text-xs">Live</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

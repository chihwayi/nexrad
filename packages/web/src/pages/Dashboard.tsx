import { Activity, Wifi, Ticket, DollarSign } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { InlineAlert } from '@/components/shared/AlertBanner'
import { Badge } from '@/components/ui/badge'

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Live overview across all branches"
        badge={<span className="live-dot" />}
        actions={
          <Badge variant="success" className="gap-1">
            <span className="live-dot w-1.5 h-1.5" />
            Live
          </Badge>
        }
      />

      <InlineAlert
        variant="info"
        title="Sprint 3 wires up live data"
        message="KPI cards will auto-refresh every 10 seconds via WebSocket once the API is connected."
        dismissible
      />

      <div className="kpi-grid">
        <StatCard label="Live Sessions"    value={0}  colour="green"  icon={Activity}    sub="Right now" />
        <StatCard label="Active Branches"  value={0}  colour="blue"   icon={Wifi}        sub="Online" />
        <StatCard label="Tokens Used"      value={0}  colour="purple" icon={Ticket}      sub="This month" />
        <StatCard label="Realized Revenue" value="$0" colour="green"  icon={DollarSign}  sub="USD" />
      </div>
    </div>
  )
}

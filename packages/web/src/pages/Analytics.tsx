import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { Input } from '@/components/ui/input'
import { formatBytes } from '@/lib/utils'

function getDefaultDates() {
  const now = new Date()
  const past = new Date(now)
  past.setDate(past.getDate() - 29)
  return {
    dateFrom: past.toISOString().split('T')[0],
    dateTo: now.toISOString().split('T')[0],
  }
}

export default function Analytics() {
  const defaults = getDefaultDates()
  const [dates, setDates] = useState(defaults)

  const { data = [], isLoading } = useQuery({
    queryKey: ['session-analytics', dates],
    queryFn: () => api.get('/reports/sessions', { params: dates }).then((r) => r.data as any[]),
  })

  const totalSessions = data.reduce((s, d) => s + Number(d.sessions), 0)
  const totalData = data.reduce((s, d) => s + Number(d.totalInputMb) + Number(d.totalOutputMb), 0)
  const avgUsers = data.length
    ? Math.round(data.reduce((s, d) => s + Number(d.uniqueUsers), 0) / data.length)
    : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Session Analytics"
        subtitle="Traffic, usage trends, and data consumption"
      />

      <div className="flex gap-3 items-center">
        <Input
          type="date"
          className="w-40"
          value={dates.dateFrom}
          onChange={(e) => setDates((d) => ({ ...d, dateFrom: e.target.value }))}
        />
        <span className="text-muted-foreground text-sm">to</span>
        <Input
          type="date"
          className="w-40"
          value={dates.dateTo}
          onChange={(e) => setDates((d) => ({ ...d, dateTo: e.target.value }))}
        />
      </div>

      <div className="kpi-grid">
        <StatCard label="Total Sessions" value={totalSessions} colour="blue" loading={isLoading} />
        <StatCard label="Avg Users/Day" value={avgUsers} colour="default" loading={isLoading} />
        <StatCard
          label="Total Data"
          value={formatBytes(totalData * 1048576)}
          colour="green"
          loading={isLoading}
        />
      </div>

      {/* Sessions chart */}
      <div className="kpi-card">
        <h3 className="text-sm font-semibold text-foreground mb-4">Daily Sessions</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Area
              type="monotone"
              dataKey="sessions"
              stroke="hsl(var(--primary))"
              fill="url(#sessGrad)"
              strokeWidth={2}
              name="Sessions"
            />
            <Area
              type="monotone"
              dataKey="uniqueUsers"
              stroke="hsl(var(--success))"
              fill="none"
              strokeWidth={2}
              strokeDasharray="4 2"
              name="Unique Users"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Data usage chart */}
      <div className="kpi-card">
        <h3 className="text-sm font-semibold text-foreground mb-4">Data Usage (MB/day)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(v: number) => `${v.toFixed(1)} MB`}
            />
            <Legend />
            <Bar
              dataKey="totalInputMb"
              name="Download (MB)"
              fill="hsl(var(--primary))"
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="totalOutputMb"
              name="Upload (MB)"
              fill="hsl(var(--success))"
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

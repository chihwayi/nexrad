import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label:    string
  value:    string | number
  sub?:     string
  icon?:    LucideIcon
  colour?:  'default' | 'green' | 'amber' | 'red' | 'blue' | 'purple'
  trend?:   { value: number; label: string }
  loading?: boolean
}

const colourMap: Record<NonNullable<StatCardProps['colour']>, string> = {
  default: 'border-t-border',
  green:   'border-t-success',
  amber:   'border-t-warning',
  red:     'border-t-danger',
  blue:    'border-t-info',
  purple:  'border-t-purple-500',
}

const iconBgMap: Record<NonNullable<StatCardProps['colour']>, string> = {
  default: 'bg-muted text-muted-foreground',
  green:   'bg-success/10 text-success',
  amber:   'bg-warning/10 text-warning',
  red:     'bg-danger/10 text-danger',
  blue:    'bg-info/10 text-info',
  purple:  'bg-purple-500/10 text-purple-500',
}

export function StatCard({ label, value, sub, icon: Icon, colour = 'default', trend, loading }: StatCardProps) {
  return (
    <div className={cn('kpi-card border-t-4', colourMap[colour])}>
      <div className="flex items-start justify-between">
        <p className="kpi-label">{label}</p>
        {Icon && (
          <div className={cn('p-2 rounded-lg flex-shrink-0', iconBgMap[colour])}>
            <Icon size={16} />
          </div>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-9 w-24 mt-2" />
      ) : (
        <p className="kpi-value">{value}</p>
      )}

      {(sub || trend) && (
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {sub && <p className="kpi-sub">{sub}</p>}
          {trend && !loading && (
            <span className={cn(
              'text-xs font-medium',
              trend.value >= 0 ? 'text-success' : 'text-danger'
            )}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

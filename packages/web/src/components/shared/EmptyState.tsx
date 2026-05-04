import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon:    LucideIcon
  title:   string
  message: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
        <Icon size={28} className="text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}

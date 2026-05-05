import { useState } from 'react'
import { AlertTriangle, CheckCircle, Info, XCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AlertBannerProps {
  variant: 'info' | 'success' | 'warning' | 'error'
  title?: string
  message: string
  onDismiss?: () => void
  action?: { label: string; onClick: () => void }
  className?: string
}

const config = {
  info: { icon: Info, bg: 'bg-info/8 border-info/30', text: 'text-info', iconClass: 'text-info' },
  success: {
    icon: CheckCircle,
    bg: 'bg-success/8 border-success/30',
    text: 'text-success',
    iconClass: 'text-success',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-warning/8 border-warning/30',
    text: 'text-warning',
    iconClass: 'text-warning',
  },
  error: {
    icon: XCircle,
    bg: 'bg-danger/8 border-danger/30',
    text: 'text-danger',
    iconClass: 'text-danger',
  },
}

export function AlertBanner({
  variant,
  title,
  message,
  onDismiss,
  action,
  className,
}: AlertBannerProps) {
  const { icon: Icon, bg, text, iconClass } = config[variant]

  return (
    <div className={cn('flex items-start gap-3 rounded-xl border px-4 py-3', bg, className)}>
      <Icon size={17} className={cn('flex-shrink-0 mt-0.5', iconClass)} />
      <div className="flex-1 min-w-0">
        {title && <p className={cn('text-sm font-semibold', text)}>{title}</p>}
        <p className={cn('text-sm', title ? 'text-foreground/80 mt-0.5' : text)}>{message}</p>
        {action && (
          <button
            onClick={action.onClick}
            className={cn(
              'text-xs font-semibold underline underline-offset-2 mt-1.5 hover:no-underline transition-all',
              text
            )}
          >
            {action.label}
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDismissibleAlert(initialVisible = true) {
  const [visible, setVisible] = useState(initialVisible)
  return { visible, dismiss: () => setVisible(false) }
}

interface InlineAlertProps extends Omit<AlertBannerProps, 'onDismiss'> {
  dismissible?: boolean
}

export function InlineAlert({ dismissible, ...props }: InlineAlertProps) {
  const { visible, dismiss } = useDismissibleAlert(true)
  if (!visible) return null
  return <AlertBanner {...props} onDismiss={dismissible ? dismiss : undefined} />
}

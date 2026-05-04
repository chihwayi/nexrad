import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  open:           boolean
  onOpenChange:   (open: boolean) => void
  title:          string
  description:    string
  variant?:       'default' | 'destructive'
  confirmLabel?:  string
  cancelLabel?:   string
  onConfirm:      () => void | Promise<void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  variant = 'default',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center mb-3',
            variant === 'destructive' ? 'bg-danger/10' : 'bg-primary/10'
          )}>
            {variant === 'destructive'
              ? <AlertTriangle size={20} className="text-danger" />
              : <Info size={20} className="text-primary" />
            }
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

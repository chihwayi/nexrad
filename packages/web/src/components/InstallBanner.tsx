import { usePwaInstall } from '@/hooks/usePwaInstall'
import { Button } from '@/components/ui/button'
import { Download, X } from 'lucide-react'
import { useState } from 'react'

export function InstallBanner() {
  const { canInstall, install } = usePwaInstall()
  const [dismissed, setDismissed] = useState(false)

  if (!canInstall || dismissed) return null

  return (
    <div
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50
                    bg-card border border-border rounded-xl shadow-lg p-4 flex items-center gap-3"
    >
      <div className="p-2 bg-primary/10 rounded-lg shrink-0">
        <Download className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">Install NexRAD</p>
        <p className="text-xs text-muted-foreground">Add to home screen for quick access</p>
      </div>
      <div className="flex gap-1 shrink-0">
        <Button size="sm" onClick={install}>
          Install
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

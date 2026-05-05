import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })

  if (!needRefresh) return null

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50
                    bg-card border border-border rounded-xl shadow-lg px-4 py-3
                    flex items-center gap-3 text-sm whitespace-nowrap"
    >
      <p className="text-foreground">New version available</p>
      <Button size="sm" onClick={() => updateServiceWorker(true)}>
        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
        Update
      </Button>
    </div>
  )
}

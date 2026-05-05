import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { WifiOff } from 'lucide-react'

export function OfflineBanner() {
  const isOnline = useNetworkStatus()
  if (isOnline) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground
                    text-sm text-center py-2 flex items-center justify-center gap-2"
    >
      <WifiOff className="h-4 w-4" />
      You are offline — some features may be unavailable
    </div>
  )
}

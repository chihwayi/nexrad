import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MessageCircle, Printer, Copy, Check, Zap } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/stores/auth.store'

interface Plan {
  id: number
  name: string
  displayName: string | null
  cost: number
  currency: string
}

export default function QuickToken() {
  const user = useAuth((s) => s.user)
  const [planId, setPlanId] = useState('')
  const [result, setResult] = useState<{
    username: string
    planName: string
    cost: number
    currency: string
  } | null>(null)
  const [copied, setCopied] = useState(false)

  const { data: plans = [] } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get<Plan[]>('/plans').then((r) => r.data),
  })

  const mutation = useMutation({
    mutationFn: () =>
      api
        .post('/tokens/generate', {
          planId: Number(planId),
          count: 1,
        })
        .then((r) => r.data),
    onSuccess: (data) => {
      const plan = plans.find((p) => String(p.id) === planId)
      setResult({
        username: data.tokens[0],
        planName: plan?.name ?? 'Voucher',
        cost: plan?.cost ?? 0,
        currency: plan?.currency ?? 'USD',
      })
    },
  })

  const copyToClipboard = () => {
    if (!result) return
    navigator.clipboard.writeText(result.username)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareWhatsApp = () => {
    if (!result) return
    const text = encodeURIComponent(
      `🌐 WiFi Access Voucher\n\nUsername: ${result.username}\nPassword: ${result.username}\nPlan: ${result.planName} (${result.currency} ${result.cost})\n\nConnect to WiFi and enter these credentials at the portal.`
    )
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  const reset = () => {
    setResult(null)
    setCopied(false)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-primary px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-lg">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg">Quick Token</h1>
            <p className="text-primary-foreground/70 text-xs">Generate & share in seconds</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4 max-w-md mx-auto w-full">
        {!result ? (
          // Step 1: Select plan and generate
          <div className="space-y-4 pt-4">
            <div>
              <Label className="mb-2 block">Select Plan</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger className="h-14 text-base">
                  <SelectValue placeholder="Choose a WiFi plan..." />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      <div className="flex justify-between items-center gap-4 w-full">
                        <span>{p.displayName ?? p.name}</span>
                        <span className="text-muted-foreground font-mono">
                          {p.currency} {p.cost.toFixed(2)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full h-14 text-base font-semibold"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !planId}
            >
              {mutation.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                  Generating...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Generate Token
                </span>
              )}
            </Button>

            {mutation.isError && (
              <p className="text-sm text-destructive text-center">
                Failed to generate token. Try again.
              </p>
            )}

            <p className="text-xs text-muted-foreground text-center pt-2">
              Logged in as <strong>{user?.username}</strong>
            </p>
          </div>
        ) : (
          // Step 2: Show generated token with share options
          <div className="space-y-4 pt-4">
            {/* Token card */}
            <div className="rounded-2xl border-2 border-primary/30 bg-card p-6 text-center space-y-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  {result.planName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {result.currency} {result.cost.toFixed(2)}
                </p>
              </div>

              <div className="bg-muted rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">USERNAME & PASSWORD</p>
                <p className="text-3xl font-bold font-mono text-foreground tracking-widest">
                  {result.username}
                </p>
              </div>

              <p className="text-xs text-muted-foreground">
                Use this as both username and password at the WiFi login portal
              </p>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-14 flex-col gap-1 text-xs"
                onClick={copyToClipboard}
              >
                {copied ? <Check className="h-5 w-5 text-success" /> : <Copy className="h-5 w-5" />}
                {copied ? 'Copied!' : 'Copy Token'}
              </Button>

              <Button
                className="h-14 flex-col gap-1 text-xs bg-green-600 hover:bg-green-700"
                onClick={shareWhatsApp}
              >
                <MessageCircle className="h-5 w-5" />
                WhatsApp
              </Button>
            </div>

            <Button variant="outline" className="w-full h-12" onClick={reset}>
              Generate Another Token
            </Button>

            <Button
              variant="ghost"
              className="w-full text-xs text-muted-foreground"
              onClick={() => window.open('/api/vouchers/pdf?status=unused&limit=10', '_blank')}
            >
              <Printer className="h-4 w-4 mr-2" />
              Print Last 10 Unused
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

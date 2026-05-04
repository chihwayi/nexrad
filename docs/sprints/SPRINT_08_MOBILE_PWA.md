# Sprint 8 — Mobile PWA & Operator Experience
**Duration:** 3 days | **Goal:** Progressive Web App setup, mobile-optimized operator views, offline indicators, install prompt, push notification groundwork, and a streamlined "quick token" flow for branch operators.

> After this sprint: a branch operator can install NexRAD on their phone from the browser, generate and share a token in under 30 seconds, and see branch stats without navigating complex menus.

---

## Prerequisites
- Sprint 0–7 sign-off checklists all ✓
- `vite-plugin-pwa` already in package.json (installed in Sprint 0 setup)
- Vite config has PWA plugin stub from Sprint 0

---

## Task 8.1 — PWA Manifest & Service Worker Configuration

### Update `packages/web/vite.config.ts` — complete PWA config:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'NexRAD — WiFi Management',
        short_name: 'NexRAD',
        description: 'Modern RADIUS management — tokens, branches, reports',
        theme_color: '#6366f1',
        background_color: '#0f0f13',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        categories: ['productivity', 'utilities'],
        shortcuts: [
          {
            name: 'Generate Token',
            url: '/tokens?action=generate',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Live Dashboard',
            url: '/dashboard',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/stats\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-stats',
              expiration: { maxAgeSeconds: 60, maxEntries: 10 },
            },
          },
          {
            urlPattern: /^https?:\/\/.*\/api\/plans/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-plans',
              expiration: { maxAgeSeconds: 3600, maxEntries: 20 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@nexrad/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
```

---

## Task 8.2 — App Icons (Placeholder)

### Create icon files (use any 192×192 and 512×512 PNG for dev):
```bash
mkdir -p packages/web/public/icons

# Use a simple placeholder — replace with real icons before launch
# Create a minimal SVG-based icon programmatically, or use a favicon generator
# For now, generate solid indigo squares as placeholder icons:
cat > packages/web/public/icons/create-icons.sh << 'EOF'
#!/bin/bash
# Requires ImageMagick: brew install imagemagick
convert -size 192x192 xc:#6366f1 -fill white -font Helvetica-Bold \
  -pointsize 72 -gravity center -annotate 0 'NX' icon-192.png
convert -size 512x512 xc:#6366f1 -fill white -font Helvetica-Bold \
  -pointsize 180 -gravity center -annotate 0 'NX' icon-512.png
echo "Icons created."
EOF
chmod +x packages/web/public/icons/create-icons.sh
# Run: cd packages/web/public/icons && bash create-icons.sh
# OR copy any 192px and 512px PNG files named icon-192.png and icon-512.png
```

> **Note for AI agent:** If ImageMagick is not available, copy any PNG file as `icon-192.png` and `icon-512.png` in `packages/web/public/icons/`. The PWA will still work. Real icons are a launch requirement (Sprint 10).

---

## Task 8.3 — PWA Install Prompt Component

### `packages/web/src/hooks/usePwaInstall.ts`
```typescript
import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function usePwaInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      setIsInstalled(true)
      setInstallPrompt(null)
    }
  }

  return { canInstall: !!installPrompt && !isInstalled, isInstalled, install }
}
```

### `packages/web/src/components/InstallBanner.tsx`
```tsx
import { usePwaInstall } from '../hooks/usePwaInstall'
import { Button } from './ui/button'
import { Download, X } from 'lucide-react'
import { useState } from 'react'

export function InstallBanner() {
  const { canInstall, install } = usePwaInstall()
  const [dismissed, setDismissed] = useState(false)

  if (!canInstall || dismissed) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50
                    bg-card border border-border rounded-xl shadow-lg p-4 flex items-center gap-3">
      <div className="p-2 bg-primary/10 rounded-lg shrink-0">
        <Download className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">Install NexRAD</p>
        <p className="text-xs text-muted-foreground">Add to home screen for quick access</p>
      </div>
      <div className="flex gap-1 shrink-0">
        <Button size="sm" onClick={install}>Install</Button>
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
```

### Add `<InstallBanner />` to `packages/web/src/components/AppShell.tsx`:
```tsx
import { InstallBanner } from './InstallBanner'
// Inside AppShell return, after the main content:
<InstallBanner />
```

---

## Task 8.4 — Network Status Indicator

### `packages/web/src/hooks/useNetworkStatus.ts`
```typescript
import { useState, useEffect } from 'react'

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
```

### `packages/web/src/components/OfflineBanner.tsx`
```tsx
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { WifiOff } from 'lucide-react'

export function OfflineBanner() {
  const isOnline = useNetworkStatus()
  if (isOnline) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground
                    text-sm text-center py-2 flex items-center justify-center gap-2">
      <WifiOff className="h-4 w-4" />
      You are offline — some features may be unavailable
    </div>
  )
}
```

### Add to AppShell above everything else:
```tsx
import { OfflineBanner } from './OfflineBanner'
// First element inside AppShell return:
<OfflineBanner />
```

---

## Task 8.5 — Mobile-Optimized Quick Token Page

> This is a simplified token generation flow designed for operators on mobile. Fewer taps = faster service at the branch counter.

### `packages/web/src/pages/QuickToken.tsx`
```tsx
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Button } from '../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { MessageCircle, Printer, Copy, Check, Zap } from 'lucide-react'
import { useAuthStore } from '../stores/auth.store'

interface Plan { id: number; name: string; displayName: string | null; cost: number; currency: string }

export default function QuickToken() {
  const user = useAuthStore((s) => s.user)
  const [planId, setPlanId] = useState('')
  const [result, setResult] = useState<{ username: string; planName: string; cost: number; currency: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const { data: plans = [] } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get<Plan[]>('/plans').then((r) => r.data),
  })

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/tokens/generate', {
        planId: Number(planId),
        count: 1,
      }).then((r) => r.data),
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
              <label className="text-sm font-medium text-foreground mb-2 block">
                Select Plan
              </label>
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
                {copied ? (
                  <Check className="h-5 w-5 text-success" />
                ) : (
                  <Copy className="h-5 w-5" />
                )}
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

            <Button
              variant="outline"
              className="w-full h-12"
              onClick={reset}
            >
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
```

---

## Task 8.6 — Mobile-Optimized Branch Operator Dashboard

> Simplified dashboard for operators — large touch targets, single most important stat front and center.

### `packages/web/src/pages/OperatorDashboard.tsx`
```tsx
import { useLiveStats } from '../hooks/useLiveStats'
import { useLiveSessions } from '../hooks/useLiveSessions'
import { useAuthStore } from '../stores/auth.store'
import { Wifi, Users, DollarSign, Zap } from 'lucide-react'
import { formatCurrency } from '../lib/utils'
import { Link } from 'react-router-dom'

export default function OperatorDashboard() {
  const user = useAuthStore((s) => s.user)
  const { global, branches, loading } = useLiveStats()
  const { sessions } = useLiveSessions()

  // Find this operator's branch
  const myBranch = branches.find((b) => b.nasIp === user?.branchIp)

  const stats = myBranch ?? {
    activeSessions: global?.activeSessions ?? 0,
    todaySessions: global?.todaySessions ?? 0,
    realizedRevenue: global?.realizedRevenueToday ?? 0,
    name: 'All Branches',
    status: 'online' as const,
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary px-4 py-5">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-white font-bold text-xl">NexRAD</h1>
            <p className="text-primary-foreground/70 text-sm mt-0.5">
              {myBranch?.name ?? 'Branch Dashboard'}
            </p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${
            stats.status === 'online'
              ? 'bg-green-500/20 text-green-200'
              : 'bg-yellow-500/20 text-yellow-200'
          }`}>
            {stats.status}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Big active sessions number */}
        <div className="rounded-2xl bg-card border border-border p-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-3">
            <Wifi className="h-8 w-8 text-primary" />
          </div>
          <p className="text-6xl font-bold text-foreground">
            {loading ? '—' : stats.activeSessions}
          </p>
          <p className="text-muted-foreground text-sm mt-2">Active Sessions Right Now</p>
          {sessions.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Last connected: {sessions[0]?.username}
            </p>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-card border border-border p-4 text-center">
            <Users className="h-6 w-6 text-info mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">
              {loading ? '—' : stats.todaySessions}
            </p>
            <p className="text-xs text-muted-foreground">Sessions Today</p>
          </div>
          <div className="rounded-xl bg-card border border-border p-4 text-center">
            <DollarSign className="h-6 w-6 text-success mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">
              {loading ? '—' : formatCurrency(stats.realizedRevenue)}
            </p>
            <p className="text-xs text-muted-foreground">Revenue Today</p>
          </div>
        </div>

        {/* Quick Token CTA */}
        <Link
          to="/quick"
          className="flex items-center justify-between rounded-2xl bg-primary p-5 text-white hover:bg-primary/90 transition-colors"
        >
          <div>
            <p className="font-bold text-lg">Quick Token</p>
            <p className="text-primary-foreground/70 text-sm">Generate & share in seconds</p>
          </div>
          <div className="p-3 bg-white/10 rounded-xl">
            <Zap className="h-7 w-7" />
          </div>
        </Link>

        {/* Recent sessions mini-list */}
        {sessions.length > 0 && (
          <div className="rounded-xl bg-card border border-border">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold text-foreground">Active Sessions</p>
            </div>
            <div className="divide-y divide-border">
              {sessions.slice(0, 5).map((s) => (
                <div key={s.username} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-mono font-semibold">{s.username}</p>
                    <p className="text-xs text-muted-foreground">{s.framedipaddress}</p>
                  </div>
                  <span className="badge-online text-xs">Live</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

---

## Task 8.7 — Role-Based Landing Page

> Operators see the simplified mobile dashboard. Admins see the full desktop dashboard.

### Update `packages/web/src/App.tsx` — smart redirect:
```tsx
import { useAuthStore } from './stores/auth.store'
import Dashboard from './pages/Dashboard'
import OperatorDashboard from './pages/OperatorDashboard'
import QuickToken from './pages/QuickToken'

function HomeLanding() {
  const user = useAuthStore((s) => s.user)
  const isMobileOperator = ['operator', 'branchmanager'].includes(user?.role ?? '')
  const isMobile = window.innerWidth < 768

  // Mobile operators get simplified view
  if (isMobileOperator && isMobile) return <OperatorDashboard />
  return <Dashboard />
}

// Inside Routes (replace the / route):
<Route path="/" element={<HomeLanding />} />
<Route path="/dashboard" element={<Dashboard />} />
<Route path="/quick" element={<QuickToken />} />
```

---

## Task 8.8 — Mobile Responsive Fixes

### Add mobile sidebar toggle to `packages/web/src/components/TopBar.tsx`:
```tsx
import { Menu } from 'lucide-react'
import { useUIStore } from '../stores/ui.store'

// Add to TopBar left side before page title:
const { sidebarOpen, setSidebarOpen } = useUIStore()

// In JSX, add before page title:
<button
  className="md:hidden p-2 rounded-lg hover:bg-muted mr-2"
  onClick={() => setSidebarOpen(!sidebarOpen)}
>
  <Menu className="h-5 w-5" />
</button>
```

### Ensure AppShell sidebar closes on mobile nav click — update `packages/web/src/components/Sidebar.tsx`:
```tsx
import { useUIStore } from '../stores/ui.store'

// In the NavLink onClick handler (for mobile):
const { setSidebarOpen } = useUIStore()

// Add to every nav link:
onClick={() => {
  if (window.innerWidth < 768) setSidebarOpen(false)
}}
```

---

## Task 8.9 — CSS: Mobile-First Utilities

### Add to `packages/web/src/index.css` — bottom of file:
```css
/* ── Mobile utilities ─────────────────────────── */
@media (max-width: 768px) {
  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }

  .card-grid {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }

  .data-table {
    font-size: 0.75rem;
  }

  .data-table th,
  .data-table td {
    padding: 0.5rem 0.75rem;
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .page-header .actions {
    width: 100%;
  }

  .page-header .actions > * {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .kpi-grid {
    grid-template-columns: 1fr;
  }
}

/* Safe area for iOS notch */
.app-shell {
  padding-bottom: env(safe-area-inset-bottom);
}
```

---

## Task 8.10 — PWA Update Notification

### `packages/web/src/components/UpdateBanner.tsx`
```tsx
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from './ui/button'
import { RefreshCw } from 'lucide-react'

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50
                    bg-card border border-border rounded-xl shadow-lg px-4 py-3
                    flex items-center gap-3 text-sm whitespace-nowrap">
      <p className="text-foreground">New version available</p>
      <Button size="sm" onClick={() => updateServiceWorker(true)}>
        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
        Update
      </Button>
    </div>
  )
}
```

### Add to AppShell:
```tsx
import { UpdateBanner } from './UpdateBanner'
// Add alongside InstallBanner:
<UpdateBanner />
```

### Add types for virtual:pwa-register — `packages/web/src/vite-env.d.ts`:
```typescript
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
```

---

## Task 8.11 — Manifest Meta Tags in index.html

### Update `packages/web/index.html`:
```html
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#6366f1" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="NexRAD" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="icon" href="/favicon.ico" />
    <title>NexRAD</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

> Create a placeholder `packages/web/public/apple-touch-icon.png` (180×180 PNG) and `favicon.ico`. Can be the same indigo square as the other icons.

---

## Task 8.12 — Integration: Quick Token in Sidebar

### Update Sidebar navItems — add at top for operators:
```typescript
{ href: '/quick', label: 'Quick Token', icon: Zap, roles: ['operator', 'branchmanager'] },
```

---

## Sprint 8 Sign-Off Checklist

Before marking Sprint 8 complete, every item must be ✓:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm build` succeeds — check `dist/` contains `sw.js` and `manifest.webmanifest`
- [ ] Open `http://localhost:5173` in Chrome mobile emulator (DevTools → Toggle device toolbar)
- [ ] In Chrome DevTools → Application → Service Workers: service worker is registered
- [ ] In Chrome DevTools → Application → Manifest: manifest loads with correct name, icons, theme_color
- [ ] "Add to Home Screen" prompt appears (or Chrome's "Install app" button in address bar)
- [ ] Install prompt banner appears in app when PWA is installable
- [ ] Disconnect network in DevTools → offline banner appears at top of page
- [ ] Reconnect → banner disappears
- [ ] Quick Token page renders in mobile view — full-screen, large touch targets
- [ ] Plan dropdown shows all active plans
- [ ] Generating a token shows the token card with copy + WhatsApp buttons
- [ ] Copy button copies token to clipboard (test with paste)
- [ ] WhatsApp button opens WhatsApp with correct pre-filled message
- [ ] "Generate Another" button resets back to plan selection
- [ ] Mobile operator role sees OperatorDashboard on small screen at `/`
- [ ] Admin role still sees full Dashboard at `/`
- [ ] Sidebar closes when nav link tapped on mobile
- [ ] `pnpm docker:dev` starts cleanly

**CI must be green before Sprint 9 begins.**

# NexRAD Ground Truth — Canonical Component & Store APIs

> **For AI assistants implementing sprints:** This document is authoritative. When sprint docs conflict with what is here, follow this document. Sprint docs may have been written before the design system was finalised.

---

## Import Paths

All web package imports use the `@/` alias. Never use relative `../` paths for cross-directory imports.

```typescript
// ✅ Correct
import { StatCard } from '@/components/shared/StatCard'
import { DataTable } from '@/components/shared/DataTable'
import { PageHeader } from '@/components/shared/PageHeader'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { AlertBanner, InlineAlert } from '@/components/shared/AlertBanner'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { useAuth } from '@/stores/auth.store'
import { useUi } from '@/stores/ui.store'
import { api } from '@/lib/api'
import { toast } from '@/lib/toast'
import { cn, formatCurrency, formatBytes, formatDuration, relativeTime } from '@/lib/utils'

// ❌ Wrong — never use relative paths across directories
import { StatCard } from '../components/StatCard'
import { useAuth } from '../stores/auth.store'
```

Within the same directory, relative imports are fine:

```typescript
import { getSocket } from './useSocket'
```

---

## Auth Store — `useAuth`

**Export name is `useAuth` (never `useAuthStore`)**

```typescript
import { useAuth } from '@/stores/auth.store'

// Shape after Sprint 2 (pre-Sprint 1 — mock only, no JWT):
interface AuthState {
  user: AuthUser | null
  login: (user: AuthUser) => void
  logout: () => void
}

// Shape after Sprint 1 (full JWT implementation):
interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

// Usage:
const { user, login, logout } = useAuth()
const user = useAuth((s) => s.user)
const accessToken = useAuth((s) => s.accessToken) // only valid after Sprint 1
```

**AuthUser type:**

```typescript
export interface AuthUser {
  id: number
  username: string
  role: UserRole
  orgId?: number
  orgSlug?: string
  branchId?: number
}
```

---

## UI Store — `useUi`

```typescript
import { useUi } from '@/stores/ui.store'

const { theme, sidebarOpen, setTheme, toggleSidebar, setSidebarOpen } = useUi()
```

---

## StatCard

**File:** `@/components/shared/StatCard`

```tsx
import { StatCard } from '@/components/shared/StatCard'
import type { LucideIcon } from 'lucide-react'
import { Wifi, Users } from 'lucide-react'

// Props:
interface StatCardProps {
  label:    string           // ← NOT "title"
  value:    string | number
  sub?:     string
  icon?:    LucideIcon       // ← component REFERENCE, NOT JSX element
  colour?:  'default' | 'green' | 'amber' | 'red' | 'blue' | 'purple'  // ← NOT "color"
  trend?:   { value: number; label: string }
  loading?: boolean
}

// ✅ Correct usage:
<StatCard label="Active Sessions" value={42} icon={Wifi} colour="green" loading={false} />

// ❌ Wrong:
<StatCard title="Active Sessions" value={42} icon={<Wifi className="h-5 w-5" />} color="success" />
```

**Colour mapping:**
| Sprint doc `color` | Correct `colour` |
|-------------------|-----------------|
| `"success"` | `"green"` |
| `"warning"` | `"amber"` |
| `"danger"` | `"red"` |
| `"info"` | `"blue"` |
| `"default"` | `"default"` |

---

## DataTable

**File:** `@/components/shared/DataTable`

```tsx
import { DataTable } from '@/components/shared/DataTable'

// Props:
interface DataTableProps<T> {
  columns:     Column<T>[]
  data:        T[]
  loading?:    boolean
  emptyText?:  string         // ← NOT "emptyMessage"
  rowKey:      (row: T) => string | number  // ← NOT "keyField"
  onRowClick?: (row: T) => void
  skeletonRows?: number
}

// Column type:
interface Column<T> {
  key:    keyof T | string
  header: string
  cell?:  (row: T) => React.ReactNode   // ← NOT "render"; receives full row object
  width?: string
  align?: 'left' | 'right' | 'center'
  hide?:  boolean
}

// ✅ Correct usage:
<DataTable
  data={branches}
  columns={[
    { key: 'name',     header: 'Branch Name' },
    { key: 'location', header: 'Location', cell: (row) => row.location ?? '—' },
    { key: 'isActive', header: 'Status',   cell: (row) => row.isActive ? 'Active' : 'Inactive' },
  ]}
  rowKey={(row) => row.id}
  loading={isLoading}
  emptyText="No branches yet."
/>

// ❌ Wrong:
<DataTable
  data={branches}
  columns={[
    { key: 'location', render: (v: string | null) => v ?? '—' },  // ← render is wrong
  ]}
  keyField="id"                                     // ← keyField is wrong
  emptyMessage="No branches yet."                  // ← emptyMessage is wrong
/>
```

---

## PageHeader

**File:** `@/components/shared/PageHeader`

```tsx
import { PageHeader } from '@/components/shared/PageHeader'

// Props:
interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  badge?: React.ReactNode
}

// ✅ Correct — prop names match sprint docs, no changes needed here
;<PageHeader
  title="Branches"
  subtitle="Manage branch locations and WireGuard VPN connections"
  actions={<Button>Add Branch</Button>}
/>
```

---

## ConfirmDialog

**File:** `@/components/shared/ConfirmDialog`

```tsx
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

// Props:
interface ConfirmDialogProps {
  open:          boolean
  onOpenChange?: (open: boolean) => void  // shadcn-style — handles close on Escape/backdrop click
  onConfirm:     () => void | Promise<void>
  onCancel?:     () => void               // explicit cancel handler (alternative to onOpenChange)
  title:         string
  description:   string
  variant?:      'default' | 'destructive'
  confirmLabel?: string
  cancelLabel?:  string
}

// ✅ Use ConfirmDialog instead of browser confirm(). Two equivalent patterns:

// Pattern A — onOpenChange (shadcn Dialog style, handles backdrop/Escape too):
const [confirmOpen, setConfirmOpen] = useState(false)
<ConfirmDialog
  open={confirmOpen}
  onOpenChange={setConfirmOpen}
  title="Delete Branch"
  description="This will permanently remove this branch and its WireGuard config."
  variant="destructive"
  confirmLabel="Delete"
  onConfirm={() => mutation.mutate()}
/>

// Pattern B — onConfirm + onCancel (more explicit, used in Sprint 4+):
const [open, setOpen] = useState(false)
<ConfirmDialog
  open={open}
  title="Delete Branch"
  description="This will permanently remove this branch and its WireGuard config."
  variant="destructive"
  confirmLabel="Delete"
  onConfirm={() => { mutation.mutate(); setOpen(false) }}
  onCancel={() => setOpen(false)}
/>
```

---

## AlertBanner & InlineAlert

**File:** `@/components/shared/AlertBanner`

```tsx
import { AlertBanner, InlineAlert, useDismissibleAlert } from '@/components/shared/AlertBanner'

// Variants: 'info' | 'success' | 'warning' | 'error'
<AlertBanner variant="warning" title="Heads up" message="Low token stock." />
<InlineAlert variant="error" message="Failed to load data." />
```

---

## Toast Notifications

**File:** `@/lib/toast`

```typescript
import { toast } from '@/lib/toast'

toast.success('Branch created successfully!')
toast.error('Failed to delete token', 'The token has active sessions.')
toast.warning('WireGuard config not saved', 'Private key will not be shown again.')
toast.info('Syncing with FreeRADIUS...')
toast.loading('Generating tokens...')
toast.promise(apiCall(), {
  loading: 'Saving...',
  success: 'Saved!',
  error: 'Failed to save.',
})
```

---

## App Router Structure

**BrowserRouter lives in `main.tsx` — do NOT add it in `App.tsx`.**

AppShell uses `<Outlet />` (React Router v6 layout route pattern). Never pass children to AppShell.

```tsx
// ✅ Correct App.tsx pattern (already established in Sprint 2)
<Routes>
  <Route path="/login" element={<Login />} />
  <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
    <Route index element={<Navigate to="/dashboard" replace />} />
    <Route path="/dashboard" element={<Suspense fallback={<Fallback />}><Dashboard /></Suspense>} />
    <Route path="/branches" element={<Suspense fallback={<Fallback />}><Branches /></Suspense>} />
    {/* add more routes here */}
  </Route>
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>

// ❌ Wrong — AppShell does not accept children
<AppShell>
  <Routes>...</Routes>
</AppShell>

// ❌ Wrong — BrowserRouter already in main.tsx
<BrowserRouter>
  <Routes>...</Routes>
</BrowserRouter>
```

---

## Branch Type (Sprint 4+)

The `Branch` type in `@nexrad/shared` does NOT have `wgClientConfig`, `wgEndpoint`, or `enableWireguard`. The correct shape is:

```typescript
export interface Branch {
  id: number
  orgId: number
  nasIp: string
  shortname: string
  name: string
  location: string | null
  wgPubkey: string | null // null until MikroTik self-registers via /register-peer
  tunnelIp: string | null
  radiusSecret: string // auto-generated per branch, shown in Provision dialog
  isActive: boolean
  createdAt: string
  updatedAt: string
  status?: 'online' | 'recent' | 'inactive' | 'pending'
  activeSessions?: number
}

export interface CreateBranchDto {
  name: string
  shortname: string
  location?: string
  // No enableWireguard — WireGuard is always enabled for every branch
}
```

**Branch provisioning model (Sprint 4):**

- `POST /api/branches` → returns `Branch` with `wgPubkey: null` and `tunnelIp` assigned
- `GET /api/branches/:id/provision/script` → streams a `.rsc` RouterOS provisioning script
- The MikroTik generates its own WireGuard keypair when the script runs (private key never leaves device)
- The script calls back `POST /api/branches/register-peer` with `{ token, publicKey }` to activate the WG peer automatically
- Manual fallback: `POST /api/branches/:id/activate` with `{ wgPubkey }` for when the callback fails

---

## QueryClient Setup (Sprint 4+)

React Query (`@tanstack/react-query`) is already installed. `QueryClientProvider` is already wired in `main.tsx`.

When sprint docs say "install @tanstack/react-query" or "update main.tsx to add QueryClientProvider" — **skip that task**. It is already done.

---

## Zustand persist config typo

Sprint 1 auth store doc has a typo: `partialise` should be `partialize`.

```typescript
// ✅ Correct:
{ name: 'nexrad-auth', partialize: (s) => ({ refreshToken: s.refreshToken, user: s.user }) }

// ❌ Wrong (typo in sprint doc):
{ name: 'nexrad-auth', partialise: (s) => ({ ... }) }
```

---

## File Locations Reference

```
packages/web/src/
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── Sidebar.tsx
│   │   └── TopBar.tsx
│   ├── shared/
│   │   ├── AlertBanner.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── DataTable.tsx
│   │   ├── EmptyState.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── PageHeader.tsx
│   │   ├── PageSkeleton.tsx
│   │   └── StatCard.tsx
│   └── ui/              ← shadcn/ui primitives (button, input, dialog, etc.)
├── hooks/               ← create here (useSocket, useLiveStats, etc.)
├── lib/
│   ├── api.ts
│   ├── toast.ts
│   └── utils.ts
├── pages/               ← one file per route
└── stores/
    ├── auth.store.ts    ← exports useAuth
    └── ui.store.ts      ← exports useUi
```

---

## CSS Design Token Classes

These Tailwind utility classes are pre-defined in `index.css`:

```
.kpi-card          — stat card container with padding and border
.kpi-grid          — responsive 2-4 column grid for stat cards
.card-grid         — responsive 1-3 column grid for branch cards
.kpi-label         — muted label text for stat cards
.page-title        — H1 page heading style
.page-subtitle     — muted subtitle below page title
.data-table        — styled table (thead/tbody/tr/th/td)
.badge-online      — green badge
.badge-offline     — red badge
.badge-warning     — amber badge
.live-dot          — pulsing green dot for live indicator
.scrollbar-thin    — thin scrollbar styling
.animate-fade-in   — fade-in animation on mount
.shadow-card       — card box shadow
```

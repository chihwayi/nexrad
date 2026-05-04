# Sprint 2 — Design System & App Shell
**Duration:** 4 days | **Goal:** Complete design system, AppShell (sidebar + topbar), all global components, dark/light theme, responsive layout. Every future page is built inside this shell.

> Design = the FIRST thing users judge. This sprint must produce a UI that looks like a proper 2025 product, not a CRUD app. Every design decision here is reused across all 80+ components in the app.

---

## Design Language — Read Before Building

### Colour Philosophy
- **Dark sidebar** always (regardless of theme) — anchors navigation
- **Light content area** in light mode, **dark content area** in dark mode
- **Indigo (#6366f1)** is the only brand accent colour — used sparingly for CTAs and active states
- **Status colours** are semantic: green = live/good, amber = warning/recent, red = error/offline, blue = info

### Typography
- Font: **Inter** (body) + **JetBrains Mono** (tokens, code)
- Scale: 2xs / xs / sm / base / lg / xl / 2xl / 3xl — nothing custom
- Weight: 400 (body) / 500 (label) / 600 (heading) / 700 (kpi value) / 800 (hero number)

### Spacing
- Use Tailwind's 4px grid exclusively — no custom pixel values
- Card padding: `p-5` (20px)
- Section gap: `gap-4` (16px)
- Page padding: `px-6 py-6`

### Component Radii
- Cards: `rounded-xl` (12px)
- Buttons: `rounded-lg` (10px)
- Badges / chips: `rounded-full`
- Inputs: `rounded-lg`

### Motion
- All transitions: 200ms ease-out
- Hover: `hover:shadow-card-hover` on cards, `hover:bg-muted/30` on rows
- Fade-in on page load: `animate-fade-in` utility class

---

## Task 2.1 — Install shadcn/ui

```bash
cd packages/web
pnpm dlx shadcn@latest init

# When prompted:
# Style: Default
# Base colour: Slate
# CSS variables: Yes
```

Then add components used across the app:

```bash
pnpm dlx shadcn@latest add button card badge input label
pnpm dlx shadcn@latest add dialog dropdown-menu select
pnpm dlx shadcn@latest add tabs tooltip separator
pnpm dlx shadcn@latest add toast switch popover
pnpm dlx shadcn@latest add avatar
```

> shadcn installs components into `src/components/ui/` — do NOT modify these files.
> Wrap them in `src/components/shared/` if you need app-specific variants.

---

## Task 2.2 — Theme Toggle (Dark / Light)

**File:** `packages/web/src/stores/ui.store.ts`

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

interface UiState {
  theme: Theme
  sidebarOpen: boolean
  setTheme: (t: Theme) => void
  toggleSidebar: () => void
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme:       'dark',
      sidebarOpen: true,
      setTheme: (theme) => {
        set({ theme })
        applyTheme(theme)
      },
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    }),
    { name: 'nexrad-ui' }
  )
)

function applyTheme(theme: Theme) {
  const root = document.documentElement
  const dark  = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', dark)
}

// Apply on load
if (typeof window !== 'undefined') {
  applyTheme(useUi.getState().theme)
}
```

---

## Task 2.3 — Shared Components

### `src/components/shared/StatCard.tsx`
```tsx
import { cn } from '@/lib/utils'
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

const colourMap = {
  default: 'border-border',
  green:   'border-success',
  amber:   'border-warning',
  red:     'border-danger',
  blue:    'border-info',
  purple:  'border-purple-500',
}

export function StatCard({ label, value, sub, icon: Icon, colour = 'default', trend, loading }: StatCardProps) {
  return (
    <div className={cn('kpi-card border-t-4', colourMap[colour])}>
      <div className="flex items-start justify-between">
        <p className="kpi-label">{label}</p>
        {Icon && (
          <div className="p-2 rounded-lg bg-muted">
            <Icon size={16} className="text-muted-foreground" />
          </div>
        )}
      </div>
      {loading ? (
        <div className="h-9 w-24 bg-muted rounded animate-pulse mt-1" />
      ) : (
        <p className="kpi-value">{value}</p>
      )}
      {(sub || trend) && (
        <div className="flex items-center gap-2 mt-1">
          {sub && <p className="kpi-sub">{sub}</p>}
          {trend && (
            <span className={cn('text-xs font-medium', trend.value >= 0 ? 'text-success' : 'text-danger')}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
```

### `src/components/shared/PageHeader.tsx`
```tsx
interface PageHeaderProps {
  title:     string
  subtitle?: string
  actions?:  React.ReactNode
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
```

### `src/components/shared/EmptyState.tsx`
```tsx
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon:    LucideIcon
  title:   string
  message: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
        <Icon size={28} className="text-muted-foreground" />
      </div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1">{message}</p>
      </div>
      {action}
    </div>
  )
}
```

### `src/components/shared/DataTable.tsx`
```tsx
import { cn } from '@/lib/utils'

interface Column<T> {
  key:      keyof T | string
  header:   string
  cell?:    (row: T) => React.ReactNode
  width?:   string
  align?:   'left' | 'right' | 'center'
}

interface DataTableProps<T> {
  columns:    Column<T>[]
  data:       T[]
  loading?:   boolean
  emptyText?: string
  rowKey:     (row: T) => string | number
}

export function DataTable<T>({ columns, data, loading, emptyText = 'No data', rowKey }: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="data-table w-full">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={String(col.key)} style={{ width: col.width }}
                  className={cn(col.align === 'right' && 'text-right', col.align === 'center' && 'text-center')}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={String(col.key)}>
                    <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr><td colSpan={columns.length} className="text-center py-10 text-muted-foreground">{emptyText}</td></tr>
          ) : (
            data.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((col) => (
                  <td key={String(col.key)}
                      className={cn(col.align === 'right' && 'text-right', col.align === 'center' && 'text-center')}>
                    {col.cell ? col.cell(row) : String((row as any)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
```

### `src/lib/utils.ts`
```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1073741824).toFixed(2)} GB`
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function relativeTime(date: string | null): string {
  if (!date) return 'Never'
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (secs < 60)   return 'Just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}
```

---

## Task 2.4 — App Shell

### `src/components/layout/AppShell.tsx`
```tsx
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useUi } from '@/stores/ui.store'
import { cn } from '@/lib/utils'

export default function AppShell() {
  const { sidebarOpen } = useUi()

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/50 lg:hidden"
             onClick={useUi.getState().toggleSidebar} />
      )}

      {/* Main content */}
      <div className={cn(
        'flex flex-col flex-1 overflow-hidden transition-all duration-200',
        sidebarOpen ? 'lg:ml-[240px]' : 'ml-0'
      )}>
        <TopBar />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="px-6 py-6 max-w-screen-2xl mx-auto animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
```

### `src/components/layout/Sidebar.tsx`
```tsx
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/stores/auth.store'
import { useUi } from '@/stores/ui.store'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, GitBranch, Ticket, Activity,
  BarChart2, Package, Users, Shield, Settings,
  LogOut, ChevronLeft, Network
} from 'lucide-react'

const navItems = [
  { href: '/dashboard',     label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/sessions',      label: 'Live Sessions', icon: Activity },
  { href: '/branches',      label: 'Branches',    icon: GitBranch },
  { href: '/tokens',        label: 'Tokens',      icon: Ticket },
  { href: '/reports',       label: 'Reports',     icon: BarChart2 },
  { href: '/plans',         label: 'Plans',       icon: Package },
  { href: '/wireguard',     label: 'WireGuard',   icon: Network },
  { href: '/users',         label: 'Users',       icon: Users },
  { href: '/organizations', label: 'Orgs',        icon: Shield, superadminOnly: true },
  { href: '/settings',      label: 'Settings',    icon: Settings },
]

export function Sidebar() {
  const { user, logout } = useAuth()
  const { sidebarOpen, toggleSidebar } = useUi()
  const navigate = useNavigate()

  const visibleNav = navItems.filter(
    (item) => !item.superadminOnly || user?.role === 'superadmin'
  )

  return (
    <aside className={cn(
      'fixed inset-y-0 left-0 z-30 flex flex-col',
      'bg-[hsl(var(--sidebar-bg))] border-r border-[hsl(var(--sidebar-border))]',
      'transition-transform duration-200',
      'w-[240px]',
      sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-16'
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-[hsl(var(--sidebar-border))]">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <span className="text-white text-sm font-black">N</span>
        </div>
        {sidebarOpen && (
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-[hsl(var(--sidebar-fg))]">NexRAD</p>
            <p className="text-2xs text-[hsl(var(--sidebar-fg)/0.5)]">{user?.orgSlug ?? 'Platform'}</p>
          </div>
        )}
        <button onClick={toggleSidebar}
                className="ml-auto p-1 rounded text-[hsl(var(--sidebar-fg)/0.5)] hover:text-[hsl(var(--sidebar-fg))] hidden lg:block">
          <ChevronLeft size={16} className={cn('transition-transform', !sidebarOpen && 'rotate-180')} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2 space-y-0.5">
        {visibleNav.map(({ href, label, icon: Icon }) => (
          <NavLink key={href} to={href}
            className={({ isActive }) => cn('nav-item', isActive && 'active')}>
            <Icon size={18} className="flex-shrink-0" />
            {sidebarOpen && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-[hsl(var(--sidebar-border))] p-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-primary text-xs font-bold uppercase">
              {user?.username?.[0]}
            </span>
          </div>
          {sidebarOpen && (
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-semibold text-[hsl(var(--sidebar-fg))] truncate">{user?.username}</p>
              <p className="text-2xs text-[hsl(var(--sidebar-fg)/0.5)] capitalize">{user?.role}</p>
            </div>
          )}
          <button onClick={() => { logout(); navigate('/login') }}
                  className="p-1.5 rounded hover:bg-[hsl(var(--sidebar-item-hover))]
                             text-[hsl(var(--sidebar-fg)/0.5)] hover:text-danger transition-colors"
                  title="Sign out">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}
```

### `src/components/layout/TopBar.tsx`
```tsx
import { Menu, Sun, Moon, Monitor, Bell } from 'lucide-react'
import { useUi } from '@/stores/ui.store'
import { useLocation } from 'react-router-dom'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

const pageTitles: Record<string, string> = {
  '/dashboard':     'Dashboard',
  '/sessions':      'Live Sessions',
  '/branches':      'Branches',
  '/tokens':        'Tokens',
  '/reports':       'Reports',
  '/plans':         'Billing Plans',
  '/wireguard':     'WireGuard',
  '/users':         'Users',
  '/organizations': 'Organizations',
  '/settings':      'Settings',
}

export function TopBar() {
  const { toggleSidebar, setTheme } = useUi()
  const location = useLocation()
  const title = pageTitles[location.pathname] ?? 'NexRAD'

  return (
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm
                       flex items-center gap-3 px-4 flex-shrink-0 sticky top-0 z-10">
      <button onClick={toggleSidebar}
              className="p-2 rounded-lg hover:bg-muted transition-colors lg:hidden">
        <Menu size={18} />
      </button>

      <h2 className="font-semibold text-sm">{title}</h2>

      <div className="ml-auto flex items-center gap-1">
        {/* Notifications (placeholder) */}
        <button className="p-2 rounded-lg hover:bg-muted transition-colors relative">
          <Bell size={17} />
        </button>

        {/* Theme selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-2 rounded-lg hover:bg-muted transition-colors">
              <Sun size={17} className="dark:hidden" />
              <Moon size={17} className="hidden dark:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme('light')}>
              <Sun size={14} className="mr-2" /> Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')}>
              <Moon size={14} className="mr-2" /> Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('system')}>
              <Monitor size={14} className="mr-2" /> System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
```

---

## Task 2.5 — Placeholder Dashboard Page

**File:** `packages/web/src/pages/Dashboard.tsx`
```tsx
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { Activity, Wifi, Ticket, DollarSign } from 'lucide-react'

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Live overview across all branches" />
      <div className="kpi-grid">
        <StatCard label="Live Sessions"    value={0}   colour="green"  icon={Activity} sub="Right now" />
        <StatCard label="Active Branches"  value={0}   colour="blue"   icon={Wifi}     sub="Online" />
        <StatCard label="Tokens Used"      value={0}   colour="purple" icon={Ticket}   sub="This month" />
        <StatCard label="Realized Revenue" value="$0"  colour="green"  icon={DollarSign} sub="USD" />
      </div>
      <p className="text-sm text-muted-foreground">
        Full dashboard implemented in Sprint 3.
      </p>
    </div>
  )
}
```

---

## Sprint 2 Sign-Off Checklist

- [ ] shadcn/ui installed and all listed components available in `src/components/ui/`
- [ ] `index.css` has all design tokens as CSS variables (light + dark)
- [ ] `tailwind.config.ts` has full colour + animation config
- [ ] Dark mode toggle works — classes applied to `<html>` root
- [ ] Theme persists across page reload
- [ ] Sidebar renders with all nav items, active item highlighted correctly
- [ ] Sidebar collapse/expand works on desktop
- [ ] Sidebar shows as overlay on mobile (<1024px)
- [ ] TopBar shows current page title
- [ ] `StatCard` renders all colour variants with loading skeleton
- [ ] `DataTable` renders data rows and empty state
- [ ] `PageHeader` renders title, subtitle, and action slot
- [ ] `EmptyState` renders icon, text, and action slot
- [ ] All animations (fade-in, pulse-dot) visible and smooth
- [ ] App scrollable on 390px screen width
- [ ] `pnpm lint && pnpm typecheck` clean
- [ ] CI green ✓

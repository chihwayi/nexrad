import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/stores/auth.store'
import { useUi } from '@/stores/ui.store'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  GitBranch,
  Ticket,
  Activity,
  BarChart2,
  Shield,
  Settings,
  LogOut,
  ChevronLeft,
  Network,
  CreditCard,
  Users2,
  ClipboardList,
  TrendingUp,
  Zap,
  Building2,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  roles?: string[]
  superadminOnly?: boolean
}

const navItems: NavItem[] = [
  { href: '/quick', label: 'Quick Token', icon: Zap, roles: ['operator', 'branchmanager'] },
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    roles: ['superadmin', 'orgadmin', 'branchmanager', 'operator', 'readonly'],
  },
  { href: '/sessions', label: 'Live Sessions', icon: Activity },
  { href: '/branches', label: 'Branches', icon: GitBranch },
  {
    href: '/tokens',
    label: 'Tokens',
    icon: Ticket,
    roles: ['superadmin', 'orgadmin', 'branchmanager', 'operator'],
  },
  {
    href: '/reports',
    label: 'Reports',
    icon: BarChart2,
    roles: ['superadmin', 'orgadmin', 'branchmanager', 'readonly'],
  },
  { href: '/analytics', label: 'Analytics', icon: TrendingUp, roles: ['superadmin', 'orgadmin'] },
  { href: '/plans', label: 'Plans', icon: CreditCard, roles: ['superadmin', 'orgadmin'] },
  { href: '/users', label: 'Users', icon: Users2, roles: ['superadmin', 'orgadmin'] },
  { href: '/audit', label: 'Audit Log', icon: ClipboardList, roles: ['superadmin', 'orgadmin'] },
  { href: '/tenants', label: 'Tenants', icon: Building2, roles: ['superadmin'] },
  { href: '/wireguard', label: 'WireGuard', icon: Network },
  { href: '/organizations', label: 'Orgs', icon: Shield, superadminOnly: true },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['superadmin', 'orgadmin'] },
]

const roleLabel: Record<string, string> = {
  superadmin: 'Super Admin',
  orgadmin: 'Org Admin',
  branchmanager: 'Branch Mgr',
  operator: 'Operator',
  readonly: 'Read Only',
}

// Separate helpers so NavLink's className fn is never inside a Tooltip asChild
function NavItemOpen({ href, label, icon: Icon, onClick }: NavItem & { onClick: () => void }) {
  return (
    <NavLink
      to={href}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'flex flex-row items-center gap-3 rounded-lg px-3 py-2 w-full',
          'text-sm font-medium transition-colors duration-150',
          'text-[hsl(var(--sidebar-fg)/0.65)]',
          'hover:bg-[hsl(var(--sidebar-item-hover))] hover:text-[hsl(var(--sidebar-fg))]',
          isActive && 'bg-[hsl(var(--sidebar-accent)/0.15)] !text-[hsl(var(--sidebar-accent))]'
        )
      }
    >
      <Icon size={18} className="flex-shrink-0" />
      <span className="truncate leading-none">{label}</span>
    </NavLink>
  )
}

function NavItemCollapsed({ href, label, icon: Icon, onClick }: NavItem & { onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* plain anchor wrapper avoids asChild + function-className conflict */}
        <NavLink
          to={href}
          onClick={onClick}
          className={({ isActive }) =>
            cn(
              'flex items-center justify-center rounded-lg p-2.5 w-full',
              'text-[hsl(var(--sidebar-fg)/0.65)] transition-colors duration-150',
              'hover:bg-[hsl(var(--sidebar-item-hover))] hover:text-[hsl(var(--sidebar-fg))]',
              isActive && 'bg-[hsl(var(--sidebar-accent)/0.15)] !text-[hsl(var(--sidebar-accent))]'
            )
          }
        >
          <Icon size={18} />
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right" className="font-medium">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function Sidebar() {
  const { user, logout } = useAuth()
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUi()
  const navigate = useNavigate()

  const visible = navItems.filter((item) => {
    if (item.superadminOnly && user?.role !== 'superadmin') return false
    if (item.roles && !item.roles.includes(user?.role ?? '')) return false
    return true
  })

  const handleNavClick = () => {
    if (window.innerWidth < 768) setSidebarOpen(false)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex flex-col',
          'bg-[hsl(var(--sidebar-bg))] border-r border-[hsl(var(--sidebar-border))]',
          'transition-all duration-200 ease-out',
          sidebarOpen ? 'w-[240px] translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-16'
        )}
      >
        {/* ── Logo row ─────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-3 h-14 border-b border-[hsl(var(--sidebar-border))] flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 shadow-md">
            <span className="text-white text-sm font-black select-none">N</span>
          </div>

          {sidebarOpen && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[hsl(var(--sidebar-fg))] leading-tight">
                NexRAD
              </p>
              <p className="text-[10px] text-[hsl(var(--sidebar-fg)/0.4)] truncate capitalize">
                {user?.orgSlug ?? 'Platform'}
              </p>
            </div>
          )}

          <button
            onClick={toggleSidebar}
            className={cn(
              'hidden lg:flex items-center justify-center rounded-md p-1 flex-shrink-0',
              'text-[hsl(var(--sidebar-fg)/0.35)] hover:text-[hsl(var(--sidebar-fg))]',
              'hover:bg-[hsl(var(--sidebar-item-hover))] transition-colors',
              !sidebarOpen && 'mx-auto'
            )}
            title={sidebarOpen ? 'Collapse' : 'Expand'}
          >
            <ChevronLeft
              size={15}
              className={cn('transition-transform duration-200', !sidebarOpen && 'rotate-180')}
            />
          </button>
        </div>

        {/* ── Navigation ───────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin py-2 px-2 space-y-0.5">
          {visible.map((item) =>
            sidebarOpen ? (
              <NavItemOpen key={item.href} {...item} onClick={handleNavClick} />
            ) : (
              <NavItemCollapsed key={item.href} {...item} onClick={handleNavClick} />
            )
          )}
        </nav>

        {/* ── User footer ──────────────────────────────────── */}
        <div className="border-t border-[hsl(var(--sidebar-border))] p-2 flex-shrink-0">
          {sidebarOpen ? (
            /* Expanded: avatar + name + logout in a row */
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                <span className="text-primary text-[10px] font-bold uppercase select-none">
                  {user?.username?.[0] ?? '?'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[hsl(var(--sidebar-fg))] truncate leading-tight">
                  {user?.username ?? 'Unknown'}
                </p>
                <p className="text-[10px] text-[hsl(var(--sidebar-fg)/0.4)] leading-tight">
                  {roleLabel[user?.role ?? ''] ?? user?.role}
                </p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleLogout}
                    className="p-1.5 rounded-md text-[hsl(var(--sidebar-fg)/0.4)] hover:text-danger hover:bg-danger/10 transition-colors flex-shrink-0"
                  >
                    <LogOut size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Sign out</TooltipContent>
              </Tooltip>
            </div>
          ) : (
            /* Collapsed: avatar + logout stacked, centered */
            <div className="flex flex-col items-center gap-1">
              <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                <span className="text-primary text-[10px] font-bold uppercase select-none">
                  {user?.username?.[0] ?? '?'}
                </span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleLogout}
                    className="p-1.5 rounded-md text-[hsl(var(--sidebar-fg)/0.4)] hover:text-danger hover:bg-danger/10 transition-colors"
                  >
                    <LogOut size={13} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Sign out</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}

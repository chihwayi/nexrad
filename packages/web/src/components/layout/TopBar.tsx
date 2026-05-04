import { Menu, Sun, Moon, Monitor, Bell } from 'lucide-react'
import { useUi } from '@/stores/ui.store'
import { useLocation } from 'react-router-dom'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const pageTitles: Record<string, string> = {
  '/dashboard':     'Dashboard',
  '/sessions':      'Live Sessions',
  '/branches':      'Branches',
  '/tokens':        'Tokens',
  '/reports':       'Reports',
  '/plans':         'Billing Plans',
  '/wireguard':     'WireGuard',
  '/audit':         'Audit Log',
  '/users':         'Users',
  '/organizations': 'Organizations',
  '/settings':      'Settings',
}

export function TopBar() {
  const { toggleSidebar, setTheme, theme } = useUi()
  const location = useLocation()
  const title = pageTitles[location.pathname] ?? 'NexRAD'

  return (
    <TooltipProvider delayDuration={400}>
      <header className={cn(
        'h-14 border-b border-border bg-card/80 backdrop-blur-sm',
        'flex items-center gap-3 px-4 flex-shrink-0 sticky top-0 z-10'
      )}>
        {/* Mobile hamburger */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-lg hover:bg-muted transition-colors lg:hidden"
              aria-label="Toggle sidebar"
            >
              <Menu size={18} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Toggle sidebar</TooltipContent>
        </Tooltip>

        {/* Page title */}
        <h2 className="font-semibold text-sm text-foreground">{title}</h2>

        <div className="ml-auto flex items-center gap-1">
          {/* Notifications (placeholder — wired up in Sprint 3) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="relative p-2 rounded-lg hover:bg-muted transition-colors">
                <Bell size={17} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Notifications</TooltipContent>
          </Tooltip>

          {/* Theme selector */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Change theme">
                    {theme === 'light' && <Sun size={17} />}
                    {theme === 'dark' && <Moon size={17} />}
                    {theme === 'system' && <Monitor size={17} />}
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Theme</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel>Appearance</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTheme('light')}>
                <Sun size={14} />
                Light
                {theme === 'light' && <span className="ml-auto text-primary text-xs">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('dark')}>
                <Moon size={14} />
                Dark
                {theme === 'dark' && <span className="ml-auto text-primary text-xs">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('system')}>
                <Monitor size={14} />
                System
                {theme === 'system' && <span className="ml-auto text-primary text-xs">✓</span>}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </TooltipProvider>
  )
}

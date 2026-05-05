import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useUi } from '@/stores/ui.store'
import { cn } from '@/lib/utils'
import { InstallBanner } from '@/components/InstallBanner'
import { OfflineBanner } from '@/components/OfflineBanner'
import { UpdateBanner } from '@/components/UpdateBanner'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'

export default function AppShell() {
  const { sidebarOpen, setSidebarOpen } = useUi()

  return (
    <div className="app-shell flex h-screen overflow-hidden bg-background">
      <OfflineBanner />
      <Sidebar />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content area */}
      <div
        className={cn(
          'flex flex-col flex-1 overflow-hidden transition-all duration-200',
          sidebarOpen ? 'lg:ml-[240px]' : 'lg:ml-16'
        )}
      >
        <TopBar />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="px-4 py-5 sm:px-6 sm:py-6 max-w-screen-2xl mx-auto animate-fade-in">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
      <InstallBanner />
      <UpdateBanner />
    </div>
  )
}

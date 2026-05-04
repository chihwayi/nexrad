import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/stores/auth.store'
import AppShell from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { PageSkeleton } from '@/components/shared/PageSkeleton'

// Lazy-loaded pages — bundle splitting per route
const Login     = lazy(() => import('@/pages/Login'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))

function Fallback() {
  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6">
      <PageSkeleton />
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { user } = useAuth()

  return (
    <ErrorBoundary>
      <Routes>
        {/* Public */}
        <Route
          path="/login"
          element={
            user
              ? <Navigate to="/dashboard" replace />
              : <Suspense fallback={<div className="min-h-screen bg-background" />}><Login /></Suspense>
          }
        />

        {/* Protected shell */}
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<Fallback />}>
                <Dashboard />
              </Suspense>
            }
          />
          {/* Placeholder routes — pages added per sprint */}
          <Route path="/sessions"      element={<PlaceholderPage title="Live Sessions"  />} />
          <Route path="/branches"      element={<PlaceholderPage title="Branches"       />} />
          <Route path="/tokens"        element={<PlaceholderPage title="Tokens"         />} />
          <Route path="/reports"       element={<PlaceholderPage title="Reports"        />} />
          <Route path="/plans"         element={<PlaceholderPage title="Billing Plans"  />} />
          <Route path="/wireguard"     element={<PlaceholderPage title="WireGuard"      />} />
          <Route path="/audit"         element={<PlaceholderPage title="Audit Log"      />} />
          <Route path="/users"         element={<PlaceholderPage title="Users"          />} />
          <Route path="/organizations" element={<PlaceholderPage title="Organizations"  />} />
          <Route path="/settings"      element={<PlaceholderPage title="Settings"       />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle mt-1">Implemented in an upcoming sprint.</p>
      </div>
      <div className="rounded-xl border border-border border-dashed bg-muted/20 flex flex-col items-center justify-center py-20 text-center space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Coming soon</p>
        <p className="text-xs text-muted-foreground/60">This page will be built in the next sprint.</p>
      </div>
    </div>
  )
}

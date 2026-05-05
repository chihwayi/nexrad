import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/stores/auth.store'
import AppShell from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { PageSkeleton } from '@/components/shared/PageSkeleton'
import { useSocket } from '@/hooks/useSocket'

const Login = lazy(() => import('@/pages/Login'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const OperatorDashboard = lazy(() => import('@/pages/OperatorDashboard'))
const Branches = lazy(() => import('@/pages/Branches'))
const WireGuardStatus = lazy(() => import('@/pages/WireGuardStatus'))
const Tokens = lazy(() => import('@/pages/Tokens'))
const QuickToken = lazy(() => import('@/pages/QuickToken'))
const Reports = lazy(() => import('@/pages/Reports'))
const Analytics = lazy(() => import('@/pages/Analytics'))
const Plans = lazy(() => import('@/pages/Plans'))
const Users = lazy(() => import('@/pages/Users'))
const AuditLog = lazy(() => import('@/pages/AuditLog'))
const Tenants = lazy(() => import('@/pages/Tenants'))
const OrgSettings = lazy(() => import('@/pages/OrgSettings'))

function Fallback() {
  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6">
      <PageSkeleton />
    </div>
  )
}

function SocketManager() {
  useSocket()
  return null
}

function HomeLanding() {
  const user = useAuth((s) => s.user)
  const isMobileOperator = ['operator', 'branchmanager'].includes(user?.role ?? '')
  const isMobile = window.innerWidth < 768

  if (isMobileOperator && isMobile) return <OperatorDashboard />
  return <Dashboard />
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return (
    <>
      <SocketManager />
      {children}
    </>
  )
}

export default function App() {
  const { user } = useAuth()

  return (
    <ErrorBoundary>
      <Routes>
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Suspense fallback={<div className="min-h-screen bg-background" />}>
                <Login />
              </Suspense>
            )
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route
            index
            element={
              <Suspense fallback={<Fallback />}>
                <HomeLanding />
              </Suspense>
            }
          />
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<Fallback />}>
                <Dashboard />
              </Suspense>
            }
          />
          <Route
            path="/branches"
            element={
              <Suspense fallback={<Fallback />}>
                <Branches />
              </Suspense>
            }
          />
          <Route
            path="/wireguard"
            element={
              <Suspense fallback={<Fallback />}>
                <WireGuardStatus />
              </Suspense>
            }
          />
          <Route
            path="/tokens"
            element={
              <Suspense fallback={<Fallback />}>
                <Tokens />
              </Suspense>
            }
          />
          <Route
            path="/quick"
            element={
              <Suspense fallback={<Fallback />}>
                <QuickToken />
              </Suspense>
            }
          />
          <Route
            path="/reports"
            element={
              <Suspense fallback={<Fallback />}>
                <Reports />
              </Suspense>
            }
          />
          <Route
            path="/analytics"
            element={
              <Suspense fallback={<Fallback />}>
                <Analytics />
              </Suspense>
            }
          />
          <Route
            path="/plans"
            element={
              <Suspense fallback={<Fallback />}>
                <Plans />
              </Suspense>
            }
          />
          <Route
            path="/users"
            element={
              <Suspense fallback={<Fallback />}>
                <Users />
              </Suspense>
            }
          />
          <Route
            path="/audit"
            element={
              <Suspense fallback={<Fallback />}>
                <AuditLog />
              </Suspense>
            }
          />
          <Route
            path="/tenants"
            element={
              <Suspense fallback={<Fallback />}>
                <Tenants />
              </Suspense>
            }
          />
          <Route
            path="/settings"
            element={
              <Suspense fallback={<Fallback />}>
                <OrgSettings />
              </Suspense>
            }
          />
          {/* Sprint 4+ routes added below here */}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InlineAlert } from '@/components/shared/AlertBanner'
import { Wifi } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username || !password) {
      setError('Please enter your username and password.')
      return
    }

    setLoading(true)
    // Placeholder — Sprint 1 wires this to POST /auth/login
    await new Promise((r) => setTimeout(r, 600))
    login({
      id: 1,
      username: username || 'admin',
      role: 'superadmin',
      orgSlug: 'zimsmartvillages',
    })
    setLoading(false)
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 animate-fade-in">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-primary mx-auto flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-white text-2xl font-black select-none">N</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold">NexRAD</h1>
            <p className="text-sm text-muted-foreground mt-1">RADIUS Management Platform</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-card space-y-4">
          <h2 className="text-base font-semibold text-center">Sign in to your account</h2>

          {error && (
            <InlineAlert variant="error" message={error} />
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Wifi size={12} />
          <span>Secured RADIUS management</span>
        </div>
      </div>
    </div>
  )
}

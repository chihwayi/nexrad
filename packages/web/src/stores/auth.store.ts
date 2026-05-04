import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserRole = 'superadmin' | 'orgadmin' | 'branchmanager' | 'operator' | 'readonly'

export interface AuthUser {
  id: number
  username: string
  role: UserRole
  orgId?: number
  orgSlug?: string
  branchId?: number
}

interface AuthState {
  user: AuthUser | null
  login: (user: AuthUser) => void
  logout: () => void
}

// Placeholder — replaced with full JWT implementation in Sprint 1
// Default mock user allows UI preview without a backend
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: {
        id: 1,
        username: 'admin',
        role: 'superadmin',
        orgSlug: 'zimsmartvillages',
      },
      login:  (user) => set({ user }),
      logout: () => set({ user: null }),
    }),
    { name: 'nexrad-auth' }
  )
)

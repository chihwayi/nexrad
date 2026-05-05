import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser } from '@nexrad/shared'
import { api } from '@/lib/api'

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,

      login: async (username, password) => {
        set({ isLoading: true })
        const res = await api.post('/auth/login', { username, password })
        const { accessToken, refreshToken, user } = res.data.data
        set({ user, accessToken, refreshToken, isLoading: false })
      },

      logout: async () => {
        const { refreshToken } = get()
        if (refreshToken) await api.post('/auth/logout', { refreshToken }).catch(() => {})
        set({ user: null, accessToken: null, refreshToken: null })
      },

      refresh: async () => {
        const { refreshToken } = get()
        if (!refreshToken) throw new Error('No refresh token')
        const res = await api.post('/auth/refresh', { refreshToken })
        set({ accessToken: res.data.data.accessToken })
      },
    }),
    {
      name: 'nexrad-auth',
      partialize: (s) => ({ refreshToken: s.refreshToken, user: s.user }),
    }
  )
)

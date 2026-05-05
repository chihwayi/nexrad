import axios from 'axios'
import { useAuth } from '@/stores/auth.store'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL + '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        await useAuth.getState().refresh()
        return api(original)
      } catch {
        useAuth.getState().logout()
      }
    }
    return Promise.reject(error)
  }
)

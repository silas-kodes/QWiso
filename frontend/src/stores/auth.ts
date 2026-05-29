import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { apiUrl, registerUnauthorizedHandler } from '../utils/api'

interface AuthState {
  isAuthenticated: boolean
  expiresAt: number | null
  login: (password: string) => Promise<boolean>
  logout: () => Promise<void>
  checkSession: () => Promise<boolean>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, _get) => ({
      isAuthenticated: false,
      expiresAt: null,

      login: async (password: string) => {
        try {
          const res = await fetch(apiUrl('/api/auth/login'), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
          })

          if (!res.ok) return false

          const contentType = res.headers.get('content-type') ?? ''
          if (!contentType.includes('application/json')) {
            console.error('[Auth] Login response was not JSON')
            return false
          }

          const data = await res.json()
          set({ isAuthenticated: true, expiresAt: data.expiresAt })
          return true
        } catch (err) {
          console.error('[Auth] Login error:', err)
          return false
        }
      },

      logout: async () => {
        try {
          await fetch(apiUrl('/api/auth/logout'), {
            method: 'POST',
            credentials: 'include',
          })
        } catch {
          // Ignore network errors on logout
        }
        set({ isAuthenticated: false, expiresAt: null })
      },

      checkSession: async () => {
        try {
          const res = await fetch(apiUrl('/api/auth/me'), {
            credentials: 'include',
          })

          if (!res.ok) {
            set({ isAuthenticated: false, expiresAt: null })
            return false
          }

          const contentType = res.headers.get('content-type') ?? ''
          if (!contentType.includes('application/json')) {
            console.error('[Auth] /api/auth/me returned non-JSON — backend may not be reachable')
            set({ isAuthenticated: false, expiresAt: null })
            return false
          }

          const data = await res.json()
          if (data.authenticated) {
            set({ isAuthenticated: true })
            return true
          } else {
            set({ isAuthenticated: false, expiresAt: null })
            return false
          }
        } catch (err) {
          console.error('[Auth] Session check error:', err)
          set({ isAuthenticated: false, expiresAt: null })
          return false
        }
      },
    }),
    {
      name: 'qwiso-auth',
      // Only persist the authenticated flag and expiry — no token (cookie-based auth)
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        expiresAt: state.expiresAt,
      }),
    }
  )
)

// Register global 401 handler so any apiFetch() 401 triggers logout
// This runs once when the module is first imported
registerUnauthorizedHandler(() => {
  useAuthStore.getState().logout()
})

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  isAuthenticated: boolean
  token: string | null
  expiresAt: number | null
  login: (password: string) => Promise<boolean>
  logout: () => Promise<void>
  checkSession: () => Promise<boolean>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      token: null,
      expiresAt: null,

      login: async (password: string) => {
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
          })

          if (!res.ok) return false

          const data = await res.json()
          
          set({
            isAuthenticated: true,
            expiresAt: data.expiresAt,
          })
          
          return true
        } catch {
          return false
        }
      },

      logout: async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST' })
        } catch {
          // Ignore
        }
        set({ isAuthenticated: false, token: null, expiresAt: null })
      },

      checkSession: async () => {
        try {
          const res = await fetch('/api/auth/me')
          const data = await res.json()
          
          if (data.authenticated) {
            set({ isAuthenticated: true })
            return true
          } else {
            set({ isAuthenticated: false, token: null, expiresAt: null })
            return false
          }
        } catch {
          set({ isAuthenticated: false, token: null, expiresAt: null })
          return false
        }
      },
    }),
    {
      name: 'qwiso-auth',
    }
  )
)

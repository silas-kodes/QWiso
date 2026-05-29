import { useState, useEffect } from 'react'
import { Smartphone, Lock, Loader2, AlertCircle } from 'lucide-react'
import { useAuthStore } from '../stores/auth'

export function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, checkSession } = useAuthStore()

  // Check existing session on mount
  useEffect(() => {
    checkSession()
  }, [checkSession])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const success = await login(password)
    if (!success) {
      setError('Invalid password')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-pf-bg flex items-center justify-center p-4">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-pf-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pf-info/5 rounded-full blur-3xl" />
      </div>

      <div className="glass-panel rounded-2xl p-8 w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-pf-accent to-pf-info flex items-center justify-center glow-accent">
            <Smartphone className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-1">
            Q<span className="text-pf-accent">WISO</span>
          </h1>
          <p className="text-sm text-pf-text-muted">
            Number Generator & WhatsApp Validator
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-pf-text-muted mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-pf-text-dim" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-pf-surface border border-pf-border rounded-lg py-3 pl-10 pr-4 text-white placeholder-pf-text-dim focus:outline-none focus:border-pf-accent transition-colors"
                placeholder="Enter your password"
                autoFocus
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-pf-error text-sm bg-pf-error/10 border border-pf-error/20 rounded-lg p-3">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-gradient-to-r from-pf-accent to-pf-accent-glow hover:from-pf-accent-glow hover:to-pf-accent text-white font-semibold py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed glow-accent"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-pf-text-dim mt-6">
          Protected by server-side session
        </p>
      </div>
    </div>
  )
}

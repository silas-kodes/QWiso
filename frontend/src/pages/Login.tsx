import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
    <div className="min-h-screen bg-pf-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* Dynamic Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* Animated gradient orbs */}
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            rotate: [0, 180, 360],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-gradient-to-br from-pf-accent/20 to-pf-info/20 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1.3, 1, 1.3],
            rotate: [360, 180, 0],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-gradient-to-br from-pf-success/20 to-pf-accent/20 rounded-full blur-3xl"
        />
        {/* Floating particles */}
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            animate={{
              y: [0, -40, 0],
              opacity: [0.2, 0.5, 0.2],
              scale: [1, 1.3, 1],
            }}
            transition={{
              duration: 5 + i * 0.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.3,
            }}
            className="absolute w-2 h-2 bg-pf-accent/30 rounded-full blur-sm"
            style={{
              left: `${10 + i * 12}%`,
              top: `${15 + i * 10}%`,
            }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="glass-panel rounded-3xl p-10 w-full max-w-md relative z-10 backdrop-blur-xl border border-pf-border/30 shadow-2xl"
      >
        {/* Animated border glow */}
        <motion.div
          animate={{
            backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 bg-gradient-to-r from-pf-accent/0 via-pf-accent/5 to-pf-accent/0 opacity-0 hover:opacity-100 transition-opacity duration-700 pointer-events-none rounded-3xl"
          style={{
            backgroundSize: '200% 200%',
          }}
        />

        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-10"
        >
          <motion.div
            animate={{
              rotate: [0, 5, -5, 0],
              scale: [1, 1.05, 1],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-gradient-to-br from-pf-accent to-pf-accent-glow flex items-center justify-center shadow-2xl shadow-pf-accent/40"
          >
            <Smartphone className="w-10 h-10 text-white" />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-3xl font-bold mb-2 tracking-tight"
          >
            Q<span className="text-pf-accent">WISO</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-sm text-pf-text-muted font-medium"
          >
            Number Generator & WhatsApp Validator
          </motion.p>
        </motion.div>

        {/* Form */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-pf-text-muted">
              Password
            </label>
            <div className="relative">
              <motion.div
                animate={{ scale: password ? [1, 1.02, 1] : 1 }}
                transition={{ duration: 0.3 }}
                className="relative"
              >
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-pf-text-dim" />
                <motion.input
                  whileFocus={{ scale: 1.02 }}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-pf-surface/80 border border-pf-border/50 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-pf-text-dim focus:outline-none focus:border-pf-accent focus:ring-2 focus:ring-pf-accent/20 transition-all"
                  placeholder="Enter your password"
                  autoFocus
                />
              </motion.div>
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className="flex items-center gap-3 text-pf-error text-sm bg-gradient-to-r from-pf-error/15 to-pf-error/10 border border-pf-error/30 rounded-2xl p-4"
              >
                <motion.div
                  animate={{ rotate: [0, -10, 10, 0] }}
                  transition={{ duration: 0.5, repeat: 2 }}
                >
                  <AlertCircle className="w-5 h-5" />
                </motion.div>
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading || !password}
            className="w-full bg-gradient-to-r from-pf-accent to-pf-accent-glow hover:from-pf-accent-glow hover:to-pf-accent text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-pf-accent/30 flex items-center justify-center gap-2 text-base"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Signing In...
              </>
            ) : (
              'Sign In'
            )}
          </motion.button>
        </motion.form>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center text-xs text-pf-text-dim mt-8 font-medium"
        >
          Protected by server-side session
        </motion.p>
      </motion.div>
    </div>
  )
}

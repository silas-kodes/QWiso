import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Smartphone,
  Send,
  Users,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Activity,
  ShieldCheck
} from 'lucide-react'
import { useAuthStore } from '../stores/auth'

const API = '/api/whatsapp'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountStats {
  id: string
  name: string
  checksThisHour: number
  checksThisSession: number
  consecutiveErrors: number
  cooldownUntil: number
  cooldownCount: number
  health: 'healthy' | 'degraded' | 'cooldown' | 'exhausted'
}

interface SendResult {
  success: boolean
  recipient: string
  error?: string
}

interface BulkResult {
  total: number
  sent: number
  failed: number
  results: SendResult[]
}

type Tab = 'status' | 'single' | 'bulk'

const MAX_IMAGE_SIZE = 8 * 1024 * 1024

async function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Unable to read image file'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image file'))
    reader.readAsDataURL(file)
  })
}

function isImageFile(file: File) {
  return file.type.startsWith('image/')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().token
  const res = await fetch(path, {
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HealthBadge({ health }: { health: AccountStats['health'] }) {
  const colors = {
    healthy: 'bg-pf-success/15 text-pf-success border border-pf-success/30',
    degraded: 'bg-pf-warning/15 text-pf-warning border border-pf-warning/30',
    cooldown: 'bg-pf-error/15 text-pf-error border border-pf-error/30',
    exhausted: 'bg-pf-muted/15 text-pf-muted border border-pf-muted/30',
  }
  const labels = {
    healthy: 'Healthy',
    degraded: 'Degraded',
    cooldown: 'Cooldown',
    exhausted: 'Exhausted',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[health]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        health === 'healthy' ? 'bg-pf-success' : health === 'degraded' ? 'bg-pf-warning' : health === 'cooldown' ? 'bg-pf-error' : 'bg-pf-text-dim'
      } animate-pulse`} />
      {labels[health]}
    </span>
  )
}

// ─── Rotation Status Tab ───────────────────────────────────────────────────────

function RotationStatusTab() {
  const [stats, setStats] = useState<AccountStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<AccountStats[]>(`${API}/rotation-stats`)
      setStats(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch rotation stats')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStats() }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-pf-text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Analyzing rotation pool...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <XCircle className="w-8 h-8 text-pf-error" />
        <p className="text-pf-error text-sm">{error}</p>
        <button onClick={fetchStats} className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {stats.length === 0 ? (
        <div className="bg-pf-warning/5 border border-pf-warning/20 rounded-xl p-5 text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-pf-warning mx-auto" />
          <h4 className="text-sm font-semibold text-white">No Connected WhatsApp Accounts</h4>
          <p className="text-xs text-pf-text-muted">
            Go to the Connection Panel on the Dashboard to link at least one WhatsApp instance to enable automated anti-ban rotation.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-pf-text-muted px-1">
            <span>Pool Size: {stats.length} Account{stats.length > 1 ? 's' : ''}</span>
            <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-pf-success" /> Anti-Ban Active</span>
          </div>
          <div className="grid gap-3 max-h-72 overflow-y-auto pr-1">
            {stats.map((acct) => (
              <div key={acct.id} className="bg-pf-surface-light border border-pf-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-pf-accent/30 transition-all">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-white">{acct.name}</span>
                    <HealthBadge health={acct.health} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-pf-text-muted">
                    <span>Hour Checks: <strong className="text-white">{acct.checksThisHour}</strong></span>
                    <span>Session Checks: <strong className="text-white">{acct.checksThisSession}</strong></span>
                  </div>
                </div>
                {acct.cooldownUntil > Date.now() && (
                  <span className="text-xs text-pf-error bg-pf-error/10 border border-pf-error/20 px-2.5 py-1 rounded-lg">
                    Cooling down for {Math.ceil((acct.cooldownUntil - Date.now()) / 1000)}s
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={fetchStats}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs text-pf-text-muted hover:text-white border border-pf-border hover:border-pf-accent transition-colors"
      >
        <RefreshCw className="w-3 h-3" /> Refresh Accounts Health
      </button>
    </motion.div>
  )
}

// ─── Single Send Tab ──────────────────────────────────────────────────────────

function SingleSendTab() {
  const [recipient, setRecipient] = useState('')
  const [message, setMessage] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null)

  const handleImageChange = (file: File | null) => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview)
    }
    setImageError(null)
    if (!file) {
      setImageFile(null)
      setImagePreview(null)
      return
    }

    if (!isImageFile(file)) {
      setImageError('Only image files are supported.')
      setImageFile(null)
      setImagePreview(null)
      return
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setImageError('Image is too large. Please choose an image under 8MB.')
      setImageFile(null)
      setImagePreview(null)
      return
    }

    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const send = async () => {
    if (!recipient.trim() || (!message.trim() && !imageFile)) return
    setSending(true)
    setResult(null)
    try {
      const body: Record<string, unknown> = {
        recipient: recipient.trim(),
      }

      if (message.trim()) {
        body.message = message.trim()
      }

      if (imageFile) {
        body.image = {
          data: await fileToDataURL(imageFile),
          mimeType: imageFile.type,
          filename: imageFile.name,
        }
      }

      const data = await apiFetch<{ success: boolean; error?: string }>(`${API}/send`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setResult({ success: data.success, error: data.error })
    } catch (e) {
      setResult({ success: false, error: e instanceof Error ? e.message : 'Unknown error' })
    } finally {
      setSending(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-pf-text-muted mb-1.5">
          Recipient Phone Number
        </label>
        <input
          type="tel"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="+254712345678"
          className="w-full bg-pf-surface border border-pf-border rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-pf-text-dim focus:border-pf-accent transition-colors font-mono"
        />
        <p className="text-xs text-pf-text-dim mt-1">Include country code, e.g. +254...</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-pf-text-muted mb-1.5">
          Message
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={1600}
          placeholder="Type your WhatsApp message..."
          className="w-full bg-pf-surface border border-pf-border rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-pf-text-dim focus:border-pf-accent transition-colors resize-none"
        />
        <div className="flex justify-between text-xs text-pf-text-dim mt-1">
          <span>{message.length}/1600 characters</span>
          <span>{imageFile ? 'Image attached' : 'Image optional'}</span>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-pf-text-muted">Image attachment</label>
          {imageFile && (
            <button
              type="button"
              onClick={() => handleImageChange(null)}
              className="text-xs text-pf-accent hover:text-white"
            >
              Remove
            </button>
          )}
        </div>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
          className="w-full text-sm text-pf-text-muted"
        />
        {imageError && <p className="text-xs text-pf-error mt-1">{imageError}</p>}
        {imagePreview && (
          <img src={imagePreview} alt="Attachment preview" className="mt-3 rounded-xl border border-pf-border max-h-40 object-contain" />
        )}
      </div>

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-lg text-sm ${
              result.success
                ? 'bg-pf-success/10 border border-pf-success/30 text-pf-success'
                : 'bg-pf-error/10 border border-pf-error/30 text-pf-error'
            }`}
          >
            {result.success ? (
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 flex-shrink-0" />
            )}
            {result.success ? 'Message sent successfully via rotated connection pool!' : result.error}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={send}
        disabled={sending || !recipient.trim() || (!message.trim() && !imageFile)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-pf-accent hover:bg-pf-accent-glow text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {sending ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Rotated Send...</>
        ) : (
          <><Send className="w-4 h-4" /> Send Message</>
        )}
      </button>
    </motion.div>
  )
}

// ─── Bulk Send Tab ────────────────────────────────────────────────────────────

interface BulkSendProps {
  initialNumbers?: string
}

function BulkSendTab({ initialNumbers = '' }: BulkSendProps) {
  const [rawNumbers, setRawNumbers] = useState(initialNumbers)
  const [message, setMessage] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<BulkResult | null>(null)

  const recipients = rawNumbers
    .split(/[\n,;]+/)
    .map((n) => n.trim())
    .filter((n) => n.length > 0)

  const handleImageChange = (file: File | null) => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview)
    }
    setImageError(null)
    if (!file) {
      setImageFile(null)
      setImagePreview(null)
      return
    }

    if (!isImageFile(file)) {
      setImageError('Only image files are supported.')
      setImageFile(null)
      setImagePreview(null)
      return
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setImageError('Image is too large. Please choose an image under 8MB.')
      setImageFile(null)
      setImagePreview(null)
      return
    }

    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const send = async () => {
    if (recipients.length === 0 || (!message.trim() && !imageFile)) return
    setSending(true)
    setResult(null)
    try {
      const body: Record<string, unknown> = { recipients }
      if (message.trim()) {
        body.message = message.trim()
      }
      if (imageFile) {
        body.image = {
          data: await fileToDataURL(imageFile),
          mimeType: imageFile.type,
          filename: imageFile.name,
        }
      }

      const data = await apiFetch<BulkResult>(`${API}/send-bulk`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setResult(data)
    } catch (e) {
      setResult({
        total: recipients.length,
        sent: 0,
        failed: recipients.length,
        results: recipients.map((r) => ({
          success: false,
          recipient: r,
          error: e instanceof Error ? e.message : 'Unknown error',
        })),
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-pf-text-muted mb-1.5">
          Phone Numbers
        </label>
        <textarea
          value={rawNumbers}
          onChange={(e) => setRawNumbers(e.target.value)}
          rows={5}
          placeholder={`+254712345678\n+254798765432\n+254733001122`}
          className="w-full bg-pf-surface border border-pf-border rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-pf-text-dim focus:border-pf-accent transition-colors resize-none font-mono"
        />
        <p className="text-xs text-pf-text-dim mt-1">
          {recipients.length > 0
            ? <span className="text-pf-accent font-medium">{recipients.length} recipient{recipients.length !== 1 ? 's' : ''} detected</span>
            : 'One number per line, or comma/semicolon separated'}
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-pf-text-muted mb-1.5">
          Message
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={1600}
          placeholder="Type your broadcast message..."
          className="w-full bg-pf-surface border border-pf-border rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-pf-text-dim focus:border-pf-accent transition-colors resize-none"
        />
        <div className="flex justify-between text-xs text-pf-text-dim mt-1">
          <span>{message.length}/1600</span>
          <span>{imageFile ? 'Image attached' : 'Image optional'}</span>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-pf-text-muted">Image attachment</label>
          {imageFile && (
            <button
              type="button"
              onClick={() => handleImageChange(null)}
              className="text-xs text-pf-accent hover:text-white"
            >
              Remove
            </button>
          )}
        </div>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
          className="w-full text-sm text-pf-text-muted"
        />
        {imageError && <p className="text-xs text-pf-error mt-1">{imageError}</p>}
        {imagePreview && (
          <img src={imagePreview} alt="Attachment preview" className="mt-3 rounded-xl border border-pf-border max-h-40 object-contain" />
        )}
      </div>

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-pf-surface border border-pf-border rounded-xl p-4 space-y-3"
          >
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Total', value: result.total, color: 'text-white' },
                { label: 'Sent', value: result.sent, color: 'text-pf-success' },
                { label: 'Failed', value: result.failed, color: 'text-pf-error' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-pf-bg rounded-lg p-2">
                  <p className={`text-lg font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-pf-text-dim">{label}</p>
                </div>
              ))}
            </div>

            {/* Failed list */}
            {result.failed > 0 && (
              <div className="max-h-28 overflow-y-auto space-y-1">
                {result.results
                  .filter((r) => !r.success)
                  .map((r) => (
                    <div key={r.recipient} className="flex items-center gap-2 text-xs text-pf-error font-mono">
                      <XCircle className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{r.recipient}: {r.error}</span>
                    </div>
                  ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={send}
        disabled={sending || recipients.length === 0 || !message.trim()}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-pf-accent hover:bg-pf-accent-glow text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {sending ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Sending to {recipients.length}...</>
        ) : (
          <><Users className="w-4 h-4" /> Send to {recipients.length || '—'} Recipients</>
        )}
      </button>
    </motion.div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'status', label: 'Rotation Pool', icon: Activity },
  { id: 'single', label: 'Single WA', icon: Send },
  { id: 'bulk', label: 'Bulk WA', icon: Users },
]

interface WhatsappPanelProps {
  initialNumbers?: string
}

export function WhatsappPanel({ initialNumbers = '' }: WhatsappPanelProps) {
  const [tab, setTab] = useState<Tab>(initialNumbers ? 'bulk' : 'status')

  return (
    <div className="glass-panel rounded-2xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pf-success to-pf-accent flex items-center justify-center flex-shrink-0">
          <Smartphone className="w-4 h-4 text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white leading-tight">WhatsApp Launcher</h2>
          <p className="text-xs text-pf-text-muted">Anti-Ban Rotated Messaging</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-pf-bg rounded-xl p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
              tab === id
                ? 'bg-pf-surface text-white shadow'
                : 'text-pf-text-muted hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {tab === 'status' && <RotationStatusTab />}
          {tab === 'single' && <SingleSendTab />}
          {tab === 'bulk' && <BulkSendTab initialNumbers={initialNumbers} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

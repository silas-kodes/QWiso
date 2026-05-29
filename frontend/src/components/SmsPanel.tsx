import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare,
  Send,
  Users,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ChevronRight,
} from 'lucide-react'
import { apiFetch } from '../utils/api'

const API = '/api/sms'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GatewayStatus {
  configured: boolean
  deviceId: string | null
  message: string
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
        ok
          ? 'bg-pf-success/15 text-pf-success border border-pf-success/30'
          : 'bg-pf-error/15 text-pf-error border border-pf-error/30'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-pf-success' : 'bg-pf-error'} animate-pulse`} />
      {ok ? 'Connected' : 'Not Configured'}
    </span>
  )
}

// ─── Gateway Status Tab ───────────────────────────────────────────────────────

function GatewayStatusTab() {
  const [status, setStatus] = useState<GatewayStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<GatewayStatus>(`${API}/status`)
      setStatus(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStatus() }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-pf-text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Checking gateway...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <XCircle className="w-8 h-8 text-pf-error" />
        <p className="text-pf-error text-sm">{error}</p>
        <button onClick={fetchStatus} className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* Status card */}
      <div className="bg-pf-surface rounded-xl p-5 border border-pf-border space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-white">Gateway Status</span>
          <StatusBadge ok={status?.configured ?? false} />
        </div>

        <p className="text-sm text-pf-text-muted">{status?.message}</p>

        {status?.configured && (
          <div className="flex items-center gap-2 text-xs text-pf-text-muted bg-pf-bg rounded-lg px-3 py-2 border border-pf-border font-mono">
            <span className="text-pf-text-dim">Device ID:</span>
            <span className="text-pf-info truncate">{status.deviceId}</span>
          </div>
        )}
      </div>

      {/* Setup instructions when not configured */}
      {!status?.configured && (
        <div className="bg-pf-warning/5 border border-pf-warning/20 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-pf-warning font-medium text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Setup Required
          </div>
          <ol className="text-xs text-pf-text-muted space-y-2 list-decimal list-inside">
            <li>Register a free account at <span className="text-pf-accent font-mono">textbee.dev</span></li>
            <li>Install the TextBee Android app on your phone</li>
            <li>Grant SMS permissions and register the device</li>
            <li>Copy your <span className="text-white font-mono">API Key</span> and <span className="text-white font-mono">Device ID</span> from the dashboard</li>
            <li>Paste both into <span className="text-white font-mono">backend/.env</span> and restart the server</li>
          </ol>
        </div>
      )}

      <button
        onClick={fetchStatus}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs text-pf-text-muted hover:text-white border border-pf-border hover:border-pf-accent transition-colors"
      >
        <RefreshCw className="w-3 h-3" /> Refresh Status
      </button>
    </motion.div>
  )
}

// ─── Single Send Tab ──────────────────────────────────────────────────────────

function SingleSendTab() {
  const [recipient, setRecipient] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null)

  const send = async () => {
    if (!recipient.trim() || !message.trim()) return
    setSending(true)
    setResult(null)
    try {
      const data = await apiFetch<SendResult>(`${API}/send`, {
        method: 'POST',
        body: JSON.stringify({ recipient: recipient.trim(), message: message.trim() }),
      })
      setResult({ success: data.success, error: data.error })
    } catch (e) {
      setResult({ success: false, error: e instanceof Error ? e.message : 'Unknown error' })
    } finally {
      setSending(false)
    }
  }

  const charCount = message.length
  const smsCount = Math.ceil(charCount / 160) || 1

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
          placeholder="Type your message here..."
          className="w-full bg-pf-surface border border-pf-border rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-pf-text-dim focus:border-pf-accent transition-colors resize-none"
        />
        <div className="flex justify-between text-xs text-pf-text-dim mt-1">
          <span>{charCount}/1600 characters</span>
          <span>{smsCount} SMS part{smsCount !== 1 ? 's' : ''}</span>
        </div>
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
            {result.success ? 'SMS sent successfully!' : result.error}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={send}
        disabled={sending || !recipient.trim() || !message.trim()}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-pf-accent hover:bg-pf-accent-glow text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {sending ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
        ) : (
          <><Send className="w-4 h-4" /> Send SMS</>
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
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<BulkResult | null>(null)

  const recipients = rawNumbers
    .split(/[\n,;]+/)
    .map((n) => n.trim())
    .filter((n) => n.length > 0)

  const send = async () => {
    if (recipients.length === 0 || !message.trim()) return
    setSending(true)
    setResult(null)
    try {
      const data = await apiFetch<BulkResult>(`${API}/send-bulk`, {
        method: 'POST',
        body: JSON.stringify({ recipients, message: message.trim() }),
      })
      setResult(data)
    } catch (e) {
      // Show minimal error
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
        <p className="text-xs text-pf-text-dim mt-1">{message.length}/1600</p>
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

const TABS: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: 'status', label: 'Gateway', icon: MessageSquare },
  { id: 'single', label: 'Single', icon: Send },
  { id: 'bulk', label: 'Bulk', icon: Users },
]

interface SmsPanelProps {
  initialNumbers?: string
}

export function SmsPanel({ initialNumbers = '' }: SmsPanelProps) {
  const [tab, setTab] = useState<Tab>(initialNumbers ? 'bulk' : 'status')

  return (
    <div className="glass-panel rounded-2xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pf-info to-pf-accent flex items-center justify-center flex-shrink-0">
          <MessageSquare className="w-4 h-4 text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white leading-tight">SMS Gateway</h2>
          <p className="text-xs text-pf-text-muted">Powered by TextBee</p>
        </div>
        <a
          href="https://textbee.dev/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 text-xs text-pf-text-dim hover:text-pf-accent transition-colors"
        >
          Dashboard <ChevronRight className="w-3 h-3" />
        </a>
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
          {tab === 'status' && <GatewayStatusTab />}
          {tab === 'single' && <SingleSendTab />}
          {tab === 'bulk' && <BulkSendTab initialNumbers={initialNumbers} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

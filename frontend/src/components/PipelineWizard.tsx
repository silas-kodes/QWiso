import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Smartphone,
  CheckCircle,
  Loader2,
  Plus,
  Trash2,
  Shield,
  Zap,
  ChevronDown,
  CheckCircle2,
  Play,
  Clock,
  Send,
  MessageSquare,
  Download,
  ArrowRight,
  Database,
  QrCode,
  XCircle
} from 'lucide-react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useWebSocketStore } from '../stores/websocket'
import { apiFetch, apiUrl } from '../utils/api'

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface Country {
  index: number
  name: string
  flag: string
  dial: string
  code: string
}

interface Dataset {
  id: string
  name: string
  counts?: {
    total: number
    pending: number
    valid: number
    invalid: number
    error: number
    campaign: number
    staff: number
    excluded: number
  }
}

const STEPS = [
  { number: 1, label: 'Link Gateway', icon: Smartphone },
  { number: 2, label: 'Generator', icon: Zap },
  { number: 3, label: 'Validator', icon: Shield },
  { number: 4, label: 'Action Hub', icon: Send },
]

export function PipelineWizard() {
  const navigate = useNavigate()
  const { send } = useWebSocket()
  const waStatuses = useWebSocketStore((state) => state.waStatuses)
  const validationProgress = useWebSocketStore((state) => state.validationProgress)
  const lastValidationResult = useWebSocketStore((state) => state.lastValidationResult)

  const [step, setStep] = useState(1)
  const [countdown, setCountdown] = useState<number | null>(null)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Toggleable auto-advance state (persisted in localStorage)
  const [autoAdvance, setAutoAdvance] = useState(() => {
    const saved = localStorage.getItem('qwiso_auto_advance')
    return saved !== null ? saved === 'true' : true
  })

  const toggleAutoAdvance = () => {
    setAutoAdvance(prev => {
      const next = !prev
      localStorage.setItem('qwiso_auto_advance', String(next))
      if (!next) {
        clearCountdown()
      }
      return next
    })
  }

  // Shared state variables
  const [selectedDatasetId, setSelectedDatasetId] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState('main')

  // Step 1: Link Gateway States
  const [isAddingAcc, setIsAddingAcc] = useState(false)
  const [newAccName, setNewAccName] = useState('')
  const [linkingLoading, setLinkingLoading] = useState<string | null>(null)
  const [authMethod, setAuthMethod] = useState<'qr' | 'pairing'>('qr')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [phoneError, setPhoneError] = useState('')

  // Step 2: Generator States
  const [countries, setCountries] = useState<Country[]>([])
  const [selectedCountry, setSelectedCountry] = useState(0)
  const [genQuantity, setGenQuantity] = useState(100)
  const [useDial, setUseDial] = useState(true)
  const [useSpaces, setUseSpaces] = useState(false)
  const [localOnly, setLocalOnly] = useState(false)
  const [genLoading, setGenLoading] = useState(false)
  const [genError, setGenError] = useState('')
  const [genSuccess, setGenSuccess] = useState<{ id: string; count: number } | null>(null)

  // Step 3: Validator States
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [concurrency, setConcurrency] = useState(1)
  const [valLoading, setValLoading] = useState(false)
  const [valError, setValError] = useState('')

  // ─── WebSocket State Observers & Auto-resumes ─────────────────────────────────

  // Auto-resume validation: If server validation is active, auto-switch to Step 3
  useEffect(() => {
    if (validationProgress && step !== 3) {
      setStep(3)
      if (validationProgress.datasetId) {
        setSelectedDatasetId(validationProgress.datasetId)
      }
    }
  }, [validationProgress])

  // Clear countdown helpers
  const clearCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
    }
    setCountdown(null)
  }, [])

  // Transition helper with 5s countdown
  const startTransitionCountdown = useCallback((targetStep: number) => {
    clearCountdown()
    setCountdown(5)
    
    let currentCount = 5
    countdownIntervalRef.current = setInterval(() => {
      currentCount -= 1
      setCountdown(currentCount)
      if (currentCount <= 0) {
        clearCountdown()
        setStep(targetStep)
      }
    }, 1000)
  }, [clearCountdown])

  // Step 1 Auto-advance: When a session becomes ready, start transition
  const readySessionsCount = Object.values(waStatuses).filter(s => s.state === 'ready').length
  useEffect(() => {
    if (autoAdvance && step === 1 && readySessionsCount > 0 && !countdownIntervalRef.current) {
      startTransitionCountdown(2)
    }
  }, [step, readySessionsCount, startTransitionCountdown, autoAdvance])

  // Step 3 Auto-advance: When validation completes, start transition
  useEffect(() => {
    if (autoAdvance && step === 3 && lastValidationResult && !validationProgress && !countdownIntervalRef.current) {
      startTransitionCountdown(4)
    }
  }, [step, lastValidationResult, validationProgress, startTransitionCountdown, autoAdvance])

  // Fetch initial Step 2 & 3 lists
  useEffect(() => {
    // Fetch Countries
    apiFetch<Country[]>('/api/datasets/countries')
      .then(data => {
        if (Array.isArray(data)) setCountries(data)
      })
      .catch(console.error)

    // Fetch Datasets
    fetchDatasetsList()
  }, [step, lastValidationResult])

  const fetchDatasetsList = async () => {
    try {
      const data = await apiFetch<Dataset[]>('/api/datasets')
      if (Array.isArray(data)) {
        setDatasets(data)
        // If we don't have a dataset selected, select the first one
        if (data.length > 0 && !selectedDatasetId) {
          setSelectedDatasetId(data[0].id)
        }
      }
    } catch (e) {
      console.error('Failed to load datasets:', e)
    }
  }

  // Pre-select ready WhatsApp account in Step 3
  useEffect(() => {
    const readyAccount = Object.values(waStatuses).find(acc => acc.state === 'ready')
    if (readyAccount && (!selectedAccountId || waStatuses[selectedAccountId]?.state !== 'ready')) {
      setSelectedAccountId(readyAccount.id)
    }
  }, [waStatuses, selectedAccountId])

  // Reset countdown if user manually clicks another step
  const handleStepClick = (s: number) => {
    clearCountdown()
    setStep(s)
  }

  // ─── Step 1 Actions ────────────────────────────────────────────────────────────

  const handleAddAccount = () => {
    if (!newAccName.trim()) return
    if (authMethod === 'pairing') {
      const digits = phoneNumber.replace(/\D/g, '')
      if (digits.length < 7 || digits.length > 15) {
        setPhoneError('Enter a valid number with country code, e.g. +971501234567')
        return
      }
      setPhoneError('')
    }
    const newId = `wa_${Date.now()}`
    send({ type: 'wa_initialize', clientId: newId, name: newAccName, method: authMethod, phone: authMethod === 'pairing' ? phoneNumber : undefined })
    setNewAccName('')
    setPhoneNumber('')
    setAuthMethod('qr')
    setPhoneError('')
    setIsAddingAcc(false)
  }

  const handleConnectAccount = (clientId: string) => {
    if (authMethod === 'pairing') {
      const digits = phoneNumber.replace(/\D/g, '')
      if (digits.length < 7 || digits.length > 15) {
        setPhoneError('Enter a valid number with country code, e.g. +971501234567')
        return
      }
      setPhoneError('')
    }
    setLinkingLoading(clientId)
    send({ type: 'wa_initialize', clientId, method: authMethod, phone: authMethod === 'pairing' ? phoneNumber : undefined })
    setTimeout(() => setLinkingLoading(null), 2000)
  }

  const handleDisconnectAccount = (clientId: string) => {
    setLinkingLoading(clientId)
    send({ type: 'wa_logout', clientId })
    setTimeout(() => setLinkingLoading(null), 1000)
  }

  const handleRemoveAccount = (clientId: string) => {
    if (confirm('Are you sure you want to remove this WhatsApp account session?')) {
      send({ type: 'wa_remove', clientId })
    }
  }

  // ─── Step 2 Actions ────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    setGenLoading(true)
    setGenError('')
    setGenSuccess(null)
    clearCountdown()

    try {
      const data = await apiFetch<{ datasetId: string; count: number }>('/api/datasets/generate', {
        method: 'POST',
        body: JSON.stringify({
          countryIndex: selectedCountry,
          quantity: genQuantity,
          useDial,
          useSpaces,
          localOnly,
        }),
      })

      setGenSuccess({ id: data.datasetId, count: data.count })
      setSelectedDatasetId(data.datasetId)
      // Auto-refresh datasets
      fetchDatasetsList()
      // Begin auto-advance to Step 3
      if (autoAdvance) {
        startTransitionCountdown(3)
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Failed to generate dataset')
    } finally {
      setGenLoading(false)
    }
  }

  // ─── Step 3 Actions ────────────────────────────────────────────────────────────

  const handleStartValidation = async () => {
    if (!selectedDatasetId || !selectedAccountId) return
    setValLoading(true)
    setValError('')
    clearCountdown()

    try {
      await apiFetch('/api/whatsapp/validate', {
        method: 'POST',
        body: JSON.stringify({
          datasetId: selectedDatasetId,
          waClientId: selectedAccountId,
          concurrency,
          timeoutMs: 30000,
          totalCount: genSuccess?.count,
        }),
      })
    } catch (err) {
      setValError(err instanceof Error ? err.message : 'Failed to start validation')
    } finally {
      setValLoading(false)
    }
  }

  // ─── Step 4 Actions ────────────────────────────────────────────────────────────

  const handleLaunchCampaign = (platform: 'whatsapp' | 'sms') => {
    navigate('/campaigns', {
      state: {
        showCreateModal: true,
        datasetId: selectedDatasetId,
        platform
      }
    })
  }

  const handleDownloadCSV = async () => {
    if (!selectedDatasetId) return
    const ds = datasets.find(d => d.id === selectedDatasetId)
    const name = ds ? ds.name : 'export'
    try {
      const res = await fetch(apiUrl(`/api/exports/dataset/${selectedDatasetId}/csv`), {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `qwiso_${name}_${selectedDatasetId.slice(0, 8)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
      alert('Failed to download CSV export')
    }
  }

  // Helper getters
  const selectedDatasetData = datasets.find(d => d.id === selectedDatasetId)
  const liveCounts = validationProgress?.datasetId === selectedDatasetId
    ? validationProgress.counts
    : undefined
  const displayCounts = liveCounts ?? selectedDatasetData?.counts
  const currentValValid = displayCounts?.campaign ?? displayCounts?.valid ?? 0
  const activeWA = waStatuses[selectedAccountId]
  const activeWASessionReady = activeWA?.state === 'ready'

  return (
    <div className="relative">
      {/* Dynamic Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Animated gradient orbs */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 180, 360],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-40 -right-40 w-96 h-96 bg-gradient-to-br from-pf-accent/20 to-pf-info/20 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1.2, 1, 1.2],
            rotate: [360, 180, 0],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-br from-pf-success/20 to-pf-accent/20 rounded-full blur-3xl"
        />
        {/* Floating particles */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            animate={{
              y: [0, -30, 0],
              opacity: [0.2, 0.5, 0.2],
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: 4 + i * 0.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.3,
            }}
            className="absolute w-2 h-2 bg-pf-accent/30 rounded-full blur-sm"
            style={{
              left: `${10 + i * 15}%`,
              top: `${20 + i * 12}%`,
            }}
          />
        ))}
      </div>

      <div className="glass-panel rounded-3xl p-8 sm:p-10 space-y-10 border border-pf-border/30 relative overflow-hidden backdrop-blur-xl">
        {/* Animated border glow */}
        <motion.div
          animate={{
            backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 bg-gradient-to-r from-pf-accent/0 via-pf-accent/5 to-pf-accent/0 opacity-0 hover:opacity-100 transition-opacity duration-700 pointer-events-none"
          style={{
            backgroundSize: '200% 200%',
          }}
        />

        {/* ─── Header & Switch Info ─── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex flex-wrap items-center gap-4">
            {/* Enhanced Toggle Switch */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-3 bg-pf-surface/80 border border-pf-border/40 px-4 py-2.5 rounded-2xl backdrop-blur-md shadow-lg select-none"
            >
              <span className="text-xs font-semibold text-pf-text-muted">Auto-Advance</span>
              <button
                onClick={toggleAutoAdvance}
                type="button"
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-all duration-300 relative focus:outline-none focus:ring-2 focus:ring-pf-accent/50 ${
                  autoAdvance ? 'bg-gradient-to-r from-pf-accent to-pf-accent-glow shadow-lg shadow-pf-accent/30' : 'bg-pf-bg border border-pf-border/40'
                }`}
                title={autoAdvance ? "Disable auto-advance" : "Enable auto-advance"}
              >
                <motion.div
                  className="w-4 h-4 rounded-full shadow-md bg-white"
                  layout
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  animate={{ x: autoAdvance ? 20 : 0 }}
                />
              </button>
              <motion.span
                animate={{ opacity: autoAdvance ? 1 : 0.5 }}
                className={`text-[10px] font-bold uppercase w-8 tracking-wider ${autoAdvance ? 'text-pf-accent' : 'text-pf-text-dim'}`}
              >
                {autoAdvance ? 'ON' : 'OFF'}
              </motion.span>
            </motion.div>

            {/* Enhanced Auto-Advance Feedback Banner */}
            <AnimatePresence>
            {countdown !== null && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -20 }}
                className="bg-gradient-to-r from-pf-success/20 to-pf-success/10 border border-pf-success/40 px-5 py-3 rounded-2xl flex items-center justify-between gap-4 text-xs text-pf-success relative overflow-hidden shadow-lg shadow-pf-success/20"
              >
                {/* Animated background pattern */}
                <motion.div
                  animate={{
                    x: ['-100%', '100%'],
                  }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-pf-success/10 to-transparent"
                />
                <div className="flex items-center gap-3 z-10">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="relative flex h-3 w-3"
                  >
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pf-success opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-pf-success"></span>
                  </motion.div>
                  <span className="font-medium">Auto-advancing in <strong className="font-bold font-mono text-base ml-1">{countdown}s</strong>...</span>
                </div>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    const target = step + 1
                    clearCountdown()
                    if (target <= 4) setStep(target)
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-pf-success/30 text-white font-bold hover:bg-pf-success/40 transition-all z-10 shadow-md"
                >
                  Proceed Now <ArrowRight className="w-4 h-4" />
                </motion.button>

                {/* Enhanced ticking indicator bar */}
                <div className="absolute bottom-0 left-0 w-full h-1 bg-pf-success/20 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-pf-success to-pf-accent shadow-[0_0_12px_rgba(46,196,182,0.6)]"
                    initial={{ width: '100%' }}
                    animate={{ width: `${(countdown / 5) * 100}%` }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </div>

      {/* ─── Enhanced Horizontal Stepper ─── */}
      <div className="relative py-4">
        {/* Enhanced Connecting Progress Line */}
        <div className="absolute top-1/2 left-0 w-full h-1 bg-pf-border/20 -translate-y-1/2 -z-10 rounded-full" />
        <motion.div
          className="absolute top-1/2 left-0 h-1 bg-gradient-to-r from-pf-accent via-pf-info to-pf-accent-glow -translate-y-1/2 -z-10 rounded-full shadow-[0_0_20px_rgba(10,132,255,0.6)]"
          initial={{ width: '0%' }}
          animate={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }}
          transition={{ type: 'spring', stiffness: 60, damping: 15 }}
        >
          {/* Animated shimmer effect */}
          <motion.div
            animate={{
              x: ['-100%', '100%'],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
          />
        </motion.div>

        <div className="grid grid-cols-4 gap-4 relative z-10">
          {STEPS.map((s) => {
            const Icon = s.icon
            const isCompleted = step > s.number
            const isActive = step === s.number
            const isSelectable = s.number <= (readySessionsCount > 0 ? 4 : 2)

            return (
              <motion.button
                key={s.number}
                onClick={() => isSelectable && handleStepClick(s.number)}
                disabled={!isSelectable}
                whileHover={isSelectable ? { scale: 1.05 } : {}}
                whileTap={isSelectable ? { scale: 0.95 } : {}}
                className="flex flex-col items-center text-center focus:outline-none relative group disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {/* Enhanced Pulsing Outer Glow for Active Step */}
                {isActive && (
                  <motion.div
                    className="absolute w-16 h-16 rounded-full bg-pf-accent/20 -z-10 border border-pf-accent/30"
                    layoutId="activeGlow"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{
                      scale: [1, 1.4, 1],
                      opacity: [0.3, 0.6, 0.3],
                    }}
                    transition={{
                      scale: { repeat: Infinity, duration: 2, ease: 'easeInOut' },
                      opacity: { repeat: Infinity, duration: 2, ease: 'easeInOut' },
                      layout: { type: 'spring', stiffness: 80, damping: 15 }
                    }}
                  >
                    <motion.div
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.5, 0, 0.5],
                      }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="absolute inset-0 rounded-full bg-pf-accent/40 blur-xl"
                    />
                  </motion.div>
                )}

                <motion.div
                  animate={{
                    scale: isActive ? 1.2 : 1,
                    y: isActive ? -4 : 0,
                    borderColor: isActive ? '#0a84ff' : isCompleted ? '#30d158' : 'rgba(255,255,255,0.1)',
                  }}
                  transition={{ type: 'spring', stiffness: 120, damping: 14 }}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 ${
                    isActive
                      ? 'bg-gradient-to-br from-pf-surface to-pf-surface-light text-pf-accent shadow-[0_0_25px_rgba(10,132,255,0.5)]'
                      : isCompleted
                      ? 'bg-gradient-to-br from-pf-success/20 to-pf-success/10 text-pf-success shadow-lg'
                      : 'bg-pf-bg text-pf-text-dim'
                  }`}
                >
                  {isCompleted ? (
                    <motion.div
                      initial={{ scale: 0, rotate: -45 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 150, damping: 10 }}
                    >
                      <CheckCircle className="w-6 h-6" />
                    </motion.div>
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </motion.div>

                <motion.div
                  animate={{ y: isActive ? 2 : 0 }}
                  className="mt-3"
                >
                  <span className={`text-xs font-bold tracking-wide transition-colors duration-300 ${
                    isActive ? 'text-white' : 'text-pf-text-muted group-hover:text-white'
                  }`}>
                    {s.label}
                  </span>
                </motion.div>
              </motion.button>
            )
          })}
        </div>
      </div>
      {/* ─── Enhanced Step Content Panel (Framer Motion Switcher) ─── */}
      <div className="min-h-[400px] relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            className="space-y-8 relative z-10"
          >

            {/* ─── STEP 1: SESSION LINKER ─── */}
            {step === 1 && (
              <div className="space-y-8">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex items-center justify-between"
                >
                  <div className="space-y-1">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <motion.div
                        animate={{ rotate: [0, 10, -10, 0] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-8 h-8 rounded-xl bg-gradient-to-br from-pf-accent to-pf-accent-glow flex items-center justify-center"
                      >
                        <Smartphone className="w-4 h-4 text-white" />
                      </motion.div>
                      WhatsApp Connection Linker
                    </h3>
                    <p className="text-sm text-pf-text-muted">Link at least one WhatsApp account to establish rotation pools</p>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsAddingAcc(!isAddingAcc)}
                    className="flex items-center gap-2 text-sm font-bold bg-gradient-to-r from-pf-accent to-pf-accent-glow text-white px-5 py-2.5 rounded-xl shadow-lg shadow-pf-accent/30 transition-all"
                  >
                    {isAddingAcc ? 'Cancel' : <><Plus className="w-4 h-4" /> Add Account</>}
                  </motion.button>
                </motion.div>

                {/* Enhanced Account Form */}
                <AnimatePresence>
                  {isAddingAcc && (
                    <motion.div
                      initial={{ height: 0, opacity: 0, scale: 0.95 }}
                      animate={{ height: 'auto', opacity: 1, scale: 1 }}
                      exit={{ height: 0, opacity: 0, scale: 0.95 }}
                      className="p-6 bg-gradient-to-br from-pf-surface-light to-pf-surface border border-pf-border/50 rounded-2xl space-y-4 overflow-hidden shadow-xl"
                    >
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-pf-text-muted uppercase tracking-wider">Account Identifier</label>
                        <motion.input
                          whileFocus={{ scale: 1.02 }}
                          type="text"
                          placeholder="e.g. Sales Account Alpha"
                          value={newAccName}
                          onChange={(e) => setNewAccName(e.target.value)}
                          className="w-full bg-pf-bg/80 border border-pf-border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-pf-accent focus:ring-2 focus:ring-pf-accent/20 transition-all"
                        />
                      </div>

                      <div className="flex gap-3">
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => { setAuthMethod('qr'); setPhoneError('') }}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                            authMethod === 'qr'
                              ? 'bg-gradient-to-r from-pf-accent to-pf-accent-glow text-white shadow-lg shadow-pf-accent/30'
                              : 'bg-pf-bg text-pf-text-muted border border-pf-border/50 hover:border-pf-border'
                          }`}
                        >
                          <QrCode className="w-4 h-4" />
                          QR Code
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => { setAuthMethod('pairing'); setPhoneError('') }}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                            authMethod === 'pairing'
                              ? 'bg-gradient-to-r from-pf-accent to-pf-accent-glow text-white shadow-lg shadow-pf-accent/30'
                              : 'bg-pf-bg text-pf-text-muted border border-pf-border/50 hover:border-pf-border'
                          }`}
                        >
                          <Smartphone className="w-4 h-4" />
                          Phone Number
                        </motion.button>
                      </div>

                      {authMethod === 'pairing' && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-2"
                        >
                          <label className="block text-[10px] font-bold text-pf-text-muted uppercase tracking-wider">Phone Number</label>
                          <input
                            type="tel"
                            placeholder="+971 50 123 4567"
                            value={phoneNumber}
                            onChange={(e) => { setPhoneNumber(e.target.value); setPhoneError('') }}
                            className={`w-full bg-pf-bg/80 border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 transition-all ${
                              phoneError
                                ? 'border-pf-error focus:border-pf-error focus:ring-pf-error/30'
                                : 'border-pf-border focus:border-pf-accent focus:ring-pf-accent/20'
                            }`}
                          />
                          {phoneError && <p className="text-[10px] text-pf-error font-medium">{phoneError}</p>}
                          {phoneNumber.replace(/\D/g, '').length > 0 && phoneNumber.replace(/\D/g, '').length < 7 && (
                            <p className="text-[10px] text-pf-warning font-medium">Number too short — include country code</p>
                          )}
                        </motion.div>
                      )}

                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleAddAccount}
                        disabled={
                          !newAccName.trim() ||
                          (authMethod === 'pairing' && phoneNumber.replace(/\D/g, '').length < 7)
                        }
                        className="w-full bg-gradient-to-r from-pf-accent to-pf-accent-g hover:from-pf-accent-glow hover:to-pf-accent text-white font-bold py-3.5 rounded-xl shadow-lg shadow-pf-accent/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <Plus className="w-5 h-5" />
                        Create {authMethod === 'pairing' ? '& Connect' : 'Account'}
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>


                {/* Enhanced Accounts List */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {Object.values(waStatuses).length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="col-span-full border-2 border-dashed border-pf-border/50 rounded-3xl p-12 text-center"
                    >
                      <motion.div
                        animate={{ y: [0, -10, 0] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-pf-surface-light flex items-center justify-center"
                      >
                        <Smartphone className="w-8 h-8 text-pf-text-dim/60" />
                      </motion.div>
                      <p className="text-sm text-pf-text-dim font-medium">No linked accounts yet</p>
                      <p className="text-xs text-pf-text-dim/60 mt-1">Click "Add Account" to connect your first instance</p>
                    </motion.div>
                  ) : (
                    Object.values(waStatuses).map((status, index) => (
                      <motion.div
                        key={status.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        whileHover={{ scale: 1.02, y: -4 }}
                        className="bg-gradient-to-br from-pf-surface/60 to-pf-surface/40 border border-pf-border/40 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-lg hover:shadow-xl transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-white truncate">{status.name || 'Account'}</span>
                          <div className="flex items-center gap-2">
                            <motion.span
                              animate={{ scale: [1, 1.1, 1] }}
                              transition={{ duration: 2, repeat: Infinity }}
                              className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${
                                status.state === 'ready' ? 'bg-pf-success/20 text-pf-success' : 'bg-pf-warning/20 text-pf-warning'
                              }`}
                            >
                              {status.state}
                            </motion.span>
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleRemoveAccount(status.id)}
                              className="text-pf-text-dim hover:text-pf-error p-1.5 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </motion.button>
                          </div>
                        </div>

                        {status.qrCode && status.state === 'qr_ready' && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-white p-4 rounded-2xl flex flex-col items-center gap-3 border border-gray-200 shadow-lg"
                          >
                            <img src={status.qrCode} alt="QR Code" className="w-36 h-36" />
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Scan to Authorize</span>
                          </motion.div>
                        )}

                        {status.pairingCode && status.state === 'pairing' && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-gradient-to-br from-pf-surface/80 to-pf-surface/60 p-4 rounded-2xl flex flex-col items-center gap-3 border border-pf-accent/30 shadow-lg"
                          >
                            <motion.div
                              animate={{ rotate: [0, 360] }}
                              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                              className="p-3 rounded-full bg-pf-accent/20"
                            >
                              <Smartphone className="w-6 h-6 text-pf-accent" />
                            </motion.div>
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-[10px] font-bold text-pf-text-muted uppercase tracking-widest">Enter This Code</span>
                              <span className="text-[9px] text-pf-text-dim font-medium text-center">WhatsApp → Linked Devices → Link with phone number</span>
                            </div>
                            <div className="px-6 py-3 bg-pf-bg rounded-xl border border-pf-border/30 shadow-inner">
                              <span className="font-mono text-2xl font-black tracking-[0.2em] text-pf-accent">{status.pairingCode}</span>
                            </div>
                          </motion.div>
                        )}

                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => status.state === 'ready' ? handleDisconnectAccount(status.id) : handleConnectAccount(status.id)}
                          disabled={status.state === 'connecting' || status.state === 'qr_ready' || status.state === 'pairing' || linkingLoading === status.id}
                          className={`w-full py-3 rounded-xl font-bold text-sm shadow-md transition-all disabled:opacity-50 ${
                            status.state === 'ready'
                              ? 'bg-gradient-to-r from-pf-error/20 to-pf-error/10 text-pf-error hover:from-pf-error/30 hover:to-pf-error/20 border border-pf-error/30'
                              : 'bg-gradient-to-r from-pf-accent to-pf-accent-glow text-white hover:from-pf-accent-glow hover:to-pf-accent shadow-lg shadow-pf-accent/30'
                          }`}
                        >
                          {linkingLoading === status.id ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> :
                           status.state === 'ready' ? 'Disconnect' : 'Connect Account'}
                        </motion.button>
                      </motion.div>
                    ))
                  )}
                </div>

                {readySessionsCount > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="flex justify-end pt-6 border-t border-pf-border/40"
                  >
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setStep(2)}
                      className="flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-pf-accent to-pf-accent-glow text-white shadow-lg shadow-pf-accent/30 transition-all"
                    >
                      Continue to Generation <ArrowRight className="w-5 h-5" />
                    </motion.button>
                  </motion.div>
                )}
              </div>
            )}

            {/* ─── STEP 2: NUMBER GENERATOR ─── */}
            {step === 2 && (
              <div className="space-y-8">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="space-y-2"
                >
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <motion.div
                      animate={{ rotate: [0, -10, 10, 0] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="w-8 h-8 rounded-xl bg-gradient-to-br from-pf-accent to-pf-accent-glow flex items-center justify-center"
                    >
                      <Zap className="w-4 h-4 text-white" />
                    </motion.div>
                    List Generation Gateway
                  </h3>
                  <p className="text-sm text-pf-text-muted">Create target customer lists by dial parameters and country codes</p>
                </motion.div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Enhanced Country Select */}
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-2"
                  >
                    <label className="block text-xs font-bold text-pf-text-muted uppercase tracking-wider">Country Profile</label>
                    <div className="relative">
                      <motion.select
                        whileFocus={{ scale: 1.02 }}
                        value={selectedCountry}
                        onChange={(e) => setSelectedCountry(Number(e.target.value))}
                        className="w-full bg-pf-surface/80 border border-pf-border/50 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-pf-accent focus:ring-2 focus:ring-pf-accent/20 appearance-none transition-all"
                      >
                        {countries.map((c) => (
                          <option key={c.index} value={c.index}>
                            {c.flag} {c.name} ({c.dial})
                          </option>
                        ))}
                      </motion.select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-pf-text-dim pointer-events-none" />
                    </div>
                  </motion.div>

                  {/* Enhanced Quantity */}
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-2"
                  >
                    <label className="block text-xs font-bold text-pf-text-muted uppercase tracking-wider">List Batch Quantity</label>
                    <motion.input
                      whileFocus={{ scale: 1.02 }}
                      type="number"
                      min={10}
                      max={10000}
                      value={genQuantity}
                      onChange={(e) => setGenQuantity(Math.min(10000, Math.max(10, Number(e.target.value))))}
                      className="w-full bg-pf-surface/80 border border-pf-border/50 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-pf-accent focus:ring-2 focus:ring-pf-accent/20 transition-all"
                    />
                  </motion.div>
                </div>

                {/* Enhanced Checklist options */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex flex-wrap gap-4 p-5 bg-gradient-to-br from-pf-surface/50 to-pf-surface/30 rounded-2xl border border-pf-border/40"
                >
                  {[
                    { label: 'Append Dial Code', checked: useDial, onChange: setUseDial },
                    { label: 'Insert Formatting Spaces', checked: useSpaces, onChange: setUseSpaces },
                    { label: 'Local Format Only', checked: localOnly, onChange: setLocalOnly },
                  ].map((option, index) => (
                    <motion.label
                      key={option.label}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 + index * 0.1 }}
                      whileHover={{ scale: 1.05 }}
                      className="flex items-center gap-3 cursor-pointer px-4 py-2 rounded-xl bg-pf-bg/50 border border-pf-border/30 hover:border-pf-accent/50 transition-all"
                    >
                      <input
                        type="checkbox"
                        checked={option.checked}
                        onChange={(e) => option.onChange(e.target.checked)}
                        className="w-4 h-4 rounded border-pf-border bg-pf-surface text-pf-accent focus:ring-2 focus:ring-pf-accent/30 transition-all"
                      />
                      <span className="text-xs text-pf-text-muted font-medium">{option.label}</span>
                    </motion.label>
                  ))}
                </motion.div>

                {genError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-pf-error/15 border border-pf-error/30 text-pf-error text-sm rounded-2xl flex items-center gap-3"
                  >
                    <XCircle className="w-5 h-5" />
                    {genError}
                  </motion.div>
                )}

                {genSuccess && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-5 bg-gradient-to-r from-pf-success/20 to-pf-success/10 border border-pf-success/40 text-pf-success text-sm rounded-2xl flex items-center gap-3 shadow-lg shadow-pf-success/20"
                  >
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 0.5, repeat: Infinity }}
                      className="w-8 h-8 rounded-full bg-pf-success/30 flex items-center justify-center"
                    >
                      <CheckCircle className="w-5 h-5" />
                    </motion.div>
                    <div>
                      <span className="font-bold">Successfully generated {genSuccess.count} contact targets</span>
                      <span className="text-pf-success/70 ml-2">(Dataset ID: {genSuccess.id.slice(0, 8)})</span>
                    </div>
                  </motion.div>
                )}

                <div className="flex flex-col sm:flex-row gap-4">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleGenerate}
                    disabled={genLoading || countries.length === 0}
                    className="flex-1 bg-gradient-to-r from-pf-accent to-pf-accent-glow hover:from-pf-accent-glow hover:to-pf-accent text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-pf-accent/30 disabled:opacity-50 flex items-center justify-center gap-3 text-base"
                  >
                    {genLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Zap className="w-5 h-5" /> Generate Target List</>}
                  </motion.button>

                  {genSuccess && (
                    <motion.button
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setStep(3)}
                      className="px-8 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 bg-gradient-to-r from-pf-accent to-pf-accent-glow text-white shadow-lg shadow-pf-accent/30 transition-all hover:from-pf-accent-glow hover:to-pf-accent text-base"
                    >
                      Continue to Validator <ArrowRight className="w-5 h-5" />
                    </motion.button>
                  )}
                </div>
              </div>
            )}

            {/* ─── STEP 3: VALIDATOR ─── */}
            {step === 3 && (
              <div className="space-y-8">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="space-y-2"
                >
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="w-8 h-8 rounded-xl bg-gradient-to-br from-pf-accent to-pf-accent-glow flex items-center justify-center"
                    >
                      <Shield className="w-4 h-4 text-white" />
                    </motion.div>
                    Live Filters & Validation
                  </h3>
                  <p className="text-sm text-pf-text-muted">Validate targets using active WhatsApp rotation to eliminate non-active numbers</p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Enhanced Dataset Selector */}
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-2"
                  >
                    <label className="block text-xs font-bold text-pf-text-muted uppercase tracking-wider">Target Dataset</label>
                    <motion.select
                      whileFocus={{ scale: 1.02 }}
                      value={selectedDatasetId}
                      onChange={(e) => setSelectedDatasetId(e.target.value)}
                      className="w-full bg-pf-surface/80 border border-pf-border/50 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-pf-accent focus:ring-2 focus:ring-pf-accent/20 appearance-none transition-all"
                    >
                      {datasets.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.counts?.pending || 0} pending)
                        </option>
                      ))}
                    </motion.select>
                  </motion.div>

                  {/* Enhanced Account Selector */}
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-2"
                  >
                    <label className="block text-xs font-bold text-pf-text-muted uppercase tracking-wider">Validator Gateway Account</label>
                    <motion.select
                      whileFocus={{ scale: 1.02 }}
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="w-full bg-pf-surface/80 border border-pf-border/50 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-pf-accent focus:ring-2 focus:ring-pf-accent/20 appearance-none transition-all"
                    >
                      {Object.values(waStatuses).map((acc) => (
                        <option key={acc.id} value={acc.id} disabled={acc.state !== 'ready'}>
                          {acc.name || 'Default'} ({acc.state})
                        </option>
                      ))}
                    </motion.select>
                  </motion.div>
                </div>

                {/* Enhanced Stats row */}
                {displayCounts && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="grid grid-cols-2 sm:grid-cols-4 gap-4"
                  >
                    {[
                      { label: 'Total Uploaded', value: displayCounts.total, color: 'text-white', bg: 'from-pf-surface/50 to-pf-surface/30' },
                      { label: 'Pending', value: displayCounts.pending, color: 'text-pf-warning', bg: 'from-pf-warning/20 to-pf-warning/10' },
                      { label: 'Campaign', value: displayCounts.campaign ?? displayCounts.valid, color: 'text-pf-success', bg: 'from-pf-success/20 to-pf-success/10' },
                      { label: 'Excluded', value: displayCounts.excluded ?? (displayCounts.invalid + displayCounts.error), color: 'text-pf-text-dim', bg: 'from-pf-surface/50 to-pf-surface/30' },
                    ].map(({ label, value, color, bg }, index) => (
                      <motion.div
                        key={label}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3 + index * 0.05 }}
                        whileHover={{ scale: 1.05, y: -2 }}
                        className={`bg-gradient-to-br ${bg} border border-pf-border/30 rounded-2xl p-4 text-center shadow-lg`}
                      >
                        <motion.p
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 2, repeat: Infinity, delay: index * 0.2 }}
                          className={`text-2xl font-bold ${color}`}
                        >
                          {value}
                        </motion.p>
                        <p className="text-[10px] text-pf-text-muted uppercase font-bold tracking-wider mt-1">{label}</p>
                      </motion.div>
                    ))}
                  </motion.div>
                )}

                {/* Enhanced Real-time progress bar */}
                {validationProgress && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-br from-pf-surface-light to-pf-surface border border-pf-accent/30 rounded-2xl p-5 space-y-4 shadow-lg shadow-pf-accent/20"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-pf-text-muted font-bold">
                        Filtering targets: <span className="text-white">{validationProgress.current}</span> / <span className="text-white">{validationProgress.total}</span>
                      </span>
                      <div className="flex items-center gap-2 font-mono">
                        <span className={validationProgress.valid ? 'text-pf-success font-bold text-lg' : 'text-pf-error'}>
                          {validationProgress.digits}
                        </span>
                        <motion.div
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className={`w-3 h-3 rounded-full ${validationProgress.valid ? 'bg-pf-success shadow-lg shadow-pf-success/50' : 'bg-pf-error'}`}
                        />
                      </div>
                    </div>
                    <div className="w-full bg-pf-bg/80 h-4 rounded-full overflow-hidden p-[2px] border border-pf-border/40 relative">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-pf-accent via-pf-info to-pf-accent-glow relative shadow-lg"
                        initial={{ width: '0%' }}
                        animate={{ width: `${(validationProgress.current / validationProgress.total) * 100}%` }}
                        transition={{ type: 'spring', stiffness: 50, damping: 15, mass: 0.8 }}
                      >
                        {/* High-fidelity moving sheen highlight */}
                        <motion.div
                          animate={{ x: ['-100%', '100%'] }}
                          transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                        />
                      </motion.div>
                    </div>
                  </motion.div>
                )}

                {lastValidationResult && !validationProgress && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-gradient-to-r from-pf-success/20 to-pf-success/10 border border-pf-success/40 rounded-2xl p-5 text-pf-success text-sm flex items-center gap-3 shadow-lg shadow-pf-success/20"
                  >
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 0.5, repeat: Infinity }}
                      className="w-8 h-8 rounded-full bg-pf-success/30 flex items-center justify-center"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                    </motion.div>
                    <span className="font-bold">Live check cycle completed successfully. All target filters applied.</span>
                  </motion.div>
                )}

                {valError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-pf-error/15 border border-pf-error/30 text-pf-error text-sm rounded-2xl flex items-center gap-3"
                  >
                    <XCircle className="w-5 h-5" />
                    {valError}
                  </motion.div>
                )}

                <div className="flex items-center gap-6">
                  <div className="flex-1 space-y-2">
                    <label className="block text-[10px] font-bold text-pf-text-dim uppercase tracking-wider">Concurrency (Workers): <span className="text-pf-accent">{concurrency}</span></label>
                    <motion.input
                      whileFocus={{ scale: 1.02 }}
                      type="range"
                      min={1}
                      max={5}
                      value={concurrency}
                      onChange={(e) => setConcurrency(Number(e.target.value))}
                      className="w-full accent-pf-accent h-2 bg-pf-bg rounded-xl appearance-none cursor-pointer"
                    />
                    <p className="text-[10px] text-pf-text-dim">
                      Use lower concurrency for safer WhatsApp validation throughput.
                    </p>
                  </div>

                  {lastValidationResult && !validationProgress && (
                    <motion.button
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setStep(4)}
                      className="px-8 py-4 rounded-2xl font-bold flex items-center gap-3 bg-gradient-to-r from-pf-accent to-pf-accent-glow text-white shadow-lg shadow-pf-accent/30 transition-all hover:from-pf-accent-glow hover:to-pf-accent"
                    >
                      Continue to Action Hub <ArrowRight className="w-5 h-5" />
                    </motion.button>
                  )}

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleStartValidation}
                    disabled={valLoading || !activeWASessionReady || !selectedDatasetId || (displayCounts && displayCounts.pending === 0)}
                    className="px-8 py-4 rounded-2xl font-bold flex items-center gap-3 bg-gradient-to-r from-pf-accent to-pf-accent-glow text-white shadow-lg shadow-pf-accent/30 disabled:opacity-50 transition-all"
                  >
                    {valLoading ? <Loader2 className="w-5 h-5 animate-spin" /> :
                     validationProgress ? <><Clock className="w-5 h-5 animate-pulse" /> Validating...</> :
                     <><Play className="w-5 h-5" /> Run Validator</>}
                  </motion.button>
                </div>
              </div>
            )}

            {/* ─── STEP 4: ACTION HUB ─── */}
            {step === 4 && (
              <div className="space-y-8">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="space-y-2"
                >
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <motion.div
                      animate={{ rotate: [0, -10, 10, 0] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="w-8 h-8 rounded-xl bg-gradient-to-br from-pf-accent to-pf-accent-glow flex items-center justify-center"
                    >
                      <Send className="w-4 h-4 text-white" />
                    </motion.div>
                    Broadcast Campaign Launchpad
                  </h3>
                  <p className="text-sm text-pf-text-muted">Target list validated. Instantly dispatch bulk messages or export dataset profiles</p>
                </motion.div>

                {/* Enhanced Pre-selected Dataset Details Card */}
                {selectedDatasetData && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                    whileHover={{ scale: 1.01, y: -2 }}
                    className="bg-gradient-to-br from-pf-surface-light to-pf-surface border border-pf-border/50 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-lg"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <motion.div
                          animate={{ rotate: [0, 360] }}
                          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                          className="w-10 h-10 rounded-xl bg-gradient-to-br from-pf-accent to-pf-accent-glow flex items-center justify-center shadow-lg shadow-pf-accent/30"
                        >
                          <Database className="w-5 h-5 text-white" />
                        </motion.div>
                        <span className="font-bold text-base text-white">{selectedDatasetData.name}</span>
                      </div>
                      <div className="flex items-center gap-6 text-sm text-pf-text-muted font-medium">
                        <span>Total uploaded: <strong className="text-white">{displayCounts?.total || 0}</strong></span>
                        <span>Verified Active: <strong className="text-pf-success">{currentValValid}</strong></span>
                      </div>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleDownloadCSV}
                      className="flex items-center gap-2 text-sm font-bold bg-gradient-to-r from-pf-surface to-pf-surface-light border border-pf-border hover:border-pf-accent text-white px-6 py-3 rounded-xl transition-all shadow-md hover:shadow-lg"
                    >
                      <Download className="w-5 h-5" /> Download CSV
                    </motion.button>
                  </motion.div>
                )}

                {/* Enhanced Big Action cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* WhatsApp Broadcast */}
                  <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    whileHover={{ scale: 1.03, y: -4 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleLaunchCampaign('whatsapp')}
                    disabled={currentValValid === 0}
                    className="glass-panel text-left p-8 rounded-3xl hover:border-pf-success transition-all group flex flex-col justify-between space-y-6 disabled:opacity-40 disabled:pointer-events-none shadow-lg hover:shadow-2xl hover:shadow-pf-success/20"
                  >
                    <div className="space-y-4">
                      <motion.div
                        whileHover={{ rotate: 5, scale: 1.1 }}
                        className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pf-success/30 to-pf-success/20 flex items-center justify-center border border-pf-success/40 group-hover:shadow-lg group-hover:shadow-pf-success/30 transition-all"
                      >
                        <Smartphone className="w-7 h-7 text-pf-success" />
                      </motion.div>
                      <div className="space-y-2">
                        <h4 className="font-bold text-white text-lg">WhatsApp Rotated Broadcast</h4>
                        <p className="text-sm text-pf-text-muted font-medium leading-relaxed">
                          Send automated anti-ban templates using rotation pools to bypass restrictions.
                        </p>
                      </div>
                    </div>
                    <motion.span
                      whileHover={{ x: 5 }}
                      className="text-sm text-pf-success font-bold flex items-center gap-2 mt-2"
                    >
                      Configure Campaign <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </motion.span>
                  </motion.button>

                  {/* SMS gateway */}
                  <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    whileHover={{ scale: 1.03, y: -4 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleLaunchCampaign('sms')}
                    disabled={currentValValid === 0}
                    className="glass-panel text-left p-8 rounded-3xl hover:border-pf-info transition-all group flex flex-col justify-between space-y-6 disabled:opacity-40 disabled:pointer-events-none shadow-lg hover:shadow-2xl hover:shadow-pf-info/20"
                  >
                    <div className="space-y-4">
                      <motion.div
                        whileHover={{ rotate: -5, scale: 1.1 }}
                        className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pf-info/30 to-pf-info/20 flex items-center justify-center border border-pf-info/40 group-hover:shadow-lg group-hover:shadow-pf-info/30 transition-all"
                      >
                        <MessageSquare className="w-7 h-7 text-pf-info" />
                      </motion.div>
                      <div className="space-y-2">
                        <h4 className="font-bold text-white text-lg">TextBee SMS Blast</h4>
                        <p className="text-sm text-pf-text-muted font-medium leading-relaxed">
                          Dispatch direct high-capacity texts through linked cellular gateway APIs.
                        </p>
                      </div>
                    </div>
                    <motion.span
                      whileHover={{ x: 5 }}
                      className="text-sm text-pf-info font-bold flex items-center gap-2 mt-2"
                    >
                      Configure Campaign <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </motion.span>
                  </motion.button>
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      </div>
    </div>
  )
}

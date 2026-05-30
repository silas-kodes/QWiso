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
  Sparkles,
  Database,
  QrCode
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
  { number: 1, label: 'Link Gateway', desc: 'Connect WhatsApp accounts', icon: Smartphone },
  { number: 2, label: 'Generator', desc: 'Create phone number lists', icon: Zap },
  { number: 3, label: 'Validator', desc: 'Check WhatsApp numbers', icon: Shield },
  { number: 4, label: 'Action Hub', desc: 'Launch rotated campaigns', icon: Send },
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
    <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-8 border border-pf-border/40 relative overflow-hidden">
      
      {/* Decorative Glowing Backdrop */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-pf-accent/5 rounded-full filter blur-[100px] -z-10 pointer-events-none" />

      {/* ─── Header & Switch Info ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-pf-accent animate-pulse" />
            Interactive Funnel Pipeline
          </h2>
          <p className="text-xs text-pf-text-muted mt-1">
            End-to-end guided sequence mapping connections to target campaigns
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Toggle Switch */}
          <div className="flex items-center gap-2.5 bg-pf-surface/60 border border-pf-border/30 px-3.5 py-2 rounded-xl backdrop-blur-sm shadow-sm select-none">
            <span className="text-xs font-semibold text-pf-text-muted">Auto-Advance</span>
            <button
              onClick={toggleAutoAdvance}
              type="button"
              className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors duration-300 relative focus:outline-none focus:ring-1 focus:ring-pf-accent/50 ${
                autoAdvance ? 'bg-pf-accent' : 'bg-pf-bg border border-pf-border/40'
              }`}
              title={autoAdvance ? "Disable auto-advance" : "Enable auto-advance"}
            >
              <motion.div
                className="w-4 h-4 rounded-full shadow-md bg-white"
                layout
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                animate={{ x: autoAdvance ? 14 : 0 }}
              />
            </button>
            <span className={`text-[10px] font-bold uppercase w-8 tracking-wider ${autoAdvance ? 'text-pf-accent' : 'text-pf-text-dim'}`}>
              {autoAdvance ? 'ON' : 'OFF'}
            </span>
          </div>

          {/* Global Auto-Advance Feedback Banner */}
          <AnimatePresence>
          {countdown !== null && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-pf-success/15 border border-pf-success/30 px-4 py-2.5 rounded-xl flex items-center justify-between gap-3 text-xs text-pf-success relative overflow-hidden pb-4"
            >
              <div className="flex items-center gap-2 z-10">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pf-success opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-pf-success"></span>
                </span>
                <span>Auto-advancing step in <strong className="font-bold font-mono text-sm">{countdown}s</strong>...</span>
              </div>
              <button
                onClick={() => {
                  const target = step + 1
                  clearCountdown()
                  if (target <= 4) setStep(target)
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-pf-success/20 text-white font-bold hover:bg-pf-success/30 transition-all z-10"
              >
                Proceed Now <ArrowRight className="w-3.5 h-3.5" />
              </button>
              
              {/* Ticking indicator bar at bottom of countdown banner */}
              <div className="absolute bottom-0 left-0 w-full h-[3px] bg-pf-success/10 overflow-hidden">
                <motion.div 
                  className="h-full bg-pf-success shadow-[0_0_8px_rgba(46,196,182,0.8)]"
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

      {/* ─── Horizontal Stepper ─── */}
      <div className="relative">
        {/* Connecting Progress Line */}
        <div className="absolute top-1/2 left-0 w-full h-[3px] bg-pf-border/30 -translate-y-1/2 -z-10 rounded-full" />
        <motion.div 
          className="absolute top-1/2 left-0 h-[3px] bg-gradient-to-r from-pf-accent via-pf-info to-pf-accent-glow -translate-y-1/2 -z-10 rounded-full shadow-[0_0_8px_rgba(255,107,53,0.5)]"
          initial={{ width: '0%' }}
          animate={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }}
          transition={{ type: 'spring', stiffness: 60, damping: 15 }}
        />

        <div className="grid grid-cols-4 gap-2">
          {STEPS.map((s) => {
            const Icon = s.icon
            const isCompleted = step > s.number
            const isActive = step === s.number
            const isSelectable = s.number <= (readySessionsCount > 0 ? 4 : 2) // Lock step 3-4 if no session is active

            return (
              <button
                key={s.number}
                onClick={() => isSelectable && handleStepClick(s.number)}
                disabled={!isSelectable}
                className="flex flex-col items-center text-center focus:outline-none relative group disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {/* Pulsing Outer Glow for Active Step */}
                {isActive && (
                  <motion.div 
                    className="absolute w-12 h-12 rounded-full bg-pf-accent/15 -z-10 border border-pf-accent/40"
                    layoutId="activeGlow"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ 
                      scale: [1, 1.25, 1], 
                      opacity: [0.4, 0.7, 0.4] 
                    }}
                    transition={{ 
                      scale: { repeat: Infinity, duration: 2.5, ease: 'easeInOut' },
                      opacity: { repeat: Infinity, duration: 2.5, ease: 'easeInOut' },
                      layout: { type: 'spring', stiffness: 80, damping: 15 }
                    }}
                  />
                )}

                <motion.div 
                  animate={{
                    scale: isActive ? 1.15 : 1,
                    y: isActive ? -2 : 0,
                    borderColor: isActive ? '#ff6b35' : isCompleted ? '#2ec4b6' : 'rgba(255,255,255,0.1)',
                  }}
                  transition={{ type: 'spring', stiffness: 120, damping: 14 }}
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                    isActive 
                      ? 'bg-pf-surface text-pf-accent shadow-[0_0_15px_rgba(255,107,53,0.4)]'
                      : isCompleted
                      ? 'bg-pf-success/20 text-pf-success'
                      : 'bg-pf-bg text-pf-text-dim'
                  }`}
                >
                  {isCompleted ? (
                    <motion.div
                      initial={{ scale: 0, rotate: -45 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 150, damping: 10 }}
                    >
                      <CheckCircle className="w-5 h-5" />
                    </motion.div>
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </motion.div>
                
                <span className={`text-[10px] sm:text-xs font-bold mt-3 truncate max-w-full transition-colors duration-300 ${
                  isActive ? 'text-white' : 'text-pf-text-muted group-hover:text-white'
                }`}>
                  {s.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      {/* ─── Step Content Panel (Framer Motion Switcher) ─── */}
      <div className="min-h-[300px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >

            {/* ─── STEP 1: SESSION LINKER ─── */}
            {step === 1 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white">WhatsApp Connection Linker</h3>
                    <p className="text-xs text-pf-text-muted">Link at least one WhatsApp account to establish rotation pools</p>
                  </div>
                  <button
                    onClick={() => setIsAddingAcc(!isAddingAcc)}
                    className="flex items-center gap-1 text-xs font-bold bg-pf-accent/10 border border-pf-accent/30 text-pf-accent px-3 py-1.5 rounded-lg hover:bg-pf-accent/20 transition-all"
                  >
                    {isAddingAcc ? 'Cancel' : <><Plus className="w-3.5 h-3.5" /> Add Account</>}
                  </button>
                </div>

                {/* Account Form */}
                <AnimatePresence>
                  {isAddingAcc && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="p-4 bg-pf-surface-light border border-pf-border rounded-xl space-y-3 overflow-hidden"
                    >
                      <label className="block text-xs font-bold text-pf-text-muted uppercase">Account Identifier</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g. Sales Account Alpha"
                          value={newAccName}
                          onChange={(e) => setNewAccName(e.target.value)}
                          className="flex-1 bg-pf-bg border border-pf-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pf-accent"
                        />
                        <button
                          onClick={handleAddAccount}
                          disabled={!newAccName.trim()}
                          className="btn-accent px-4 py-2 text-sm font-bold disabled:opacity-50"
                        >
                          Create
                        </button>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => { setAuthMethod('qr'); setPhoneError('') }}
                          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                            authMethod === 'qr'
                              ? 'bg-pf-accent/20 text-pf-accent border border-pf-accent/30'
                              : 'bg-pf-bg text-pf-text-muted border border-pf-border/30 hover:border-pf-border/50'
                          }`}
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          QR Code
                        </button>
                        <button
                          onClick={() => { setAuthMethod('pairing'); setPhoneError('') }}
                          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                            authMethod === 'pairing'
                              ? 'bg-pf-accent/20 text-pf-accent border border-pf-accent/30'
                              : 'bg-pf-bg text-pf-text-muted border border-pf-border/30 hover:border-pf-border/50'
                          }`}
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          Phone Number
                        </button>
                      </div>

                      {authMethod === 'pairing' && (
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-bold text-pf-text-muted uppercase">Phone Number</label>
                          <input
                            type="tel"
                            placeholder="+971 50 123 4567"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            className="w-full bg-pf-bg border border-pf-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pf-accent"
                          />
                          {phoneError && <p className="text-[10px] text-pf-error font-medium">{phoneError}</p>}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Accounts List */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.values(waStatuses).length === 0 ? (
                    <div className="col-span-full border border-dashed border-pf-border rounded-2xl p-10 text-center text-pf-text-dim text-xs">
                      <Smartphone className="w-8 h-8 text-pf-text-dim/40 mx-auto mb-2" />
                      No linked accounts. Please click "Add Account" to connect your first instance.
                    </div>
                  ) : (
                    Object.values(waStatuses).map((status) => (
                      <div key={status.id} className="bg-pf-surface/40 border border-pf-border/40 rounded-xl p-4 flex flex-col justify-between space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-white truncate">{status.name || 'Account'}</span>
                          <div className="flex items-center gap-1">
                            <span className={`text-[10px] font-bold uppercase ${status.state === 'ready' ? 'text-pf-success' : 'text-pf-warning'}`}>
                              {status.state}
                            </span>
                            <button
                              onClick={() => handleRemoveAccount(status.id)}
                              className="text-pf-text-dim hover:text-pf-error p-1 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {status.qrCode && status.state === 'qr_ready' && (
                          <div className="bg-white p-3 rounded-lg flex flex-col items-center gap-2 border border-gray-200">
                            <img src={status.qrCode} alt="QR Code" className="w-32 h-32" />
                            <span className="text-[9px] text-gray-500 font-bold uppercase">Scan to Authorize</span>
                          </div>
                        )}

                        {status.pairingCode && status.state === 'pairing' && (
                          <div className="bg-pf-surface/60 p-3 rounded-lg flex flex-col items-center gap-2 border border-pf-accent/30">
                            <div className="p-2 rounded-full bg-pf-accent/20">
                              <Smartphone className="w-5 h-5 text-pf-accent" />
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-[9px] font-bold text-pf-text-muted uppercase tracking-widest">Enter This Code</span>
                              <span className="text-[8px] text-pf-text-dim font-medium">WhatsApp → Linked Devices → Link with phone number</span>
                            </div>
                            <div className="px-5 py-2.5 bg-pf-bg rounded-lg border border-pf-border/30">
                              <span className="font-mono text-xl font-black tracking-[0.15em] text-pf-accent">{status.pairingCode}</span>
                            </div>
                          </div>
                        )}

                        <button
                          onClick={() => status.state === 'ready' ? handleDisconnectAccount(status.id) : handleConnectAccount(status.id)}
                          disabled={status.state === 'connecting' || status.state === 'qr_ready' || status.state === 'pairing' || linkingLoading === status.id}
                          className={`w-full py-2 rounded-lg font-bold text-xs ${
                            status.state === 'ready'
                              ? 'bg-pf-error/15 text-pf-error hover:bg-pf-error/20 border border-pf-error/30'
                              : 'bg-pf-accent text-white hover:bg-pf-accent-glow'
                          } transition-all disabled:opacity-50`}
                        >
                          {linkingLoading === status.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> :
                           status.state === 'ready' ? 'Disconnect' : 'Connect Account'}
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {readySessionsCount > 0 && (
                  <div className="flex justify-end pt-4 border-t border-pf-border/40">
                    <button
                      onClick={() => setStep(2)}
                      className="btn-accent flex items-center gap-1.5 px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-pf-accent/20"
                    >
                      Continue to Generation <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ─── STEP 2: NUMBER GENERATOR ─── */}
            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-bold text-white">List Generation Gateway</h3>
                  <p className="text-xs text-pf-text-muted">Create target customer lists by dial parameters and country codes</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Country Select */}
                  <div>
                    <label className="block text-xs font-bold text-pf-text-muted mb-2 uppercase">Country Profile</label>
                    <div className="relative">
                      <select
                        value={selectedCountry}
                        onChange={(e) => setSelectedCountry(Number(e.target.value))}
                        className="w-full bg-pf-surface border border-pf-border rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-pf-accent appearance-none"
                      >
                        {countries.map((c) => (
                          <option key={c.index} value={c.index}>
                            {c.flag} {c.name} ({c.dial})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pf-text-dim pointer-events-none" />
                    </div>
                  </div>

                  {/* Quantity */}
                  <div>
                    <label className="block text-xs font-bold text-pf-text-muted mb-2 uppercase">List Batch Quantity</label>
                    <input
                      type="number"
                      min={10}
                      max={10000}
                      value={genQuantity}
                      onChange={(e) => setGenQuantity(Math.min(10000, Math.max(10, Number(e.target.value))))}
                      className="w-full bg-pf-surface border border-pf-border rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-pf-accent"
                    />
                  </div>
                </div>

                {/* Checklist options */}
                <div className="flex flex-wrap gap-4 p-3 bg-pf-surface/30 rounded-xl border border-pf-border/40">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-pf-text-muted font-medium">
                    <input
                      type="checkbox"
                      checked={useDial}
                      onChange={(e) => setUseDial(e.target.checked)}
                      className="rounded border-pf-border bg-pf-surface text-pf-accent focus:ring-pf-accent"
                    />
                    Append Dial Code
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-pf-text-muted font-medium">
                    <input
                      type="checkbox"
                      checked={useSpaces}
                      onChange={(e) => setUseSpaces(e.target.checked)}
                      className="rounded border-pf-border bg-pf-surface text-pf-accent focus:ring-pf-accent"
                    />
                    Insert Formatting Spaces
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-pf-text-muted font-medium">
                    <input
                      type="checkbox"
                      checked={localOnly}
                      onChange={(e) => setLocalOnly(e.target.checked)}
                      className="rounded border-pf-border bg-pf-surface text-pf-accent focus:ring-pf-accent"
                    />
                    Local Format Only
                  </label>
                </div>

                {genError && (
                  <div className="p-3 bg-pf-error/10 border border-pf-error/30 text-pf-error text-xs rounded-lg">
                    {genError}
                  </div>
                )}

                {genSuccess && (
                  <div className="p-3 bg-pf-success/15 border border-pf-success/30 text-pf-success text-xs rounded-lg flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    <span>Successfully generated {genSuccess.count} contact targets (Dataset ID: {genSuccess.id.slice(0, 8)})</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleGenerate}
                    disabled={genLoading || countries.length === 0}
                    className="flex-1 bg-gradient-to-r from-pf-accent to-pf-accent-glow hover:from-pf-accent-glow hover:to-pf-accent text-white font-bold py-3 rounded-xl transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {genLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Zap className="w-4 h-4" /> Generate Target List</>}
                  </button>

                  {genSuccess && (
                    <button
                      onClick={() => setStep(3)}
                      className="btn-accent px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-pf-accent/20 transition-all hover:bg-pf-accent-glow"
                    >
                      Continue to Validator <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ─── STEP 3: VALIDATOR ─── */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-bold text-white">Live Filters & Validation</h3>
                  <p className="text-xs text-pf-text-muted">Validate targets using active WhatsApp rotation to eliminate non-active numbers</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Dataset Selector */}
                  <div>
                    <label className="block text-xs font-bold text-pf-text-muted mb-2 uppercase">Target Dataset</label>
                    <select
                      value={selectedDatasetId}
                      onChange={(e) => setSelectedDatasetId(e.target.value)}
                      className="w-full bg-pf-surface border border-pf-border rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-pf-accent appearance-none"
                    >
                      {datasets.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.counts?.pending || 0} pending)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Account Selector */}
                  <div>
                    <label className="block text-xs font-bold text-pf-text-muted mb-2 uppercase">Validator Gateway Account</label>
                    <select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="w-full bg-pf-surface border border-pf-border rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-pf-accent appearance-none"
                    >
                      {Object.values(waStatuses).map((acc) => (
                        <option key={acc.id} value={acc.id} disabled={acc.state !== 'ready'}>
                          {acc.name || 'Default'} ({acc.state})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Stats row */}
                {displayCounts && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Total Uploaded', value: displayCounts.total, color: 'text-white' },
                      { label: 'Pending', value: displayCounts.pending, color: 'text-pf-warning' },
                      { label: 'Campaign', value: displayCounts.campaign ?? displayCounts.valid, color: 'text-pf-success' },
                      { label: 'Excluded', value: displayCounts.excluded ?? (displayCounts.invalid + displayCounts.error), color: 'text-pf-text-dim' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-pf-bg/50 border border-pf-border/30 rounded-xl p-3 text-center">
                        <p className={`text-lg font-bold ${color}`}>{value}</p>
                        <p className="text-[10px] text-pf-text-muted uppercase font-bold tracking-wider">{label}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Real-time progress bar */}
                {validationProgress && (
                  <div className="bg-pf-surface-light border border-pf-accent/20 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-pf-text-muted font-bold">
                        Filtering targets: {validationProgress.current} / {validationProgress.total}
                      </span>
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className={validationProgress.valid ? 'text-pf-success font-bold' : 'text-pf-text-dim'}>
                          {validationProgress.digits}
                        </span>
                        <div className={`w-2 h-2 rounded-full ${validationProgress.valid ? 'bg-pf-success animate-pulse' : 'bg-pf-error'}`} />
                      </div>
                    </div>
                    <div className="w-full bg-pf-bg/80 h-3.5 rounded-full overflow-hidden p-[2px] border border-pf-border/40 relative">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-pf-accent via-pf-info to-pf-accent-glow relative"
                        initial={{ width: '0%' }}
                        animate={{ width: `${(validationProgress.current / validationProgress.total) * 100}%` }}
                        transition={{ type: 'spring', stiffness: 50, damping: 15, mass: 0.8 }}
                      >
                        {/* High-fidelity moving sheen highlight */}
                        <motion.div
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                          animate={{ x: ['-100%', '100%'] }}
                          transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
                        />
                      </motion.div>
                    </div>
                  </div>
                )}

                {lastValidationResult && !validationProgress && (
                  <div className="bg-pf-success/15 border border-pf-success/30 rounded-xl p-4 text-pf-success text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Live check cycle completed successfully. All target filters applied.</span>
                  </div>
                )}

                {valError && (
                  <div className="p-3 bg-pf-error/15 border border-pf-error/30 text-pf-error text-xs rounded-lg">
                    {valError}
                  </div>
                )}

                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-pf-text-dim mb-1 uppercase">Concurrency (Workers): {concurrency}</label>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={concurrency}
                      onChange={(e) => setConcurrency(Number(e.target.value))}
                      className="w-full accent-pf-accent h-1.5 bg-pf-bg rounded-lg appearance-none cursor-pointer"
                    />
                    <p className="mt-2 text-[10px] text-pf-text-dim">
                      Use lower concurrency for safer WhatsApp validation throughput.
                    </p>
                  </div>
                  
                  {lastValidationResult && !validationProgress && (
                    <button
                      onClick={() => setStep(4)}
                      className="btn-accent px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all hover:bg-pf-accent-glow"
                    >
                      Continue to Action Hub <ArrowRight className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    onClick={handleStartValidation}
                    disabled={valLoading || !activeWASessionReady || !selectedDatasetId || (displayCounts && displayCounts.pending === 0)}
                    className="btn-accent px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg disabled:opacity-50"
                  >
                    {valLoading ? <Loader2 className="w-4 h-4 animate-spin" /> :
                     validationProgress ? <><Clock className="w-4 h-4 animate-pulse" /> Validating...</> :
                     <><Play className="w-4 h-4" /> Run Validator</>}
                  </button>
                </div>
              </div>
            )}

            {/* ─── STEP 4: ACTION HUB ─── */}
            {step === 4 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-bold text-white">Broadcast Campaign Launchpad</h3>
                  <p className="text-xs text-pf-text-muted">Target list validated. Instantly dispatch bulk messages or export dataset profiles</p>
                </div>

                {/* Pre-selected Dataset Details Card */}
                {selectedDatasetData && (
                  <div className="bg-pf-surface-light border border-pf-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-pf-accent" />
                        <span className="font-bold text-sm text-white">{selectedDatasetData.name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-pf-text-muted font-medium">
                        <span>Total uploaded: <strong className="text-white">{displayCounts?.total || 0}</strong></span>
                        <span>Verified Active: <strong className="text-pf-success">{currentValValid}</strong></span>
                      </div>
                    </div>
                    
                    <button
                      onClick={handleDownloadCSV}
                      className="flex items-center gap-1.5 text-xs font-bold bg-pf-surface border border-pf-border hover:border-pf-accent text-white px-4 py-2 rounded-lg transition-all"
                    >
                      <Download className="w-4 h-4" /> Download CSV
                    </button>
                  </div>
                )}

                {/* Big Action cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* WhatsApp Broadcast */}
                  <button
                    onClick={() => handleLaunchCampaign('whatsapp')}
                    disabled={currentValValid === 0}
                    className="glass-panel text-left p-5 rounded-2xl hover:border-pf-success transition-all group flex flex-col justify-between space-y-4 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <div className="space-y-2">
                      <div className="w-10 h-10 rounded-xl bg-pf-success/20 flex items-center justify-center border border-pf-success/30 group-hover:scale-105 transition-all">
                        <Smartphone className="w-5 h-5 text-pf-success" />
                      </div>
                      <h4 className="font-bold text-white text-base">WhatsApp Rotated Broadcast</h4>
                      <p className="text-xs text-pf-text-muted font-medium">
                        Send automated anti-ban templates using rotation pools to bypass restrictions.
                      </p>
                    </div>
                    <span className="text-xs text-pf-success font-bold flex items-center gap-1 mt-2">
                      Configure Campaign <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </button>

                  {/* SMS gateway */}
                  <button
                    onClick={() => handleLaunchCampaign('sms')}
                    disabled={currentValValid === 0}
                    className="glass-panel text-left p-5 rounded-2xl hover:border-pf-info transition-all group flex flex-col justify-between space-y-4 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <div className="space-y-2">
                      <div className="w-10 h-10 rounded-xl bg-pf-info/20 flex items-center justify-center border border-pf-info/30 group-hover:scale-105 transition-all">
                        <MessageSquare className="w-5 h-5 text-pf-info" />
                      </div>
                      <h4 className="font-bold text-white text-base">TextBee SMS Blast</h4>
                      <p className="text-xs text-pf-text-muted font-medium">
                        Dispatch direct high-capacity texts through linked cellular gateway APIs.
                      </p>
                    </div>
                    <span className="text-xs text-pf-info font-bold flex items-center gap-1 mt-2">
                      Configure Campaign <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </button>
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

    </div>
  )
}

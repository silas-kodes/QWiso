import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  Play, 
  Loader2, 
  Clock,
  AlertCircle,
  Zap,
  CheckCircle
} from 'lucide-react'
import { useWebSocketStore } from '../stores/websocket'

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

export function ValidationPanel() {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [selectedDataset, setSelectedDataset] = useState('')
  const [selectedAccount, setSelectedAccount] = useState('main')
  const [concurrency, setConcurrency] = useState(5)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  const waStatuses = useWebSocketStore(state => state.waStatuses)
  const validationProgress = useWebSocketStore(state => state.validationProgress)
  const lastValidationResult = useWebSocketStore(state => state.lastValidationResult)

  useEffect(() => {
    fetch('/api/datasets')
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch datasets')
        return r.json()
      })
      .then(data => {
        if (Array.isArray(data)) {
          setDatasets(data)
        } else {
          setDatasets([])
        }
      })
      .catch(err => {
        console.error(err)
        setDatasets([])
      })
  }, [lastValidationResult])

  // Auto-select dataset when list loads
  useEffect(() => {
    if (datasets.length > 0) {
      const exists = datasets.some(d => d.id === selectedDataset)
      if (!exists) {
        setSelectedDataset(datasets[0].id)
      }
    }
  }, [datasets, selectedDataset])

  // Auto-select ready WhatsApp account
  useEffect(() => {
    const accounts = Object.values(waStatuses)
    const activeAccount = waStatuses[selectedAccount]
    if (!activeAccount || activeAccount.state !== 'ready') {
      const readyAccount = accounts.find(acc => acc.state === 'ready')
      if (readyAccount) {
        setSelectedAccount(readyAccount.id)
      } else if (accounts.length > 0 && !selectedAccount) {
        setSelectedAccount(accounts[0].id)
      }
    }
  }, [waStatuses, selectedAccount])

  const handleValidate = async () => {
    if (!selectedDataset || !selectedAccount) return
    
    setLoading(true)
    setError('')
    
    try {
      const res = await fetch('/api/whatsapp/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId: selectedDataset,
          waClientId: selectedAccount,
          concurrency,
          timeoutMs: 30000,
        }),
      })

      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Validation failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start validation')
    } finally {
      setLoading(false)
    }
  }

  const selectedDatasetData = datasets.find(d => d.id === selectedDataset)
  const accounts = Object.values(waStatuses)
  const activeAccount = waStatuses[selectedAccount]
  const isReady = activeAccount?.state === 'ready'
  const liveCounts = validationProgress?.datasetId === selectedDataset
    ? validationProgress.counts
    : undefined
  const displayCounts = liveCounts ?? selectedDatasetData?.counts
  const hasPending = displayCounts && displayCounts.pending > 0

  return (
    <div className="glass-panel rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-pf-success/20 flex items-center justify-center">
          <Zap className="w-5 h-5 text-pf-success" />
        </div>
        <div>
          <h2 className="font-semibold text-white">Validation</h2>
          <p className="text-xs text-pf-text-muted">Check WhatsApp registration status</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Dataset Select */}
        <div>
          <label className="block text-[10px] font-bold text-pf-text-muted mb-2 uppercase tracking-widest">
            Dataset
          </label>
          <select
            value={selectedDataset}
            onChange={(e) => setSelectedDataset(e.target.value)}
            className="w-full bg-pf-surface border border-pf-border rounded-lg py-2.5 px-4 text-sm text-white focus:outline-none focus:border-pf-accent transition-colors"
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.counts?.pending || 0} pending)
              </option>
            ))}
          </select>
        </div>

        {/* Account Select */}
        <div>
          <label className="block text-[10px] font-bold text-pf-text-muted mb-2 uppercase tracking-widest">
            WhatsApp Account
          </label>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="w-full bg-pf-surface border border-pf-border rounded-lg py-2.5 px-4 text-sm text-white focus:outline-none focus:border-pf-accent transition-colors"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id} disabled={acc.state !== 'ready'}>
                {acc.name || 'Default'} ({acc.state})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Concurrency */}
      <div className="mb-6">
        <label className="block text-[10px] font-bold text-pf-text-muted mb-2 uppercase tracking-widest">
          Concurrency: {concurrency}
        </label>
        <input
          type="range"
          min={1}
          max={20}
          value={concurrency}
          onChange={(e) => setConcurrency(Number(e.target.value))}
          className="w-full h-1.5 bg-pf-surface rounded-lg appearance-none cursor-pointer accent-pf-accent"
        />
      </div>

      {/* Status */}
      {displayCounts && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          <div className="bg-pf-surface rounded-lg p-3 text-center border border-pf-border">
            <p className="text-lg font-bold text-white">{displayCounts.total}</p>
            <p className="text-[10px] text-pf-text-muted uppercase font-medium">Total Uploaded</p>
          </div>
          <div className="bg-pf-surface rounded-lg p-3 text-center border border-pf-border">
            <p className="text-lg font-bold text-pf-warning">{displayCounts.pending}</p>
            <p className="text-[10px] text-pf-text-muted uppercase font-medium">Pending</p>
          </div>
          <div className="bg-pf-surface rounded-lg p-3 text-center border border-pf-border">
            <p className="text-lg font-bold text-pf-success">{displayCounts.campaign ?? displayCounts.valid}</p>
            <p className="text-[10px] text-pf-text-muted uppercase font-medium">Campaign</p>
          </div>
          <div className="bg-pf-surface rounded-lg p-3 text-center border border-pf-border">
            <p className="text-lg font-bold text-pf-text-dim">{displayCounts.excluded ?? (displayCounts.invalid + displayCounts.error)}</p>
            <p className="text-[10px] text-pf-text-muted uppercase font-medium">Excluded</p>
          </div>
        </div>
      )}

      {/* Progress */}
      {validationProgress && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 bg-pf-surface rounded-xl border border-pf-accent/20"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-pf-text-muted font-medium">
              Validating: {validationProgress.current} / {validationProgress.total}
            </span>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold ${validationProgress.valid ? 'text-pf-success' : 'text-pf-text-dim'}`}>
                {validationProgress.digits}
              </span>
              <div className={`w-2 h-2 rounded-full ${validationProgress.valid ? 'bg-pf-success animate-pulse' : 'bg-pf-error'}`} />
            </div>
          </div>
          <div className="w-full h-1.5 bg-pf-bg rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-pf-accent shadow-[0_0_10px_rgba(255,107,53,0.5)]"
              initial={{ width: 0 }}
              animate={{ width: `${(validationProgress.current / validationProgress.total) * 100}%` }}
              transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            />
          </div>
        </motion.div>
      )}

      {/* Last Result */}
      {lastValidationResult && !validationProgress && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-6 p-4 bg-pf-success/10 border border-pf-success/30 rounded-xl flex items-center gap-3"
        >
          <div className="w-8 h-8 rounded-full bg-pf-success/20 flex items-center justify-center">
            <CheckCircle className="w-4 h-4 text-pf-success" />
          </div>
          <p className="text-sm font-medium text-pf-success">Validation batch completed successfully</p>
        </motion.div>
      )}

      {/* Validate Button */}
      <button
        onClick={handleValidate}
        disabled={loading || !isReady || !hasPending || !selectedDataset}
        className="w-full bg-pf-accent hover:bg-pf-accent-glow text-white font-bold py-3.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-pf-accent/20"
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : validationProgress ? (
          <>
            <Clock className="w-5 h-5" />
            Validating Batch...
          </>
        ) : (
          <>
            <Play className="w-5 h-5" />
            Start Validation
          </>
        )}
      </button>

      {/* Warnings */}
      {!isReady && activeAccount && (
        <div className="mt-4 p-3 bg-pf-warning/10 border border-pf-warning/30 rounded-lg flex items-center gap-2 text-pf-warning text-[11px] font-medium">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Selected account "{activeAccount.name}" is not ready. Connect it in the session panel.
        </div>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 p-3 bg-pf-error/10 border border-pf-error/30 rounded-lg text-pf-error text-[11px] font-medium"
        >
          {error}
        </motion.div>
      )}
    </div>
  )
}


import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Zap, Loader2, ChevronDown, CheckCircle2 } from 'lucide-react'
import { apiUrl } from '../utils/api'

interface Country {
  index: number
  name: string
  flag: string
  dial: string
  code: string
}

interface GeneratorPanelProps {
  onDatasetCreated?: (id: string) => void
}

export function GeneratorPanel({ onDatasetCreated }: GeneratorPanelProps) {
  const [countries, setCountries] = useState<Country[]>([])
  const [selectedCountry, setSelectedCountry] = useState(0)
  const [quantity, setQuantity] = useState(100)
  const [useDial, setUseDial] = useState(true)
  const [useSpaces, setUseSpaces] = useState(false)
  const [localOnly, setLocalOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ id: string; count: number } | null>(null)

  useEffect(() => {
    fetch(apiUrl('/api/datasets/countries'), { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (Array.isArray(data)) setCountries(data)
      })
      .catch(console.error)
  }, [])

  const handleGenerate = async () => {
    setLoading(true)
    setError('')
    setSuccess(null)

    try {
      const res = await fetch(apiUrl('/api/datasets/generate'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryIndex: selectedCountry,
          quantity,
          useDial,
          useSpaces,
          localOnly,
        }),
      })

      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      setSuccess({ id: data.datasetId, count: data.count })
      onDatasetCreated?.(data.datasetId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-panel rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-pf-accent/20 flex items-center justify-center">
          <Zap className="w-5 h-5 text-pf-accent" />
        </div>
        <div>
          <h2 className="font-semibold text-white">Number Generator</h2>
          <p className="text-xs text-pf-text-muted">Create phone number datasets</p>
        </div>
      </div>

      {/* Country Select */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-pf-text-muted mb-2 uppercase tracking-wider">
          Country
        </label>
        <div className="relative">
          <select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(Number(e.target.value))}
            className="w-full bg-pf-surface border border-pf-border rounded-lg py-3 pl-4 pr-10 text-white appearance-none focus:outline-none focus:border-pf-accent transition-colors"
          >
            {countries.map((c) => (
              <option key={c.index} value={c.index}>
                {c.flag} {c.name} ({c.dial})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-pf-text-dim pointer-events-none" />
        </div>
      </div>

      {/* Quantity */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-pf-text-muted mb-2 uppercase tracking-wider">
          Quantity
        </label>
        <input
          type="number"
          min={1}
          max={10000}
          value={quantity}
          onChange={(e) => setQuantity(Math.min(10000, Math.max(1, Number(e.target.value))))}
          className="w-full bg-pf-surface border border-pf-border rounded-lg py-3 px-4 text-white focus:outline-none focus:border-pf-accent transition-colors"
        />
      </div>

      {/* Options */}
      <div className="flex flex-wrap gap-4 mb-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={useDial}
            onChange={(e) => setUseDial(e.target.checked)}
            className="w-4 h-4 rounded border-pf-border bg-pf-surface text-pf-accent focus:ring-pf-accent"
          />
          <span className="text-sm text-pf-text-muted">Dial code</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={useSpaces}
            onChange={(e) => setUseSpaces(e.target.checked)}
            className="w-4 h-4 rounded border-pf-border bg-pf-surface text-pf-accent focus:ring-pf-accent"
          />
          <span className="text-sm text-pf-text-muted">Spaces</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={localOnly}
            onChange={(e) => setLocalOnly(e.target.checked)}
            className="w-4 h-4 rounded border-pf-border bg-pf-surface text-pf-accent focus:ring-pf-accent"
          />
          <span className="text-sm text-pf-text-muted">Local only</span>
        </label>
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={loading || countries.length === 0}
        className="w-full bg-gradient-to-r from-pf-accent to-pf-accent-glow hover:from-pf-accent-glow hover:to-pf-accent text-white font-semibold py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed glow-accent flex items-center justify-center gap-2"
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            <Zap className="w-5 h-5" />
            Generate {quantity.toLocaleString()} Contacts
          </>
        )}
      </button>

      {/* Success Message */}
      {success && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-4 bg-pf-success/10 border border-pf-success/30 rounded-lg"
        >
          <div className="flex items-center gap-2 text-pf-success">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium">
              Generated {success.count.toLocaleString()} contacts
            </span>
          </div>
          <p className="text-xs text-pf-text-muted mt-1">
            Dataset ID: {success.id.slice(0, 8)}...
          </p>
        </motion.div>
      )}

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-4 bg-pf-error/10 border border-pf-error/30 rounded-lg"
        >
          <p className="text-sm text-pf-error">{error}</p>
        </motion.div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  Database, 
  ChevronRight, 
  CheckCircle2, 
  Clock,
  RefreshCw
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface Dataset {
  id: string
  name: string
  country_code: string
  quantity: number
  created_at: number
  counts?: {
    total: number
    pending: number
    valid: number
    invalid: number
    error: number
  }
}

interface RecentDatasetsProps {
  refreshKey?: number
}

export function RecentDatasets({ refreshKey }: RecentDatasetsProps) {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchDatasets()
  }, [refreshKey])

  const fetchDatasets = async () => {
    try {
      const res = await fetch('/api/datasets?limit=5')
      if (res.ok) {
        const data = await res.json()
        setDatasets(data.slice(0, 5))
      }
    } catch (err) {
      console.error('Failed to fetch datasets:', err)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (dataset: Dataset) => {
    if (!dataset.counts) return null
    
    const { valid, invalid, pending } = dataset.counts
    
    if (pending > 0) {
      return (
        <span className="flex items-center gap-1 text-xs text-pf-warning">
          <Clock className="w-3 h-3" />
          {pending} pending
        </span>
      )
    }
    if (valid > 0 && invalid === 0) {
      return (
        <span className="flex items-center gap-1 text-xs text-pf-success">
          <CheckCircle2 className="w-3 h-3" />
          {valid} valid
        </span>
      )
    }
    return (
      <span className="flex items-center gap-1 text-xs text-pf-success">
        <CheckCircle2 className="w-3 h-3" />
        {valid} valid, {invalid} invalid
      </span>
    )
  }

  if (loading) {
    return (
      <div className="glass-panel rounded-xl p-6">
        <div className="flex items-center justify-center h-32">
          <RefreshCw className="w-6 h-6 text-pf-accent animate-spin" />
        </div>
      </div>
    )
  }

  if (datasets.length === 0) {
    return (
      <div className="glass-panel rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Database className="w-5 h-5 text-pf-accent" />
          <h2 className="text-lg font-semibold text-white">Recent Datasets</h2>
        </div>
        <div className="text-center py-8 text-pf-text-muted">
          <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No datasets yet. Generate your first batch!</p>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-panel rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-pf-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="w-5 h-5 text-pf-accent" />
          <h2 className="text-lg font-semibold text-white">Recent Datasets</h2>
        </div>
        <button
          onClick={() => navigate('/datasets')}
          className="text-sm text-pf-accent hover:text-pf-accent-glow flex items-center gap-1 transition-colors"
        >
          View All
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="divide-y divide-pf-border">
        {datasets.map((dataset, index) => (
          <motion.div
            key={dataset.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => navigate('/datasets')}
            className="px-6 py-4 hover:bg-pf-surface-light/50 cursor-pointer transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{dataset.country_code}</span>
                  <h3 className="font-medium text-white truncate">{dataset.name}</h3>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-pf-text-muted">
                    {dataset.quantity.toLocaleString()} numbers
                  </span>
                  {getStatusBadge(dataset)}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-pf-text-dim group-hover:text-pf-accent transition-colors" />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

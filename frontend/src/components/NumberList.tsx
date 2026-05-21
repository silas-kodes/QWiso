import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  Phone, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Search
} from 'lucide-react'

interface Number {
  id: string
  digits: string
  raw_format: string
  display_format: string
  wa_status: 'pending' | 'valid' | 'invalid' | 'error'
  wa_checked_at?: number
  wa_error?: string
}

interface NumberListProps {
  datasetId: string
  datasetName: string
  onBack: () => void
}

export function NumberList({ datasetId, datasetName, onBack }: NumberListProps) {
  const [numbers, setNumbers] = useState<Number[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'valid' | 'invalid'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const itemsPerPage = 50

  const fetchNumbers = async () => {
    setLoading(true)
    try {
      const statusParam = filter !== 'all' ? `&status=${filter}` : ''
      const res = await fetch(
        `/api/datasets/${datasetId}/numbers?limit=${itemsPerPage}&offset=${(page - 1) * itemsPerPage}${statusParam}`
      )
      if (res.ok) {
        const data = await res.json()
        setNumbers(data)
        // Get total count from headers or estimate
        const countHeader = res.headers.get('X-Total-Count')
        setTotalCount(countHeader ? parseInt(countHeader) : data.length)
      }
    } catch (err) {
      console.error('Failed to fetch numbers:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNumbers()
  }, [datasetId, page, filter])

  const filteredNumbers = searchQuery
    ? numbers.filter(n => 
        n.digits.includes(searchQuery) || 
        n.display_format.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : numbers

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'valid':
        return <CheckCircle2 className="w-4 h-4 text-pf-success" />
      case 'invalid':
        return <XCircle className="w-4 h-4 text-pf-error" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-pf-warning" />
      default:
        return <Clock className="w-4 h-4 text-pf-text-dim" />
    }
  }

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'valid':
        return 'bg-pf-success/10 text-pf-success border-pf-success/20'
      case 'invalid':
        return 'bg-pf-error/10 text-pf-error border-pf-error/20'
      case 'error':
        return 'bg-pf-warning/10 text-pf-warning border-pf-warning/20'
      default:
        return 'bg-pf-surface text-pf-text-muted border-pf-border'
    }
  }

  const totalPages = Math.ceil(totalCount / itemsPerPage)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-pf-surface border border-pf-border text-pf-text-muted hover:text-white hover:border-pf-accent transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-white">{datasetName}</h2>
            <p className="text-sm text-pf-text-muted">
              {totalCount.toLocaleString()} contacts • Page {page} of {Math.max(1, totalPages)}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={fetchNumbers}
            disabled={loading}
            className="p-2 rounded-lg bg-pf-surface border border-pf-border text-pf-text-muted hover:text-white hover:border-pf-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <a
            href={`/api/exports/dataset/${datasetId}/csv`}
            download
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-pf-accent text-white text-sm hover:bg-pf-accent-glow transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </a>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pf-text-dim" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search numbers..."
            className="w-full bg-pf-surface border border-pf-border rounded-lg py-2 pl-10 pr-4 text-white placeholder-pf-text-dim focus:border-pf-accent transition-colors"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'pending', 'valid', 'invalid'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-sm capitalize transition-colors ${
                filter === f
                  ? 'bg-pf-accent text-white'
                  : 'bg-pf-surface border border-pf-border text-pf-text-muted hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Numbers Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 text-pf-accent animate-spin" />
        </div>
      ) : filteredNumbers.length === 0 ? (
        <div className="glass-panel rounded-xl p-12 text-center">
          <Phone className="w-12 h-12 text-pf-text-dim mx-auto mb-4" />
          <p className="text-pf-text-muted">No numbers found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredNumbers.map((number, index) => (
            <motion.div
              key={number.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.02 }}
              className={`glass-panel rounded-lg p-3 border ${getStatusClass(number.wa_status)}`}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">{number.display_format}</p>
                  <p className="text-xs opacity-70">{number.digits}</p>
                </div>
                {getStatusIcon(number.wa_status)}
              </div>
              {number.wa_checked_at && (
                <p className="text-xs mt-2 opacity-60">
                  Checked: {new Date(number.wa_checked_at * 1000).toLocaleDateString()}
                </p>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg bg-pf-surface border border-pf-border text-pf-text-muted hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-pf-text-muted px-3">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-lg bg-pf-surface border border-pf-border text-pf-text-muted hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Database,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  FileSpreadsheet,
  Eye,
  Smartphone,
  MessageSquare,
  Layers
} from 'lucide-react'
import { NumberList } from '../components/NumberList'
import { apiFetch, apiUrl } from '../utils/api'

interface Dataset {
  id: string
  name: string
  country_code: string
  country_name: string
  dial_code: string
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

export function Datasets() {
  const navigate = useNavigate()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null)

  const fetchDatasets = async () => {
    try {
      const data = await apiFetch<Dataset[]>('/api/datasets')
      setDatasets(data)
    } catch (err) {
      console.error('Failed to fetch datasets:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDatasets()
  }, [])

  const deleteDataset = async (id: string) => {
    setDeletingId(id)
    try {
      await apiFetch(`/api/datasets/${id}`, { method: 'DELETE' })
      setDatasets(datasets.filter((d: Dataset) => d.id !== id))
    } catch (err) {
      console.error('Failed to delete dataset:', err)
    } finally {
      setDeletingId(null)
    }
  }

  const exportValidNumbers = async (datasetId: string): Promise<string | null> => {
    try {
      const res = await fetch(apiUrl(`/api/exports/dataset/${datasetId}/valid`), {
        credentials: 'include',
      })
      if (!res.ok) {
        console.error('Export failed:', res.status)
        return null
      }
      return await res.text()
    } catch (e) {
      console.error('Failed to export valid numbers', e)
      return null
    }
  }

  // Show NumberList when a dataset is selected
  if (selectedDataset) {
    return (
      <NumberList
        datasetId={selectedDataset.id}
        datasetName={selectedDataset.name}
        onBack={() => setSelectedDataset(null)}
      />
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="relative"
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pf-accent to-pf-accent-glow flex items-center justify-center shadow-lg">
            <Database className="w-8 h-8 text-white" />
          </div>
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 rounded-2xl bg-pf-accent blur-xl"
          />
        </motion.div>
        <p className="text-pf-text-muted text-sm animate-pulse">Loading datasets...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="relative"
      >
        {/* Background decoration */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-pf-accent/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-pf-info/5 rounded-full blur-3xl" />

        <div className="relative flex items-center justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pf-accent to-pf-accent-glow flex items-center justify-center shadow-lg"
              >
                <Layers className="w-6 h-6 text-white" />
              </motion.div>
              <div>
                <h1 className="text-3xl font-semibold text-white tracking-tight">Datasets</h1>
                <p className="text-pf-text-muted text-sm">
                  {datasets.length} {datasets.length === 1 ? 'dataset' : 'datasets'} available
                </p>
              </div>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={fetchDatasets}
            className="p-3 rounded-xl bg-pf-surface border border-pf-border text-pf-text-muted hover:text-white hover:border-pf-accent hover:bg-pf-surface-light transition-all duration-200 shadow-lg"
          >
            <RefreshCw className="w-5 h-5" />
          </motion.button>
        </div>
      </motion.div>

      {/* Datasets List */}
      {datasets.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="glass-panel rounded-2xl p-16 text-center relative overflow-hidden"
        >
          {/* Animated background */}
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              rotate: [0, 90, 0],
            }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 opacity-5"
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-gradient-to-br from-pf-accent to-pf-info blur-3xl" />
          </motion.div>

          <div className="relative">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-pf-surface to-pf-surface-light flex items-center justify-center shadow-2xl border border-pf-border/50"
            >
              <Database className="w-10 h-10 text-pf-text-dim" />
            </motion.div>
            <motion.h3
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-2xl font-semibold text-white mb-3"
            >
              No datasets yet
            </motion.h3>
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-pf-text-muted text-sm mb-6"
            >
              Generate your first dataset from the Dashboard
            </motion.p>
            <motion.button
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              onClick={() => navigate('/')}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-pf-accent to-pf-accent-glow text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200"
            >
              Go to Dashboard
            </motion.button>
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {datasets.map((dataset, index) => {
            const validationProgress = dataset.counts
              ? (dataset.counts.valid / dataset.counts.total) * 100
              : 0

            return (
              <motion.div
                key={dataset.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08, duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                whileHover={{ scale: 1.02, y: -2 }}
                className="glass-panel rounded-2xl p-6 relative overflow-hidden group"
              >
                {/* Hover glow effect */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-pf-accent/0 via-pf-accent/5 to-pf-accent/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  initial={{ x: '-100%' }}
                  whileHover={{ x: '100%' }}
                  transition={{ duration: 0.8 }}
                />

                <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  {/* Info */}
                  <div className="flex items-start gap-5 flex-1">
                    <motion.div
                      whileHover={{ rotate: 5, scale: 1.1 }}
                      transition={{ type: "spring", stiffness: 300 }}
                      className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pf-surface to-pf-surface-light flex items-center justify-center flex-shrink-0 shadow-lg border border-pf-border/50"
                    >
                      <FileSpreadsheet className="w-7 h-7 text-pf-accent" />
                    </motion.div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-2">{dataset.name}</h3>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-pf-text-muted">
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4" />
                          {new Date(dataset.created_at * 1000).toLocaleDateString()}
                        </span>
                        <span className="text-pf-border">•</span>
                        <span className="flex items-center gap-1.5">
                          <Database className="w-4 h-4" />
                          {dataset.quantity.toLocaleString()} contacts
                        </span>
                        <span className="text-pf-border">•</span>
                        <span className="px-2 py-1 rounded-lg bg-pf-surface-light text-xs font-medium">
                          {dataset.dial_code}
                        </span>
                      </div>

                      {/* Validation progress bar */}
                      {dataset.counts && (
                        <div className="mt-4 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-pf-text-muted">Validation Progress</span>
                            <span className="text-pf-accent font-medium">
                              {Math.round(validationProgress)}%
                            </span>
                          </div>
                          <div className="h-2 bg-pf-surface rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${validationProgress}%` }}
                              transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
                              className="h-full bg-gradient-to-r from-pf-accent to-pf-accent-glow rounded-full"
                            />
                          </div>

                          {/* Status counts */}
                          <div className="flex items-center gap-4 mt-3">
                            <motion.div
                              whileHover={{ scale: 1.05 }}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-pf-success/10 border border-pf-success/20"
                            >
                              <CheckCircle2 className="w-4 h-4 text-pf-success" />
                              <span className="text-sm font-medium text-pf-success">
                                {dataset.counts.valid?.toLocaleString() ?? '0'}
                              </span>
                            </motion.div>
                            <motion.div
                              whileHover={{ scale: 1.05 }}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-pf-error/10 border border-pf-error/20"
                            >
                              <XCircle className="w-4 h-4 text-pf-error" />
                              <span className="text-sm font-medium text-pf-error">
                                {dataset.counts.invalid?.toLocaleString() ?? '0'}
                              </span>
                            </motion.div>
                            <motion.div
                              whileHover={{ scale: 1.05 }}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-pf-warning/10 border border-pf-warning/20"
                            >
                              <Clock className="w-4 h-4 text-pf-warning" />
                              <span className="text-sm font-medium text-pf-warning">
                                {dataset.counts.pending?.toLocaleString() ?? '0'}
                              </span>
                            </motion.div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 lg:gap-3">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setSelectedDataset(dataset)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-pf-surface border border-pf-border text-sm text-pf-text-muted hover:text-white hover:border-pf-accent hover:bg-pf-surface-light transition-all duration-200"
                    >
                      <Eye className="w-4 h-4" />
                      <span className="hidden sm:inline">View</span>
                    </motion.button>

                    {dataset.counts && dataset.counts.valid > 0 && (
                      <>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={async () => {
                            const text = await exportValidNumbers(dataset.id)
                            if (text) navigate('/sms', { state: { numbers: text } })
                          }}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-pf-accent/10 border border-pf-accent/30 text-sm text-pf-accent hover:bg-pf-accent/20 hover:border-pf-accent transition-all duration-200"
                        >
                          <MessageSquare className="w-4 h-4" />
                          <span className="hidden sm:inline">Push SMS</span>
                        </motion.button>

                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={async () => {
                            const text = await exportValidNumbers(dataset.id)
                            if (text) navigate('/whatsapp-launcher', { state: { numbers: text } })
                          }}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-pf-success/10 border border-pf-success/30 text-sm text-pf-success hover:bg-pf-success/20 hover:border-pf-success transition-all duration-200"
                        >
                          <Smartphone className="w-4 h-4" />
                          <span className="hidden sm:inline">Push WA</span>
                        </motion.button>
                      </>
                    )}

                    <motion.a
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      href={apiUrl(`/api/exports/dataset/${dataset.id}/csv`)}
                      download
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-pf-surface-light border border-pf-border text-sm text-pf-text-muted hover:text-white hover:border-pf-accent transition-all duration-200"
                    >
                      <Download className="w-4 h-4" />
                      <span className="hidden sm:inline">CSV</span>
                    </motion.a>
                    <motion.a
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      href={apiUrl(`/api/exports/dataset/${dataset.id}/valid`)}
                      download
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-pf-surface-light border border-pf-border text-sm text-pf-text-muted hover:text-white hover:border-pf-accent transition-all duration-200"
                    >
                      <CheckCircle2 className="w-4 h-4 text-pf-success" />
                      <span className="hidden sm:inline">Valid</span>
                    </motion.a>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => deleteDataset(dataset.id)}
                      disabled={deletingId === dataset.id}
                      className="p-2.5 rounded-xl bg-pf-surface-light border border-pf-border text-pf-text-muted hover:text-pf-error hover:border-pf-error transition-all duration-200 disabled:opacity-50"
                    >
                      {deletingId === dataset.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

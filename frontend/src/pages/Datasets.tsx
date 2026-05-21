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
  MessageSquare
} from 'lucide-react'
import { NumberList } from '../components/NumberList'

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
      const res = await fetch('/api/datasets')
      if (res.ok) {
        const data = await res.json()
        setDatasets(data)
      }
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
      const res = await fetch(`/api/datasets/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setDatasets(datasets.filter((d: Dataset) => d.id !== id))
      }
    } catch (err) {
      console.error('Failed to delete dataset:', err)
    } finally {
      setDeletingId(null)
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
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-pf-accent animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Datasets</h1>
          <p className="text-pf-text-muted text-sm">
            Manage your verified contact datasets
          </p>
        </div>
        <button
          onClick={fetchDatasets}
          className="p-2 rounded-lg bg-pf-surface border border-pf-border text-pf-text-muted hover:text-white hover:border-pf-accent transition-colors"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </motion.div>

      {/* Datasets List */}
      {datasets.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-panel rounded-xl p-12 text-center"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-pf-surface-light flex items-center justify-center">
            <Database className="w-8 h-8 text-pf-text-dim" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No datasets yet</h3>
          <p className="text-pf-text-muted text-sm mb-4">
            Generate your first dataset from the Dashboard
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {datasets.map((dataset, index) => (
            <motion.div
              key={dataset.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="glass-panel rounded-xl p-4 sm:p-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Info */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-pf-surface-light flex items-center justify-center flex-shrink-0">
                    <FileSpreadsheet className="w-6 h-6 text-pf-accent" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{dataset.name}</h3>
                    <div className="flex items-center gap-3 text-xs text-pf-text-muted mt-1">
                      <span>{new Date(dataset.created_at * 1000).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>{dataset.quantity.toLocaleString()} contacts</span>
                      <span>•</span>
                      <span>{dataset.dial_code}</span>
                    </div>
                    
                    {/* Status counts */}
                    {dataset.counts && (
                      <div className="flex items-center gap-3 mt-2">
                        <span className="flex items-center gap-1 text-xs text-pf-success">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {dataset.counts.valid?.toLocaleString() ?? '0'}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-pf-text-dim">
                          <XCircle className="w-3.5 h-3.5" />
                          {dataset.counts.invalid?.toLocaleString() ?? '0'}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-pf-warning">
                          <Clock className="w-3.5 h-3.5" />
                          {dataset.counts.pending?.toLocaleString() ?? '0'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setSelectedDataset(dataset)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-pf-surface border border-pf-border text-sm text-pf-text-muted hover:text-white hover:border-pf-accent transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    <span className="hidden sm:inline">View</span>
                  </button>

                  {dataset.counts && dataset.counts.valid > 0 && (
                    <>
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/exports/dataset/${dataset.id}/valid`);
                            if (res.ok) {
                              const text = await res.text();
                              navigate('/sms', { state: { numbers: text } });
                            }
                          } catch (e) {
                            console.error('Failed to export valid numbers for SMS', e);
                          }
                        }}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-pf-accent/10 border border-pf-accent/30 text-sm text-pf-accent hover:bg-pf-accent/20 hover:border-pf-accent transition-colors"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span className="hidden sm:inline">Push SMS</span>
                      </button>

                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/exports/dataset/${dataset.id}/valid`);
                            if (res.ok) {
                              const text = await res.text();
                              navigate('/whatsapp-launcher', { state: { numbers: text } });
                            }
                          } catch (e) {
                            console.error('Failed to export valid numbers for WhatsApp', e);
                          }
                        }}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-pf-success/10 border border-pf-success/30 text-sm text-pf-success hover:bg-pf-success/20 hover:border-pf-success transition-colors"
                      >
                        <Smartphone className="w-4 h-4" />
                        <span className="hidden sm:inline">Push WA</span>
                      </button>
                    </>
                  )}

                  <a
                    href={`/api/exports/dataset/${dataset.id}/csv`}
                    download
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-pf-surface-light border border-pf-border text-sm text-pf-text-muted hover:text-white hover:border-pf-accent transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">CSV</span>
                  </a>
                  <a
                    href={`/api/exports/dataset/${dataset.id}/valid`}
                    download
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-pf-surface-light border border-pf-border text-sm text-pf-text-muted hover:text-white hover:border-pf-accent transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4 text-pf-success" />
                    <span className="hidden sm:inline">Valid</span>
                  </a>
                  <button
                    onClick={() => deleteDataset(dataset.id)}
                    disabled={deletingId === dataset.id}
                    className="p-2 rounded-lg bg-pf-surface-light border border-pf-border text-pf-text-muted hover:text-pf-error hover:border-pf-error transition-colors disabled:opacity-50"
                  >
                    {deletingId === dataset.id ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

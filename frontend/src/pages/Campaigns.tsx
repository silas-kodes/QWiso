import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { 
  Send, 
  Play, 
  Pause, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Smartphone, 
  MessageSquare, 
  AlertCircle, 
  RefreshCw,
  Sliders,
  Sparkles,
  Search,
  BookOpen
} from 'lucide-react'
import { useWebSocketStore } from '../stores/websocket'
import { apiFetch, apiUrl } from '../utils/api'

interface Dataset {
  id: string
  name: string
  quantity: number
}

interface Campaign {
  id: string
  name: string
  dataset_id: string
  dataset_name: string
  platform: 'whatsapp' | 'sms'
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed'
  total_contacts: number
  sent_contacts: number
  failed_contacts: number
  max_messages?: number
  rate_per_hour: number
  created_at: number
}

export function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Form states
  const [name, setName] = useState('')
  const [datasetId, setDatasetId] = useState('')
  const [platform, setPlatform] = useState<'whatsapp' | 'sms'>('whatsapp')
  const [template, setTemplate] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [maxMessages, setMaxMessages] = useState<number | ''>('')
  const [rateLimitDelay, setRateLimitDelay] = useState(3) // Default 3s delay
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const location = useLocation()

  // Deep-linking state monitor to auto-launch creation modal
  useEffect(() => {
    if (location.state?.showCreateModal) {
      setShowCreateModal(true)
      if (location.state?.datasetId) {
        setDatasetId(location.state.datasetId)
      }
      if (location.state?.platform) {
        setPlatform(location.state.platform as 'whatsapp' | 'sms')
      }
      if (location.state?.campaignName) {
        setName(location.state.campaignName)
      }
    }
  }, [location.state])

  const fileToDataURL = (file: File): Promise<string> => {
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

  const isImageFile = (file: File) => file.type.startsWith('image/')

  const resetImage = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview)
    }
    setImageFile(null)
    setImagePreview(null)
    setImageError(null)
  }

  const handleImageUpload = (file: File | null) => {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageError(null)

    if (!file) {
      resetImage()
      return
    }

    if (!isImageFile(file)) {
      setImageError('Please upload a valid image file.')
      resetImage()
      return
    }

    if (file.size > 8 * 1024 * 1024) {
      setImageError('Image must be smaller than 8MB.')
      resetImage()
      return
    }

    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  // Real-time states from WebSocket Store
  const wsCampaignProgress = useWebSocketStore((state) => state.campaignProgress)
  const wsCampaignStatuses = useWebSocketStore((state) => state.campaignStatuses)

  const fetchData = async () => {
    try {
      const [campData, datasetData] = await Promise.all([
        apiFetch<Campaign[]>('/api/campaigns'),
        apiFetch<Dataset[]>('/api/datasets'),
      ])
      setCampaigns(campData)
      setDatasets(datasetData)
    } catch (err) {
      console.error('Failed to fetch campaigns or datasets:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Create Campaign
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !datasetId || (!template && !imageFile)) {
      setError('Please fill in all required fields or attach an image for WhatsApp campaigns.')
      return
    }

    if (platform === 'sms' && !template) {
      setError('SMS campaigns require a text template.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const payload: Record<string, unknown> = {
        name,
        dataset_id: datasetId,
        platform,
        message_template: template,
        rate_per_hour: Math.round(3600 / Number(rateLimitDelay)),
      }

      if (platform === 'whatsapp' && imageFile) {
        payload.image = {
          data: await fileToDataURL(imageFile),
          mimeType: imageFile.type,
          filename: imageFile.name,
        }
      }

      const newCamp = await apiFetch<Campaign>('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      const ds = datasets.find(d => d.id === datasetId)
      newCamp.dataset_name = ds ? ds.name : 'Unknown Dataset'
      newCamp.total_contacts = 0
      newCamp.sent_contacts = 0
      newCamp.failed_contacts = 0
      setCampaigns([newCamp, ...campaigns])
      setShowCreateModal(false)
      resetForm()
    } catch (err) {
      setError('A network error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setName('')
    setDatasetId('')
    setPlatform('whatsapp')
    setTemplate('')
    resetImage()
    setMaxMessages('')
    setRateLimitDelay(3)
    setError(null)
  }

  // Delete Campaign
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign? All history will be lost.')) return

    try {
      await apiFetch(`/api/campaigns/${id}`, { method: 'DELETE' })
      setCampaigns(campaigns.filter(c => c.id !== id))
    } catch (err) {
      console.error('Failed to delete campaign:', err)
    }
  }

  // Start Campaign
  const handleStart = async (id: string) => {
    console.log('[Campaigns] Start clicked:', id)
    try {
      const res = await apiFetch<{ success?: boolean; message?: string; error?: string }>(`/api/campaigns/${id}/start`, {
        method: 'POST',
      })
      console.log('[Campaigns] Start success:', res)
      setCampaigns(campaigns.map(c => c.id === id ? { ...c, status: 'running' } : c))
      setError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start campaign'
      console.error('[Campaigns] Start failed:', msg)
      setError(msg)
    }
  }

  // Pause Campaign
  const handlePause = async (id: string) => {
    try {
      const res = await fetch(apiUrl(`/api/campaigns/${id}/pause`), { method: 'POST', credentials: 'include' })
      if (res.ok) {
        setCampaigns(campaigns.map(c => c.id === id ? { ...c, status: 'paused' } : c))
      }
    } catch (err) {
      console.error('Failed to pause campaign:', err)
    }
  }

  // Merge database states with WebSocket updates
  const getDisplayCampaign = (c: Campaign): Campaign => {
    const wsProg = wsCampaignProgress[c.id]
    const wsStat = wsCampaignStatuses[c.id]

    return {
      ...c,
      status: (wsStat as any) || c.status,
      sent_contacts: wsProg ? wsProg.sentCount : c.sent_contacts,
      failed_contacts: wsProg ? wsProg.failedCount : c.failed_contacts,
      total_contacts: wsProg ? wsProg.totalContacts : c.total_contacts
    }
  }

  const filteredCampaigns = campaigns
    .map(getDisplayCampaign)
    .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <RefreshCw className="w-8 h-8 text-pf-accent animate-spin" />
        <span className="text-sm text-pf-text-muted">Loading campaigns...</span>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Dynamic Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
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

      <div className="space-y-8">
        {/* Enhanced Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6"
        >
          <div className="space-y-2">
            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="text-3xl font-bold text-white flex items-center gap-3"
            >
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pf-accent to-pf-accent-glow flex items-center justify-center shadow-lg shadow-pf-accent/30"
              >
                <Send className="w-6 h-6 text-white" />
              </motion.div>
              Campaigns
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="text-pf-text-muted text-sm"
            >
              Launch anti-ban resilient text & WhatsApp broadcasting campaigns
            </motion.p>
          </div>
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { setShowCreateModal(true); setError(null); }}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-pf-accent to-pf-accent-glow text-white font-bold shadow-lg shadow-pf-accent/30 transition-all duration-200"
          >
            <Plus className="w-5 h-5" />
            Create Campaign
          </motion.button>
        </motion.div>

        {/* Enhanced Search and Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col md:flex-row gap-6 items-center justify-between"
        >
          <div className="relative w-full md:max-w-md">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-pf-text-muted" />
            <motion.input
              whileFocus={{ scale: 1.02 }}
              type="text"
              placeholder="Search campaigns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl bg-pf-surface/80 border border-pf-border/50 text-white placeholder-pf-text-muted focus:border-pf-accent focus:ring-2 focus:ring-pf-accent/20 transition-all"
            />
          </div>

          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
              whileHover={{ scale: 1.05, y: -2 }}
              className="px-4 py-2 rounded-xl bg-gradient-to-br from-pf-surface to-pf-surface-light border border-pf-border/50 text-xs text-pf-text-muted flex items-center gap-2 shadow-md"
            >
              <CheckCircle2 className="w-4 h-4 text-pf-success" />
              Completed: {campaigns.filter(c => c.status === 'completed').length}
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 }}
              whileHover={{ scale: 1.05, y: -2 }}
              className="px-4 py-2 rounded-xl bg-gradient-to-br from-pf-surface to-pf-surface-light border border-pf-border/50 text-xs text-pf-text-muted flex items-center gap-2 shadow-md"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              >
                <RefreshCw className="w-4 h-4 text-pf-info" />
              </motion.div>
              Active: {campaigns.filter(c => c.status === 'running').length}
            </motion.div>
          </div>
        </motion.div>

        {/* Enhanced Error banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="p-4 rounded-2xl bg-gradient-to-r from-pf-error/15 to-pf-error/10 border border-pf-error/30 text-pf-error text-sm flex items-start gap-3 shadow-lg"
            >
              <motion.div
                animate={{ rotate: [0, -10, 10, 0] }}
                transition={{ duration: 0.5, repeat: 2 }}
              >
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              </motion.div>
              <span className="flex-1">{error}</span>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setError(null)}
                className="text-pf-error/60 hover:text-pf-error"
              >
                &times;
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Enhanced Campaign List */}
        {filteredCampaigns.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel rounded-3xl p-16 text-center border border-pf-border/30"
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-pf-surface-light to-pf-surface flex items-center justify-center shadow-lg"
            >
              <Send className="w-10 h-10 text-pf-text-dim" />
            </motion.div>
            <h3 className="text-xl font-bold text-white mb-3">No campaigns found</h3>
            <p className="text-pf-text-muted text-sm">
              Create a campaign to automatically message your validated datasets
            </p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {filteredCampaigns.map((camp, index) => {
              const processed = camp.sent_contacts + camp.failed_contacts
              const progress = camp.total_contacts > 0
                ? Math.round((processed / camp.total_contacts) * 100)
                : 0

              const statusColors = {
                pending: 'text-pf-text-muted border-pf-border bg-pf-surface',
                running: 'text-pf-info border-pf-info/30 bg-pf-info/10',
                paused: 'text-pf-warning border-pf-warning/30 bg-pf-warning/10',
                completed: 'text-pf-success border-pf-success/30 bg-pf-success/10',
                failed: 'text-pf-error border-pf-error/30 bg-pf-error/10'
              }[camp.status]

              return (
                <motion.div
                  key={camp.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.01, y: -4 }}
                  layout
                  className="glass-panel rounded-2xl p-6 sm:p-8 transition-all duration-300 shadow-lg hover:shadow-2xl border border-pf-border/30"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                    {/* Info Column */}
                    <div className="space-y-4 flex-1">
                      <div className="flex items-center gap-4 flex-wrap">
                        <h3 className="text-xl font-bold text-white">{camp.name}</h3>
                        <motion.span
                          animate={{ scale: [1, 1.05, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className={`px-3 py-1 rounded-full border text-xs font-bold uppercase ${statusColors}`}
                        >
                          {camp.status}
                        </motion.span>
                        <span className="text-xs text-pf-text-muted flex items-center gap-2 px-3 py-1 rounded-xl bg-pf-surface/50 border border-pf-border/30">
                          {camp.platform === 'whatsapp' ? (
                            <>
                              <Smartphone className="w-4 h-4 text-pf-success" />
                              WhatsApp
                            </>
                          ) : (
                            <>
                              <MessageSquare className="w-4 h-4 text-pf-info" />
                              SMS Gateway
                            </>
                          )}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-pf-text-muted">
                        <span>Dataset: <strong className="text-white">{camp.dataset_name}</strong></span>
                        <span className="text-pf-border/50">•</span>
                        <span>Created: <strong>{new Date(camp.created_at * 1000).toLocaleDateString()}</strong></span>
                        <span className="text-pf-border/50">•</span>
                        <span>Rate limit: <strong>{camp.rate_per_hour}/hour</strong></span>
                      </div>

                      {/* Enhanced Progress details */}
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm font-semibold">
                          <span className="text-pf-text-muted">Broadcast Progress</span>
                          <span className="text-white">{camp.sent_contacts} sent, {camp.failed_contacts} failed / {camp.total_contacts} ({progress}%)</span>
                        </div>
                        <div className="w-full bg-pf-surface/80 rounded-full h-3 overflow-hidden border border-pf-border/40 p-[2px]">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className={`h-full rounded-full relative ${
                              camp.status === 'completed'
                                ? 'bg-gradient-to-r from-pf-success to-pf-success/80'
                                : camp.status === 'failed'
                                ? 'bg-gradient-to-r from-pf-error to-pf-error/80'
                                : 'bg-gradient-to-r from-pf-accent to-pf-accent-glow'
                            }`}
                          >
                            <motion.div
                              animate={{ x: ['-100%', '100%'] }}
                              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                            />
                          </motion.div>
                        </div>
                      </div>
                    </div>

                    {/* Enhanced Actions Column */}
                    <div className="flex items-center gap-4 lg:self-center self-end">
                      {camp.status === 'running' ? (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handlePause(camp.id)}
                          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-pf-warning/20 to-pf-warning/10 border border-pf-warning/30 text-pf-warning hover:from-pf-warning/30 hover:to-pf-warning/20 transition-all text-sm font-bold shadow-md"
                        >
                          <Pause className="w-4 h-4" />
                          Pause
                        </motion.button>
                      ) : (
                        (camp.status === 'pending' || camp.status === 'paused' || camp.status === 'failed') && (
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleStart(camp.id)}
                            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-pf-success/20 to-pf-success/10 border border-pf-success/30 text-pf-success hover:from-pf-success/30 hover:to-pf-success/20 transition-all text-sm font-bold shadow-md"
                          >
                            <Play className="w-4 h-4" />
                            Start
                          </motion.button>
                        )
                      )}

                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleDelete(camp.id)}
                        className="p-3 rounded-xl bg-pf-surface/80 border border-pf-border/50 text-pf-text-muted hover:text-pf-error hover:border-pf-error/40 transition-all shadow-md"
                        title="Delete Campaign"
                      >
                        <Trash2 className="w-5 h-5" />
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {/* Enhanced Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Content */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="glass-panel w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl relative z-10 border border-pf-border/40 max-h-[90vh] flex flex-col"
            >
              <div className="px-8 py-6 border-b border-pf-border/40 flex items-center justify-between bg-gradient-to-r from-pf-surface to-pf-surface-light">
                <motion.h3
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-xl font-bold text-white flex items-center gap-3"
                >
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className="w-10 h-10 rounded-xl bg-gradient-to-br from-pf-accent to-pf-accent-glow flex items-center justify-center shadow-lg shadow-pf-accent/30"
                  >
                    <Sparkles className="w-5 h-5 text-white" />
                  </motion.div>
                  New Anti-Ban Messaging Campaign
                </motion.h3>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowCreateModal(false)}
                  className="text-pf-text-muted hover:text-white transition-colors p-2 rounded-xl hover:bg-pf-surface/50"
                >
                  &times;
                </motion.button>
              </div>

              <form onSubmit={handleCreate} className="p-8 space-y-6 overflow-y-auto flex-1">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-2xl bg-gradient-to-r from-pf-error/15 to-pf-error/10 border border-pf-error/30 text-pf-error text-sm flex items-start gap-3"
                  >
                    <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}

                {/* Campaign Name */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="space-y-2"
                >
                  <label className="text-xs font-bold text-pf-text-muted uppercase tracking-wider">
                    Campaign Name *
                  </label>
                  <motion.input
                    whileFocus={{ scale: 1.01 }}
                    type="text"
                    required
                    placeholder="e.g. QWISO Beta Launch Blast"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-pf-surface/80 border border-pf-border/50 text-white focus:border-pf-accent focus:ring-2 focus:ring-pf-accent/20 transition-all"
                  />
                </motion.div>

                {/* Dataset and Platform */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-6"
                >
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-pf-text-muted uppercase tracking-wider">
                      Target Dataset *
                    </label>
                    <motion.select
                      whileFocus={{ scale: 1.01 }}
                      required
                      value={datasetId}
                      onChange={(e) => setDatasetId(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-pf-surface/80 border border-pf-border/50 text-white focus:border-pf-accent focus:ring-2 focus:ring-pf-accent/20 transition-all appearance-none"
                    >
                      <option value="">Select a dataset</option>
                      {datasets.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.quantity} numbers)
                        </option>
                      ))}
                    </motion.select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-pf-text-muted uppercase tracking-wider">
                      Gateway Platform
                    </label>
                    <div className="grid grid-cols-2 gap-3 mt-1">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        type="button"
                        onClick={() => {
                          setPlatform('whatsapp')
                        }}
                        className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-bold transition-all ${
                          platform === 'whatsapp'
                            ? 'bg-gradient-to-r from-pf-success/20 to-pf-success/10 border-pf-success text-pf-success shadow-lg shadow-pf-success/20'
                            : 'bg-pf-surface/80 border-pf-border/50 text-pf-text-muted hover:text-white'
                        }`}
                      >
                        <Smartphone className="w-4 h-4" />
                        WhatsApp
                      </motion.button>

                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        type="button"
                        onClick={() => {
                          resetImage()
                          setPlatform('sms')
                        }}
                        className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-bold transition-all ${
                          platform === 'sms'
                            ? 'bg-gradient-to-r from-pf-info/20 to-pf-info/10 border-pf-info text-pf-info shadow-lg shadow-pf-info/20'
                            : 'bg-pf-surface/80 border-pf-border/50 text-pf-text-muted hover:text-white'
                        }`}
                      >
                        <MessageSquare className="w-4 h-4" />
                        SMS Gateway
                      </motion.button>
                    </div>
                  </div>
                </motion.div>

                {/* Message Template */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-pf-text-muted uppercase tracking-wider flex items-center gap-1">
                      Message Template
                    </label>
                    <span className="text-[10px] text-pf-text-dim flex items-center gap-1 px-2 py-1 rounded-lg bg-pf-surface/50 border border-pf-border/30">
                      <BookOpen className="w-3 h-3" />
                      Supports: <code>{`{name}`}</code>, <code>{`{phone}`}</code>
                    </span>
                  </div>
                  <motion.textarea
                    whileFocus={{ scale: 1.01 }}
                    rows={4}
                    placeholder="Hello {name}! Thank you for joining QWISO. Best regards!"
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-pf-surface/80 border border-pf-border/50 text-white focus:border-pf-accent focus:ring-2 focus:ring-pf-accent/20 transition-all font-mono text-sm resize-none"
                  />
                  <p className="text-[10px] text-pf-text-dim">
                    Required for SMS. WhatsApp campaigns may omit this if an image is attached.
                  </p>
                </motion.div>

                {platform === 'whatsapp' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-pf-text-muted uppercase tracking-wider">
                        WhatsApp Image Attachment
                      </label>
                      {imageFile && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          type="button"
                          onClick={resetImage}
                          className="text-[10px] text-pf-accent hover:text-white px-3 py-1 rounded-lg bg-pf-accent/10 border border-pf-accent/30"
                        >
                          Remove
                        </motion.button>
                      )}
                    </div>
                    <motion.input
                      whileFocus={{ scale: 1.01 }}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e.target.files?.[0] ?? null)}
                      className="w-full text-sm text-pf-text-muted"
                    />
                    {imageError && <p className="text-xs text-pf-error">{imageError}</p>}
                    {imagePreview && (
                      <motion.img
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        src={imagePreview}
                        alt="Campaign image preview"
                        className="mt-3 rounded-2xl border border-pf-border/50 max-h-48 object-contain shadow-lg"
                      />
                    )}
                  </motion.div>
                )}

                {/* Advanced Rate Limits */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="border-t border-pf-border/40 pt-6"
                >
                  <h4 className="text-xs font-bold text-pf-accent uppercase tracking-wider mb-4 flex items-center gap-2">
                    <motion.div
                      animate={{ rotate: [0, 360] }}
                      transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    >
                      <Sliders className="w-4 h-4" />
                    </motion.div>
                    Anti-Ban / Rate Limiting Controls
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-pf-text-muted uppercase tracking-wider">
                        Max Broadcasts (Optional)
                      </label>
                      <motion.input
                        whileFocus={{ scale: 1.01 }}
                        type="number"
                        placeholder="Leave empty for all contacts"
                        value={maxMessages}
                        onChange={(e) => setMaxMessages(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-4 py-3 rounded-xl bg-pf-surface/80 border border-pf-border/50 text-white focus:border-pf-accent focus:ring-2 focus:ring-pf-accent/20 transition-all"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <label className="text-xs font-bold text-pf-text-muted uppercase tracking-wider">
                          Inter-Message Delay *
                        </label>
                        <span className="text-xs font-bold text-pf-accent">{rateLimitDelay} seconds</span>
                      </div>
                      <motion.input
                        whileFocus={{ scale: 1.01 }}
                        type="range"
                        min={1}
                        max={30}
                        value={rateLimitDelay}
                        onChange={(e) => setRateLimitDelay(Number(e.target.value))}
                        className="w-full mt-2 accent-pf-accent h-2 bg-pf-bg rounded-xl appearance-none cursor-pointer"
                      />
                      <span className="text-[10px] text-pf-text-dim block mt-1">
                        Longer delays simulate authentic human interactions, minimizing ban risks.
                      </span>
                    </div>
                  </div>
                </motion.div>

                {/* Enhanced Footer Controls */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="flex items-center justify-end gap-4 pt-6 border-t border-pf-border/40"
                >
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-6 py-3 rounded-xl bg-pf-surface/80 border border-pf-border/50 text-pf-text-muted hover:text-white transition-all font-semibold"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={submitting}
                    className="px-8 py-3 rounded-xl bg-gradient-to-r from-pf-accent to-pf-accent-glow hover:from-pf-accent-glow hover:to-pf-accent text-white font-bold transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-pf-accent/30"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        Create & Save
                      </>
                    )}
                  </motion.button>
                </motion.div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

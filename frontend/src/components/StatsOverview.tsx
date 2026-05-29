import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Database, CheckCircle2, XCircle, Clock, Smartphone } from 'lucide-react'
import { useWebSocketStore } from '../stores/websocket'
import { apiFetch } from '../utils/api'

interface Stats {
  datasets: number
  totalNumbers: number
  validNumbers: number
  invalidNumbers: number
  pendingNumbers: number
}

export function StatsOverview() {
  const [stats, setStats] = useState<Stats | null>(null)
  const validationProgress = useWebSocketStore(state => state.validationProgress)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const datasets = await apiFetch<Array<{ counts?: { total: number; valid: number; invalid: number; pending: number; error?: number; campaign?: number; excluded?: number } }>>('/api/datasets')
        
        if (Array.isArray(datasets)) {
          let total = 0
          let valid = 0
          let invalid = 0
          let pending = 0
          
          datasets.forEach((d) => {
            if (d.counts) {
              total += d.counts.total
              valid += d.counts.campaign ?? d.counts.valid
              invalid += d.counts.excluded ?? (d.counts.invalid + (d.counts.error ?? 0))
              pending += d.counts.pending
            }
          })
          
          setStats({
            datasets: datasets.length,
            totalNumbers: total,
            validNumbers: valid,
            invalidNumbers: invalid,
            pendingNumbers: pending,
          })
        } else {
          setStats(null)
        }
      } catch (err) {
        // apiFetch handles 401 → logout globally; just log other errors
        console.error('Failed to fetch stats:', err)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, 30000) // Refresh every 30s
    
    return () => clearInterval(interval)
  }, [validationProgress])

  if (!stats || stats.datasets === 0) return null

  const statItems = [
    { 
      icon: Database, 
      label: 'Datasets', 
      value: stats.datasets,
      color: 'text-pf-accent',
      bgColor: 'bg-pf-accent/10'
    },
    { 
      icon: Smartphone, 
      label: 'Total Uploaded', 
      value: stats.totalNumbers.toLocaleString(),
      color: 'text-pf-info',
      bgColor: 'bg-pf-info/10'
    },
    { 
      icon: CheckCircle2, 
      label: 'Campaign', 
      value: stats.validNumbers.toLocaleString(),
      color: 'text-pf-success',
      bgColor: 'bg-pf-success/10'
    },
    { 
      icon: XCircle, 
      label: 'Excluded', 
      value: stats.invalidNumbers.toLocaleString(),
      color: 'text-pf-text-dim',
      bgColor: 'bg-pf-surface-light'
    },
    { 
      icon: Clock, 
      label: 'Pending', 
      value: stats.pendingNumbers.toLocaleString(),
      color: 'text-pf-warning',
      bgColor: 'bg-pf-warning/10'
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {statItems.map((item, index) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          className="glass-panel rounded-xl p-4"
        >
          <div className={`w-10 h-10 rounded-lg ${item.bgColor} flex items-center justify-center mb-3`}>
            <item.icon className={`w-5 h-5 ${item.color}`} />
          </div>
          <p className="text-2xl font-bold text-white">{item.value}</p>
          <p className="text-xs text-pf-text-muted">{item.label}</p>
        </motion.div>
      ))}
    </div>
  )
}

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Zap, Database, Shield, ArrowRight, Sparkles, LayoutGrid } from 'lucide-react'
import { useWebSocket } from '../hooks/useWebSocket'
import { GeneratorPanel } from '../components/GeneratorPanel'
import { SessionPanel } from '../components/SessionPanel'
import { ValidationPanel } from '../components/ValidationPanel'
import { StatsOverview } from '../components/StatsOverview'
import { RecentDatasets } from '../components/RecentDatasets'
import { PipelineWizard } from '../components/PipelineWizard'

export function Dashboard() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [viewMode, setViewMode] = useState<'wizard' | 'grid'>('wizard')
  const navigate = useNavigate()
  
  // Initialize WebSocket connection
  useWebSocket()

  // Trigger refresh when dataset is created
  const handleDatasetCreated = useCallback(() => {
    setRefreshKey(prev => prev + 1)
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center sm:text-left animate-slide-up"
        >
          <div className="flex items-center gap-3 mb-2 justify-center sm:justify-start">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pf-accent to-pf-info flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            </div>
          </div>
          <p className="text-pf-text-muted text-sm pl-0 sm:pl-13">
            Generate numbers, connect WhatsApp, and validate at scale
          </p>
        </motion.div>

        {/* View Toggle Bar */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex justify-center"
        >
          <div className="flex p-1 bg-pf-bg rounded-xl border border-pf-border/40 shadow-inner">
            <button
              onClick={() => setViewMode('wizard')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                viewMode === 'wizard'
                  ? 'bg-pf-accent text-white shadow-md shadow-pf-accent/15'
                  : 'text-pf-text-muted hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Interactive Wizard
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                viewMode === 'grid'
                  ? 'bg-pf-accent text-white shadow-md shadow-pf-accent/15'
                  : 'text-pf-text-muted hover:text-white'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Classic Grid
            </button>
          </div>
        </motion.div>
      </div>

      {/* Stats Overview */}
      <StatsOverview key={`stats-${refreshKey}`} />

      {/* Primary Funnel vs Classic View Switcher */}
      <AnimatePresence mode="wait">
        {viewMode === 'wizard' ? (
          <motion.div
            key="wizard-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
          >
            <PipelineWizard />
          </motion.div>
        ) : (
          <motion.div
            key="grid-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* Quick Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                onClick={() => navigate('/datasets')}
                className="glass-panel rounded-xl p-4 text-left hover:border-pf-accent transition-colors group"
              >
                <Database className="w-6 h-6 text-pf-accent mb-2" />
                <p className="text-sm font-medium text-white">View Datasets</p>
                <p className="text-xs text-pf-text-muted">Browse verified contact datasets</p>
              </button>
              
              <button
                onClick={() => document.getElementById('generator-panel')?.scrollIntoView({ behavior: 'smooth' })}
                className="glass-panel rounded-xl p-4 text-left hover:border-pf-accent transition-colors group"
              >
                <Zap className="w-6 h-6 text-pf-accent mb-2" />
                <p className="text-sm font-medium text-white">Generate New</p>
                <p className="text-xs text-pf-text-muted">Create number batch</p>
              </button>
              
              <button
                onClick={() => document.getElementById('session-panel')?.scrollIntoView({ behavior: 'smooth' })}
                className="glass-panel rounded-xl p-4 text-left hover:border-pf-accent transition-colors group"
              >
                <Shield className="w-6 h-6 text-pf-accent mb-2" />
                <p className="text-sm font-medium text-white">WhatsApp</p>
                <p className="text-xs text-pf-text-muted">Connect session</p>
              </button>
              
              <button
                onClick={() => document.getElementById('validation-panel')?.scrollIntoView({ behavior: 'smooth' })}
                className="glass-panel rounded-xl p-4 text-left hover:border-pf-accent transition-colors group"
              >
                <ArrowRight className="w-6 h-6 text-pf-accent mb-2" />
                <p className="text-sm font-medium text-white">Validate</p>
                <p className="text-xs text-pf-text-muted">Check numbers</p>
              </button>
            </div>

            {/* Recent Datasets */}
            <RecentDatasets refreshKey={refreshKey} />

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Generator Panel */}
              <div id="generator-panel">
                <GeneratorPanel onDatasetCreated={handleDatasetCreated} />
              </div>

              {/* Session Panel */}
              <div id="session-panel">
                <SessionPanel />
              </div>
            </div>

            {/* Validation Panel */}
            <div id="validation-panel">
              <ValidationPanel key={`validation-${refreshKey}`} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

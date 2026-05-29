import { motion } from 'framer-motion'
import { Smartphone } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { WhatsappPanel } from '../components/WhatsappPanel'

export function WhatsappLauncher() {
  const location = useLocation()
  const initialNumbers = (location.state as any)?.numbers || ''

  return (
    <div className="space-y-6 max-w-lg">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pf-success to-pf-accent flex items-center justify-center">
          <Smartphone className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">WhatsApp Launcher</h1>
          <p className="text-pf-text-muted text-sm font-medium">Send messages via rotated WhatsApp account pool</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <WhatsappPanel initialNumbers={initialNumbers} />
      </motion.div>
    </div>
  )
}

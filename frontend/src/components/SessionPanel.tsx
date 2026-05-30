import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Smartphone, QrCode, CheckCircle, XCircle, RefreshCw, Loader2, Plus, Trash2, Shield, UserPlus } from 'lucide-react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useWebSocketStore, WAStatus } from '../stores/websocket'

export function SessionPanel() {
  const { connected, send } = useWebSocket()
  const waStatuses = useWebSocketStore((state) => state.waStatuses)
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [newAccountName, setNewAccountName] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [authMethod, setAuthMethod] = useState<'qr' | 'pairing'>('qr')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [phoneError, setPhoneError] = useState('')

  const handleConnect = (clientId: string) => {
    if (authMethod === 'pairing') {
      const digits = phoneNumber.replace(/\D/g, '')
      if (digits.length < 7 || digits.length > 15) {
        setPhoneError('Enter a valid number with country code, e.g. +971501234567')
        return
      }
      setPhoneError('')
    }
    setIsLoading(clientId)
    send({ type: 'wa_initialize', clientId, method: authMethod, phone: authMethod === 'pairing' ? phoneNumber : undefined })
    setTimeout(() => setIsLoading(null), 2000)
  }

  const handleDisconnect = (clientId: string) => {
    setIsLoading(clientId)
    send({ type: 'wa_logout', clientId })
    setTimeout(() => setIsLoading(null), 1000)
  }

  const handleRemove = (clientId: string) => {
    if (confirm('Are you sure you want to remove this WhatsApp account and its session?')) {
      send({ type: 'wa_remove', clientId })
    }
  }

  const handleAddAccount = () => {
    if (!newAccountName.trim()) return
    if (authMethod === 'pairing') {
      const digits = phoneNumber.replace(/\D/g, '')
      if (digits.length < 7 || digits.length > 15) {
        setPhoneError('Enter a valid number with country code, e.g. +971501234567')
        return
      }
      setPhoneError('')
    }
    const newId = `wa_${Date.now()}`
    send({ type: 'wa_initialize', clientId: newId, name: newAccountName, method: authMethod, phone: authMethod === 'pairing' ? phoneNumber : undefined })
    setNewAccountName('')
    setPhoneNumber('')
    setAuthMethod('qr')
    setPhoneError('')
    setIsAdding(false)
  }

  const getStatusColor = (state: string) => {
    switch (state) {
      case 'ready': return 'text-pf-success'
      case 'error': return 'text-pf-error'
      case 'connecting':
      case 'qr_ready':
      case 'pairing': return 'text-pf-warning'
      default: return 'text-pf-text-muted'
    }
  }

  const getStatusIcon = (state: string) => {
    switch (state) {
      case 'ready': return <CheckCircle className="w-5 h-5 text-pf-success" />
      case 'error': return <XCircle className="w-5 h-5 text-pf-error" />
      case 'connecting': return <RefreshCw className="w-5 h-5 text-pf-warning animate-spin" />
      case 'qr_ready': return <QrCode className="w-5 h-5 text-pf-warning" />
      case 'pairing': return <Smartphone className="w-5 h-5 text-pf-warning" />
      default: return <Smartphone className="w-5 h-5 text-pf-text-muted" />
    }
  }

  const getStatusText = (status: WAStatus) => {
    switch (status.state) {
      case 'ready': return status.phone ? `Connected: ${status.phone}` : 'Connected'
      case 'error': return status.error || 'Error occurred'
      case 'connecting': return 'Connecting...'
      case 'qr_ready': return 'Scan QR code'
      case 'pairing': return 'Enter pairing code'
      case 'authenticated': return 'Authenticating...'
      default: return 'Disconnected'
    }
  }

  const sessions = Object.values(waStatuses)

  return (
    <div className="glass-panel rounded-xl overflow-hidden flex flex-col h-full border border-pf-border/30">
      {/* Header */}
      <div className="px-6 py-5 border-b border-pf-border/50 flex items-center justify-between bg-pf-surface/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pf-accent/20 flex items-center justify-center border border-pf-accent/20">
            <Smartphone className="w-5 h-5 text-pf-accent" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">WhatsApp Manager</h2>
            <p className="text-[10px] font-medium text-pf-text-muted uppercase tracking-widest">Multi-Session Hub</p>
          </div>
        </div>
        
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            isAdding 
            ? 'bg-pf-surface text-pf-text-muted hover:text-white' 
            : 'bg-pf-accent/10 text-pf-accent hover:bg-pf-accent/20 border border-pf-accent/30'
          }`}
        >
          {isAdding ? <XCircle className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {isAdding ? 'Cancel' : 'Add Account'}
        </button>
      </div>

      {/* Add New Form */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-6 py-6 bg-pf-accent/5 border-b border-pf-border/50 overflow-hidden"
          >
            <div className="space-y-4">
              <label className="block text-xs font-bold text-pf-text-muted uppercase tracking-wider">New Account Name</label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pf-text-dim" />
                  <input
                    type="text"
                    placeholder="e.g. Marketing Session A"
                    value={newAccountName}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddAccount()}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    className="w-full bg-pf-bg border border-pf-border rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-pf-accent focus:ring-1 focus:ring-pf-accent/30 transition-all shadow-inner"
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleAddAccount}
                  disabled={!newAccountName.trim()}
                  className="bg-pf-accent text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-pf-accent-glow transition-all shadow-lg shadow-pf-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create
                </button>
              </div>

              {/* Auth Method Selection */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setAuthMethod('qr'); setPhoneError('') }}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    authMethod === 'qr'
                      ? 'bg-pf-accent/20 text-pf-accent border border-pf-accent/30'
                      : 'bg-pf-bg text-pf-text-muted border border-pf-border/30 hover:border-pf-border/50'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  QR Code
                </button>
                <button
                  onClick={() => { setAuthMethod('pairing'); setPhoneError('') }}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    authMethod === 'pairing'
                      ? 'bg-pf-accent/20 text-pf-accent border border-pf-accent/30'
                      : 'bg-pf-bg text-pf-text-muted border border-pf-border/30 hover:border-pf-border/50'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  Phone Number
                </button>
              </div>

              {/* Phone Input for Pairing */}
              {authMethod === 'pairing' && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-pf-text-muted uppercase tracking-wider">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="+971 50 123 4567"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full bg-pf-bg border border-pf-border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-pf-accent focus:ring-1 focus:ring-pf-accent/30 transition-all shadow-inner"
                  />
                  {phoneError && <p className="text-xs text-pf-error font-medium">{phoneError}</p>}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[500px] scrollbar-thin scrollbar-thumb-pf-surface scrollbar-track-transparent">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center opacity-50">
            <div className="w-16 h-16 rounded-full bg-pf-surface flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-pf-text-dim" />
            </div>
            <p className="text-sm font-medium text-pf-text-muted">No WhatsApp accounts linked</p>
            <p className="text-xs text-pf-text-dim mt-1">Click "Add Account" to get started</p>
          </div>
        ) : (
          sessions.map((status) => (
            <motion.div
              key={status.id}
              layout
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-pf-surface/40 border border-pf-border/40 rounded-2xl p-5 group hover:border-pf-accent/30 transition-all hover:bg-pf-surface/60"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${status.state === 'ready' ? 'bg-pf-success shadow-[0_0_12px_rgba(34,197,94,0.8)]' : 'bg-pf-text-muted'}`} />
                  <span className="font-bold text-white tracking-tight text-base">{status.name || 'Account'}</span>
                </div>
                <button 
                  onClick={() => handleRemove(status.id)}
                  className="p-2 text-pf-text-dim hover:text-pf-error hover:bg-pf-error/10 rounded-lg transition-all md:opacity-0 group-hover:opacity-100"
                  title="Remove Account"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-3 p-3 bg-pf-bg/60 rounded-xl mb-5 border border-pf-border/20">
                <div className="p-1.5 rounded-lg bg-pf-surface-light">
                  {getStatusIcon(status.state)}
                </div>
                <div className="flex flex-col flex-1">
                  <span className={`text-[11px] font-bold uppercase tracking-widest ${getStatusColor(status.state)}`}>
                    {status.state.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-pf-text-muted font-medium">
                    {getStatusText(status)}
                  </span>
                </div>
                
                {useWebSocketStore.getState().rotationHealths[status.id] && (
                  <div className="flex flex-col items-end border-l border-pf-border/30 pl-3">
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${
                      useWebSocketStore.getState().rotationHealths[status.id].health === 'healthy' ? 'text-pf-success' :
                      useWebSocketStore.getState().rotationHealths[status.id].health === 'exhausted' ? 'text-pf-error' :
                      'text-pf-warning'
                    }`}>
                      {useWebSocketStore.getState().rotationHealths[status.id].health}
                    </span>
                    <span className="text-[10px] text-pf-text-muted font-medium">
                      {useWebSocketStore.getState().rotationHealths[status.id].checksThisHour} / 200 checks
                    </span>
                  </div>
                )}
              </div>

              {status.qrCode && status.state === 'qr_ready' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center gap-4 mb-5 bg-white p-5 rounded-2xl shadow-xl"
                >
                  <img src={status.qrCode} alt="QR Code" className="w-44 h-44" />
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Authentication Required</p>
                    <p className="text-[9px] text-gray-500 font-medium">Scan with your WhatsApp device</p>
                  </div>
                </motion.div>
              )}

              {status.pairingCode && status.state === 'pairing' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center gap-4 mb-5 bg-pf-surface/60 p-5 rounded-2xl border border-pf-accent/30"
                >
                  <div className="p-3 rounded-full bg-pf-accent/20">
                    <Smartphone className="w-8 h-8 text-pf-accent" />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-[10px] font-bold text-pf-text-muted uppercase tracking-widest">Enter This Code</p>
                    <p className="text-[9px] text-pf-text-dim font-medium">WhatsApp → Linked Devices → Link with phone number</p>
                  </div>
                  <div className="px-8 py-4 bg-pf-bg rounded-xl border border-pf-border/30">
                    <span className="font-mono text-3xl font-black tracking-[0.2em] text-pf-accent">{status.pairingCode}</span>
                  </div>
                </motion.div>
              )}

              <button
                onClick={() => status.state === 'ready' ? handleDisconnect(status.id) : handleConnect(status.id)}
                disabled={status.state === 'connecting' || status.state === 'qr_ready' || status.state === 'pairing' || !connected || isLoading === status.id}
                className={`w-full py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm ${
                  status.state === 'ready'
                    ? 'bg-pf-error/10 text-pf-error hover:bg-pf-error/20 border border-pf-error/30'
                    : 'bg-pf-accent text-white hover:bg-pf-accent-glow shadow-pf-accent/10'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {(status.state === 'connecting' || isLoading === status.id) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {status.state === 'ready' ? 'Terminate Session' : 'Link Account'}
              </button>
            </motion.div>
          ))
        )}
      </div>

      {/* Footer */}
      {!connected && (
        <div className="px-4 py-2 bg-pf-error/10 border-t border-pf-error/30 text-center animate-pulse">
          <p className="text-[10px] text-pf-error font-bold uppercase tracking-widest">
            Offline: Waiting for Backend...
          </p>
        </div>
      )}
    </div>
  )
}

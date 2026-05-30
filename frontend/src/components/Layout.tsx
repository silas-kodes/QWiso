import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Database, 
  LogOut, 
  Menu, 
  X,
  Wifi,
  WifiOff,
  Smartphone,
  MessageSquare,
  Bot,
  Send
} from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import { useWebSocketStore } from '../stores/websocket'

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()
  const { logout } = useAuthStore()
  const { connected, waStatuses } = useWebSocketStore()

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/datasets', icon: Database, label: 'Datasets' },
    { path: '/whatsapp-launcher', icon: Smartphone, label: 'WA Launcher' },
    { path: '/campaigns', icon: Send, label: 'Campaigns' },
    { path: '/sms', icon: MessageSquare, label: 'SMS' },
    { path: '/automation', icon: Bot, label: 'Automation' },
  ]

  const mainAccount = waStatuses['main'] || Object.values(waStatuses)[0] || { state: 'disconnected', phone: null }

  const waStateColor = {
    disconnected: 'bg-pf-text-dim',
    connecting: 'bg-pf-warning',
    qr_ready: 'bg-pf-warning',
    pairing: 'bg-pf-warning',
    authenticated: 'bg-pf-info',
    ready: 'bg-pf-success',
    error: 'bg-pf-error',
  }[mainAccount.state] || 'bg-pf-text-dim'

  return (
    <div className="min-h-screen bg-pf-bg flex flex-col">
      {/* Header */}
      <header className="glass-panel sticky top-0 z-50 border-b border-pf-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pf-accent to-pf-info flex items-center justify-center">
                <Smartphone className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg tracking-tight text-white">
                QWI<span className="text-pf-accent">SO</span>
              </span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === item.path
                      ? 'bg-pf-surface-light text-white'
                      : 'text-pf-text-muted hover:text-white hover:bg-pf-surface-light'
                  }`}
                >
                  <item.icon className="w-4 h-4 inline mr-1.5" />
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {/* WS Status */}
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-pf-text-muted">
                {connected ? (
                  <Wifi className="w-3.5 h-3.5 text-pf-success" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-pf-error" />
                )}
                <span className="capitalize">{mainAccount.state}</span>
                {mainAccount.phone && (
                  <span className="text-pf-text-dim">+{mainAccount.phone}</span>
                )}
                <span className={`w-2 h-2 rounded-full ${waStateColor}`} />
              </div>

              {/* Logout */}
              <button
                onClick={() => logout()}
                className="p-2 rounded-lg text-pf-text-muted hover:text-pf-error hover:bg-pf-surface-light transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-pf-text-muted hover:text-white hover:bg-pf-surface-light transition-colors"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-pf-border">
            <nav className="px-4 py-3 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                    location.pathname === item.path
                      ? 'bg-pf-surface-light text-white'
                      : 'text-pf-text-muted hover:text-white hover:bg-pf-surface-light'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              ))}
              
              <div className="pt-2 border-t border-pf-border mt-2">
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-pf-text-muted">
                  {connected ? (
                    <Wifi className="w-3.5 h-3.5 text-pf-success" />
                  ) : (
                    <WifiOff className="w-3.5 h-3.5 text-pf-error" />
                  )}
                  WhatsApp: {mainAccount.state}
                  {mainAccount.phone && ` (+${mainAccount.phone})`}
                </div>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Scan line effect */}
      <div className="scan-line" />
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Datasets } from './pages/Datasets'
import { Sms } from './pages/Sms'
import { WhatsappLauncher } from './pages/WhatsappLauncher'
import { Automation } from './pages/Automation'
import { Campaigns } from './pages/Campaigns'
import { Login } from './pages/Login'
import { useAuthStore } from './stores/auth'
import { ErrorBoundary } from './components/ErrorBoundary'

function App() {
  const { isAuthenticated, checkSession } = useAuthStore()
  const [sessionChecked, setSessionChecked] = useState(false)

  // On every mount, verify the backend session is still valid.
  // This prevents the persisted `isAuthenticated: true` from being
  // trusted when the server-side session cookie has expired.
  useEffect(() => {
    checkSession().finally(() => setSessionChecked(true))
  }, [checkSession])

  // Show nothing (or a tiny spinner) until the session check completes
  // to avoid components firing 401'd API calls.
  if (!sessionChecked) {
    return (
      <div className="min-h-screen bg-pf-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-pf-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Login />
  }

  return (
    <Layout>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/datasets" element={<Datasets />} />
          <Route path="/whatsapp-launcher" element={<WhatsappLauncher />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/sms" element={<Sms />} />
          <Route path="/automation" element={<Automation />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </ErrorBoundary>
    </Layout>
  )
}

export default App

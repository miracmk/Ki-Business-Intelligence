import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './store/auth'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import Login from './pages/Login'
import TwoFactor from './pages/TwoFactor'
import Dashboard from './pages/Dashboard'
import Modules from './pages/Modules'
import Crm from './pages/Crm'
import Erp from './pages/Erp'
import Blueprint from './pages/Blueprint'
import Functions from './pages/Functions'
import FieldManager from './pages/FieldManager'
import Import from './pages/Import'
import Onboarding from './pages/Onboarding'
import AiActions from './pages/AiActions'
import CustomerService from './pages/CustomerService'
import Fulfillment from './pages/Fulfillment'
import Ecommerce from './pages/Ecommerce'
import Marketing from './pages/Marketing'
import Events from './pages/Events'
import Personnel from './pages/Personnel'
import Accounting from './pages/Accounting'
import Files from './pages/Files'
import AiChat from './pages/AiChat'
import EntityAI from './pages/EntityAI'
import Support from './pages/Support'
import Settings from './pages/Settings'
import Admin from './pages/Admin'
import PlatformSettings from './pages/PlatformSettings'
import Register from './pages/Register'
import KiWallet from './pages/KiWallet'
import PrivacyPolicy from './pages/PrivacyPolicy'
import ComingSoon from './components/ComingSoon'
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth()
  if (!accessToken) return <Navigate to="/app/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { accessToken, user } = useAuth()
  if (!accessToken) return <Navigate to="/app/login" replace />
  const role = (user as any)?.role
  if (role !== 'admin' && role !== 'supervisor') return <Navigate to="/app/dashboard" replace />
  return <>{children}</>
}

function AppShell() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/app/login" element={<Login />} />
        <Route path="/app/login/2fa" element={<TwoFactor />} />
        <Route path="/app/register" element={<Register />} />
        <Route path="/app" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard"  element={<Dashboard />} />
          <Route path="crm-native" element={<Crm />} />
          <Route path="erp-native" element={<Erp />} />
          <Route path="blueprint" element={<Blueprint />} />
          <Route path="functions" element={<Functions />} />
          <Route path="field-manager" element={<FieldManager />} />
          <Route path="import" element={<Import />} />
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="ai-actions" element={<AiActions />} />
          <Route path="customer-service" element={<CustomerService />} />
          <Route path="fulfillment" element={<Fulfillment />} />
          <Route path="ecommerce" element={<Ecommerce />} />
          <Route path="marketing" element={<Marketing />} />
          <Route path="events" element={<Events />} />
          <Route path="personnel" element={<Personnel />} />
          <Route path="crm"        element={<Modules />} />
          <Route path="modules"    element={<Navigate to="/app/crm" replace />} />
          <Route path="accounting" element={<Accounting />} />
          <Route path="files"      element={<Files />} />
          <Route path="chat"       element={<AiChat />} />
          <Route path="entity-ai"  element={<EntityAI />} />
          <Route path="support"    element={<Support />} />
          <Route path="wallet"     element={<KiWallet />} />
          <Route path="settings"   element={<Settings />} />
          <Route path="coming-soon" element={<ComingSoon />} />
          <Route path="admin"             element={<AdminRoute><Admin /></AdminRoute>} />
          <Route path="admin/settings"   element={<AdminRoute><PlatformSettings /></AdminRoute>} />
          <Route path="admin/kibi-chat"  element={<AdminRoute><AiChat isAdminMode /></AdminRoute>} />
        </Route>
      </Routes>
    </div>
  )
}

function App() {
  useEffect(() => {
    const saved = localStorage.getItem('ki-theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = saved ? saved === 'dark' : prefersDark
    document.documentElement.classList.toggle('dark', isDark)
  }, [])

  return <AppShell />
}

export default App

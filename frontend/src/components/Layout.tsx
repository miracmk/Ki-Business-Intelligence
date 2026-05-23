import { useState, useEffect } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../store/auth'
import {
  LayoutDashboard, FolderOpen, LifeBuoy, Settings, LogOut,
  Sun, Moon, Menu, X, ChevronDown, ChevronRight,
  MessageSquare, Bot, ShieldCheck, BarChart3, Database,
} from 'lucide-react'
import api from '../lib/api'

interface CrmModule { apiName: string; pluralLabel: string }

const ACCOUNTING_TABS = [
  { key: 'summary',        label: 'Özet' },
  { key: 'invoices',       label: 'Faturalar' },
  { key: 'payments',       label: 'Ödemeler' },
  { key: 'contacts',       label: 'Kişiler' },
  { key: 'expenses',       label: 'Giderler' },
  { key: 'reports',        label: 'Raporlar' },
  { key: 'integrations',   label: 'Entegrasyonlar' },
]

export default function Layout() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const { user, clear } = useAuth()

  const [sidebarOpen,  setSidebarOpen]  = useState(false)
  const [crmOpen,      setCrmOpen]      = useState(false)
  const [accOpen,      setAccOpen]      = useState(false)
  const [adminOpen,    setAdminOpen]    = useState(false)
  const [crmModules,   setCrmModules]   = useState<CrmModule[]>([])
  const [crmLoaded,    setCrmLoaded]    = useState(false)

  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('ki-theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('ki-theme', dark ? 'dark' : 'light')
  }, [dark])

  // auto-expand active section
  useEffect(() => {
    if (location.pathname.startsWith('/app/crm')) setCrmOpen(true)
    if (location.pathname.startsWith('/app/accounting')) setAccOpen(true)
    if (location.pathname.startsWith('/app/admin')) setAdminOpen(true)
    setSidebarOpen(false)
  }, [location.pathname])

  // lazy load CRM modules
  useEffect(() => {
    if (!crmOpen || crmLoaded) return
    api.get('/crm/connections').then(r => {
      const conn = r.data.connections?.[0]
      if (!conn) { setCrmLoaded(true); return }
      api.get(`/crm/connections/${conn.id}/modules`).then(mr => {
        setCrmModules(mr.data.modules ?? [])
      }).finally(() => setCrmLoaded(true))
    }).catch(() => setCrmLoaded(true))
  }, [crmOpen, crmLoaded])

  const isSuperAdmin = user?.role === 'admin' || user?.role === 'supervisor'
  const initials     = user?.name ? user.name.charAt(0).toUpperCase() : 'U'

  const activeLink = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/') || location.pathname.startsWith(path + '?')

  const linkStyle = (active: boolean) => active ? {
    background: 'rgba(38,166,154,0.14)',
    color: 'var(--accent)',
    borderLeft: '2px solid var(--accent)',
    paddingLeft: '10px',
    boxShadow: '0 0 12px rgba(38,166,154,0.12)',
  } : { color: 'var(--text-2)' }

  const hoverIn  = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget
    if (!el.style.borderLeft) {
      el.style.background = 'var(--surface-3)'
      el.style.color      = 'var(--text-1)'
    }
  }
  const hoverOut = (e: React.MouseEvent<HTMLElement>, active: boolean) => {
    if (!active) {
      e.currentTarget.style.background = ''
      e.currentTarget.style.color      = 'var(--text-2)'
    }
  }

  const SubItem = ({ to, label }: { to: string; label: string }) => {
    const active = location.pathname + location.search === to || location.pathname === to
    return (
      <Link
        to={to}
        className="flex items-center gap-2 pl-9 pr-3 py-2 rounded-lg text-xs transition-all duration-150"
        style={active ? { color: 'var(--accent)', background: 'rgba(38,166,154,0.10)' } : { color: 'var(--text-3)' }}
        onMouseEnter={e => { if (!active) { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.background = 'var(--surface-3)' } }}
        onMouseLeave={e => { if (!active) { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = '' } }}
      >
        {label}
      </Link>
    )
  }

  const sidebar = (
    <aside
      className={`fixed md:static inset-y-0 left-0 z-30 w-60 flex flex-col transition-transform duration-300 md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      style={{
        background: 'var(--surface)',
        backdropFilter: 'blur(28px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.8)',
        borderRight: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      {/* Aurora stripe */}
      <div className="absolute inset-y-0 left-0 w-[2px] rounded-full"
        style={{ background: 'linear-gradient(to bottom, var(--accent), transparent 70%)' }} />

      {/* Logo */}
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <img src="/ki-icon.png" alt="Ki" className="w-8 h-8 object-contain rounded-lg" />
          <div>
            <span className="text-base font-bold" style={{ color: 'var(--accent)' }}>Ki</span>
            <span className="text-xs font-medium" style={{ color: 'var(--text-3)' }}> Business Intelligence</span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">

        {/* Dashboard */}
        <Link to="/app/dashboard"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
          style={linkStyle(activeLink('/app/dashboard'))}
          onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, activeLink('/app/dashboard'))}>
          <LayoutDashboard size={17} /><span className="text-sm font-medium">Dashboard</span>
        </Link>

        {/* CRM expandable */}
        <div>
          <button
            onClick={() => setCrmOpen(o => !o)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
            style={linkStyle(activeLink('/app/crm'))}
            onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, activeLink('/app/crm'))}>
            <Database size={17} />
            <span className="text-sm font-medium flex-1 text-left">CRM</span>
            {crmOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {crmOpen && (
            <div className="mt-0.5 space-y-0.5">
              <SubItem to="/app/crm" label="Tüm Modüller" />
              {crmModules.slice(0, 12).map(m => (
                <SubItem key={m.apiName} to={`/app/crm?module=${m.apiName}`} label={m.pluralLabel || m.apiName} />
              ))}
              {!crmLoaded && <p className="pl-9 text-xs py-1" style={{ color: 'var(--text-3)' }}>Yükleniyor...</p>}
            </div>
          )}
        </div>

        {/* Accounting expandable */}
        <div>
          <button
            onClick={() => setAccOpen(o => !o)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
            style={linkStyle(activeLink('/app/accounting'))}
            onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, activeLink('/app/accounting'))}>
            <BarChart3 size={17} />
            <span className="text-sm font-medium flex-1 text-left">Muhasebe</span>
            {accOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {accOpen && (
            <div className="mt-0.5 space-y-0.5">
              {ACCOUNTING_TABS.map(t => (
                <SubItem key={t.key} to={`/app/accounting?tab=${t.key}`} label={t.label} />
              ))}
            </div>
          )}
        </div>

        {/* Files */}
        <Link to="/app/files"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
          style={linkStyle(activeLink('/app/files'))}
          onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, activeLink('/app/files'))}>
          <FolderOpen size={17} /><span className="text-sm font-medium">Dosyalar</span>
        </Link>

        {/* AI section separator */}
        <div className="pt-2 pb-1 px-3">
          <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-3)' }}>Yapay Zeka</span>
        </div>

        {/* KIBI AI */}
        <Link to="/app/chat"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
          style={linkStyle(activeLink('/app/chat'))}
          onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, activeLink('/app/chat'))}>
          <MessageSquare size={17} /><span className="text-sm font-medium">KIBI AI</span>
        </Link>

        {/* Entity AI */}
        <Link to="/app/entity-ai"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
          style={linkStyle(activeLink('/app/entity-ai'))}
          onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, activeLink('/app/entity-ai'))}>
          <Bot size={17} /><span className="text-sm font-medium">Entity AI</span>
        </Link>

        {/* Support */}
        <Link to="/app/support"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
          style={linkStyle(activeLink('/app/support'))}
          onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, activeLink('/app/support'))}>
          <LifeBuoy size={17} /><span className="text-sm font-medium">Destek</span>
        </Link>

        {/* Settings */}
        <Link to="/app/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
          style={linkStyle(activeLink('/app/settings'))}
          onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, activeLink('/app/settings'))}>
          <Settings size={17} /><span className="text-sm font-medium">Ayarlar</span>
        </Link>

        {/* Admin section — admin + supervisor */}
        {isSuperAdmin && (
          <div>
            <button
              onClick={() => setAdminOpen(o => !o)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
              style={linkStyle(activeLink('/app/admin'))}
              onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, activeLink('/app/admin'))}>
              <ShieldCheck size={17} />
              <span className="text-sm font-medium flex-1 text-left">Admin</span>
              {adminOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {adminOpen && (
              <div className="mt-0.5 space-y-0.5">
                <SubItem to="/app/admin" label="Panel" />
                <SubItem to="/app/admin/settings" label="Platform Ayarları" />
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Bottom: theme + user + logout */}
      <div className="px-3 py-4 space-y-2" style={{ borderTop: '1px solid var(--border)' }}>
        <button onClick={() => setDark(d => !d)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200"
          style={{ color: 'var(--text-2)' }}
          onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, false)}>
          {dark
            ? <Sun  size={16} style={{ color: 'var(--accent)' }} />
            : <Moon size={16} style={{ color: 'var(--accent)' }} />}
          <span>{dark ? 'Açık Tema' : 'Koyu Tema'}</span>
        </button>

        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{user?.name || 'Kullanıcı'}</p>
            <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>{user?.email}</p>
          </div>
        </div>

        <button onClick={() => { clear(); navigate('/app/login') }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200 text-red-400 hover:bg-red-500/10">
          <LogOut size={16} /><span>Çıkış Yap</span>
        </button>
      </div>
    </aside>
  )

  return (
    <div className="min-h-screen flex bg-transparent">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {sidebar}

      {/* Main */}
      <main className="flex-1 overflow-auto flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="flex md:hidden items-center gap-3 px-4 py-3 sticky top-0 z-10"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <button onClick={() => setSidebarOpen(o => !o)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-2)' }}>
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <img src="/ki-icon.png" alt="Ki" className="w-6 h-6 object-contain" />
          <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>Ki</span>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>Business Intelligence</span>
        </div>
        <div className="flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

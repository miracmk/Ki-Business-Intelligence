import { useState, useEffect, useRef } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../store/auth'
import {
  LayoutDashboard, FolderOpen, LifeBuoy, Settings, LogOut,
  Sun, Moon, Menu, X, ChevronDown, ChevronRight,
  MessageSquare, Bot, Settings2, BarChart3, Database,
  Bell, CheckCheck, Wallet, Users, Boxes, Headset, Truck,
} from 'lucide-react'
import api from '../lib/api'

interface CrmModule { apiName: string; pluralLabel: string }

const TYPE_LABEL: Record<string, string> = {
  info: 'Bilgi', warning: 'Uyarı', error: 'Hata', success: 'Başarı',
  invoice_due: 'Fatura', payment_received: 'Ödeme', stock_low: 'Stok',
  ticket_update: 'Destek', ai_insight: 'AI', usage_limit: 'Limit', subscription_expiry: 'Abonelik',
}

function NotifDropdown({ notifications, onRead, onReadAll }: {
  notifications: any[]
  onRead: (id: string) => void
  onReadAll: () => void
}) {
  return (
    <div className="absolute right-0 top-full mt-1 w-80 rounded-2xl shadow-2xl z-50 overflow-hidden"
      style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Bildirimler</span>
        {notifications.length > 0 && (
          <button onClick={onReadAll} className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
            <CheckCheck size={12} /> Tümünü okundu say
          </button>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <p className="text-xs text-center py-8" style={{ color: 'var(--text-3)' }}>Yeni bildirim yok</p>
        ) : notifications.map(n => (
          <div key={n.id} className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-white/5 transition-all"
            style={{ borderBottom: '1px solid var(--border)' }}
            onClick={() => onRead(n.id)}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: 'var(--text-1)' }}>{n.title}</p>
              {n.body && <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-3)' }}>{n.body}</p>}
              <span className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>
                {TYPE_LABEL[n.type] ?? n.type} · {new Date(n.createdAt).toLocaleDateString('tr-TR')}
              </span>
            </div>
            <X size={12} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text-3)' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

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
  const [notifications, setNotifications] = useState<any[]>([])
  const [notifOpen,    setNotifOpen]    = useState(false)
  const [aiPremiumActive, setAiPremiumActive] = useState(true) // YFZ 34: optimistic default until /entitlements resolves
  const notifRef = useRef<HTMLDivElement>(null)

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

  // notification polling
  useEffect(() => {
    if (!user) return
    const load = () => {
      api.get('/notifications').then(r => setNotifications(r.data.notifications ?? [])).catch(() => {})
    }
    load()
    const iv = setInterval(load, 30000)
    return () => clearInterval(iv)
  }, [user])

  // YFZ 34: KiBI AI / Entity AI nav görünürlüğü — Premium AI entitlement (kozmetik;
  // gerçek erişim sınırı backend'in 402 gate'idir, bu sadece nav'ı temizler)
  useEffect(() => {
    if (!user) return
    api.get('/entitlements').then(r => {
      const rows = r.data.entitlements ?? []
      const ai = rows.find((e: any) => e.moduleKey === 'ai_premium')
      setAiPremiumActive(!!ai && (ai.status === 'active' || ai.status === 'trial'))
    }).catch(() => setAiPremiumActive(true)) // fail-open on nav; backend 402 still enforces
  }, [user])

  // close notif dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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

  const isAdminOrSupervisor = user?.role === 'admin' || user?.role === 'supervisor'
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
      className={`fixed md:sticky inset-y-0 md:inset-y-auto left-0 md:top-0 z-30 w-60 h-screen flex flex-col transition-transform duration-300 md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
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

        {/* CRM (native) — YFZ 34 Faz 3: Base CRUD, ayrı sayfa/route, connector ekranından bağımsız */}
        <Link to="/app/crm-native"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
          style={linkStyle(activeLink('/app/crm-native'))}
          onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, activeLink('/app/crm-native'))}>
          <Users size={17} /><span className="text-sm font-medium">CRM</span>
        </Link>

        {/* ERP (native) — YFZ 34 Faz 4: ürün/tedarikçi/sipariş Base CRUD */}
        <Link to="/app/erp-native"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
          style={linkStyle(activeLink('/app/erp-native'))}
          onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, activeLink('/app/erp-native'))}>
          <Boxes size={17} /><span className="text-sm font-medium">ERP</span>
        </Link>

        {/* CRM Bağlantıları expandable (eski "CRM" — harici connector senkron/izleme, route değişmedi) */}
        <div>
          <button
            onClick={() => setCrmOpen(o => !o)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
            style={linkStyle(activeLink('/app/crm'))}
            onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, activeLink('/app/crm'))}>
            <Database size={17} />
            <span className="text-sm font-medium flex-1 text-left">CRM Bağlantıları</span>
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

        {/* Add-on Modüller — YFZ 34 Faz 5: native paid add-on'lar, her zaman nav'da görünür
            (entitlement yoksa sayfa içinde "Etkinleştir" CTA'sı gösterilir, nav'da gizlenmez —
            add-on'ların keşfedilebilir/satılabilir olması gerekiyor, AI'nin aksine) */}
        <div className="pt-2 pb-1 px-3">
          <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-3)' }}>Add-on Modüller</span>
        </div>
        <Link to="/app/customer-service"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
          style={linkStyle(activeLink('/app/customer-service'))}
          onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, activeLink('/app/customer-service'))}>
          <Headset size={17} /><span className="text-sm font-medium">Müşteri Hizmetleri</span>
        </Link>
        <Link to="/app/fulfillment"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
          style={linkStyle(activeLink('/app/fulfillment'))}
          onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, activeLink('/app/fulfillment'))}>
          <Truck size={17} /><span className="text-sm font-medium">Sevkiyat</span>
        </Link>

        {/* Files */}
        <Link to="/app/files"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
          style={linkStyle(activeLink('/app/files'))}
          onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, activeLink('/app/files'))}>
          <FolderOpen size={17} /><span className="text-sm font-medium">Dosyalar</span>
        </Link>

        {/* AI section separator — YFZ 34: KiBI AI is a Premium upsell, nav hides if not entitled */}
        {(isAdminOrSupervisor || aiPremiumActive) && (
        <>
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
        </>
        )}

        {/* Support */}
        <Link to="/app/support"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
          style={linkStyle(activeLink('/app/support'))}
          onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, activeLink('/app/support'))}>
          <LifeBuoy size={17} /><span className="text-sm font-medium">Destek</span>
        </Link>

        {/* Ki Wallet */}
        <Link to="/app/wallet"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
          style={linkStyle(activeLink('/app/wallet'))}
          onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, activeLink('/app/wallet'))}>
          <Wallet size={17} /><span className="text-sm font-medium">Ki Wallet</span>
        </Link>

        {/* Settings */}
        <Link to="/app/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
          style={linkStyle(activeLink('/app/settings'))}
          onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, activeLink('/app/settings'))}>
          <Settings size={17} /><span className="text-sm font-medium">Ayarlar</span>
        </Link>

        {/* Platform section — admin + supervisor only */}
        {isAdminOrSupervisor && (
          <div>
            <button
              onClick={() => setAdminOpen(o => !o)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
              style={linkStyle(activeLink('/app/admin'))}
              onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, activeLink('/app/admin'))}>
              <Settings2 size={17} />
              <span className="text-sm font-medium flex-1 text-left">Platform</span>
              {adminOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {adminOpen && (
              <div className="mt-0.5 space-y-0.5">
                <SubItem to="/app/admin" label="Platform Management" />
                <SubItem to="/app/admin/settings" label="Platform Settings" />
                <SubItem to="/app/admin/kibi-chat" label="KIBI Chat" />
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Bottom: notifications + theme + user + logout */}
      <div className="px-3 py-4 space-y-2" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="relative" ref={notifRef}>
          <button onClick={() => setNotifOpen(o => !o)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200"
            style={{ color: 'var(--text-2)' }}
            onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, false)}>
            <div className="relative">
              <Bell size={16} style={{ color: 'var(--accent)' }} />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[8px] font-bold flex items-center justify-center text-white"
                  style={{ background: 'var(--accent)' }}>
                  {notifications.length > 9 ? '9+' : notifications.length}
                </span>
              )}
            </div>
            <span>Bildirimler</span>
            {notifications.length > 0 && (
              <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full font-bold text-white"
                style={{ background: 'var(--accent)' }}>
                {notifications.length}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute bottom-full left-0 mb-1 w-80">
              <NotifDropdown notifications={notifications} onRead={(id) => {
                api.put(`/notifications/${id}/read`).then(() => setNotifications(n => n.filter(x => x.id !== id))).catch(() => {})
              }} onReadAll={() => {
                api.put('/notifications/read-all').then(() => setNotifications([])).catch(() => {})
              }} />
            </div>
          )}
        </div>

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
    <div className="h-screen flex bg-transparent overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {sidebar}

      {/* Main */}
      <main className="flex-1 h-screen overflow-y-auto flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="flex md:hidden items-center gap-3 px-4 py-3 sticky top-0 z-10"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <button onClick={() => setSidebarOpen(o => !o)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-2)' }}>
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <img src="/ki-icon.png" alt="Ki" className="w-6 h-6 object-contain" />
          <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>Ki</span>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>Business Intelligence</span>
          <div className="ml-auto relative" ref={notifRef}>
            <button onClick={() => setNotifOpen(o => !o)} className="relative p-1.5 rounded-lg" style={{ color: 'var(--text-2)' }}>
              <Bell size={18} />
              {notifications.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
                  style={{ background: 'var(--accent)' }}>
                  {notifications.length > 9 ? '9+' : notifications.length}
                </span>
              )}
            </button>
            {notifOpen && <NotifDropdown notifications={notifications} onRead={(id) => {
              api.put(`/notifications/${id}/read`).then(() => setNotifications(n => n.filter(x => x.id !== id))).catch(() => {})
            }} onReadAll={() => {
              api.put('/notifications/read-all').then(() => setNotifications([])).catch(() => {})
            }} />}
          </div>
        </div>
        <div className="flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

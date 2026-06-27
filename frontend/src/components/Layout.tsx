import { useState, useEffect, useRef } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../store/auth'
import {
  LogOut, Sun, Moon, Menu, X, ChevronDown, ChevronRight,
  Bell, CheckCheck, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import api from '../lib/api'
import { resolveIcon } from '../lib/icon-map'

// Sidebar is a thin renderer of GET /nav-config — the backend (src/lib/nav-catalog.ts +
// entity_sidebar_nav_config overrides) is the single source of truth for what nav items
// exist, their labels/icons/routes, and role/entitlement visibility. This component never
// hardcodes any of that — adding a page to the product means adding one row to the backend
// catalog, not touching this file. See KIBIPR.md nav-config section.

interface NavItem { key: string; label: string; icon: string; route: string | null; kind: 'page' | 'placeholder' }
interface NavGroup { key: string; label: string; icon: string; items: NavItem[] }

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

// Groups with a single item (Dashboard) render as a direct link, no collapsible header.
// Groups expanded by default mirror what a typical entity uses most (CRM/Platform/AI);
// pure visual default, not persisted — actual visibility/order comes from the backend.
const DEFAULT_EXPANDED = new Set(['crm', 'finance', 'platform', 'ai'])

export default function Layout() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const { user, clear } = useAuth()

  const [sidebarOpen,     setSidebarOpen]     = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [navGroups,       setNavGroups]       = useState<NavGroup[]>([])
  const [expanded,        setExpanded]        = useState<Record<string, boolean>>({})
  const [notifications, setNotifications] = useState<any[]>([])
  const [notifOpen,    setNotifOpen]    = useState(false)
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

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  // Nav tree — fetched once per session from the backend, fully role/entitlement-resolved
  // server-side. No client-side gating logic needed here at all.
  useEffect(() => {
    if (!user) return
    api.get('/nav-config').then(r => {
      const groups: NavGroup[] = r.data.groups ?? []
      setNavGroups(groups)
      setExpanded(prev => {
        const next = { ...prev }
        for (const g of groups) if (!(g.key in next)) next[g.key] = DEFAULT_EXPANDED.has(g.key)
        return next
      })
    }).catch(() => setNavGroups([]))
  }, [user])

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

  // close notif dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const initials = user?.name ? user.name.charAt(0).toUpperCase() : 'U'

  const activeLink = (to: string) => {
    const [path, query] = to.split('?')
    if (query) return location.pathname === path && location.search === `?${query}`
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

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

  const itemTo = (item: NavItem) => item.kind === 'placeholder'
    ? `/app/coming-soon?key=${item.key}&label=${encodeURIComponent(item.label)}&icon=${item.icon}`
    : (item.route ?? '#')

  const NavLink = ({ item, indent }: { item: NavItem; indent?: boolean }) => {
    const to = itemTo(item)
    const active = activeLink(to)
    const Icon = resolveIcon(item.icon)
    return (
      <Link to={to}
        title={sidebarCollapsed ? item.label : undefined}
        className={`flex items-center gap-3 rounded-xl transition-all duration-200 ${indent ? 'pl-9 pr-3 py-2 text-xs' : 'px-3 py-2.5 text-sm'}`}
        style={linkStyle(active)}
        onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, active)}>
        <Icon size={indent ? 15 : 17} />
        {!sidebarCollapsed && <span className="font-medium">{item.label}</span>}
      </Link>
    )
  }

  const sidebar = (
    <aside
      className={`fixed md:sticky inset-y-0 md:inset-y-auto left-0 md:top-0 z-30 h-screen flex flex-col transition-all duration-300 md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${sidebarCollapsed ? 'w-16' : 'w-60'}`}
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
      <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <img src="/ki-icon.png" alt="Ki" className="w-8 h-8 object-contain rounded-lg flex-shrink-0" />
        {!sidebarCollapsed && (
          <div>
            <span className="text-base font-bold" style={{ color: 'var(--accent)' }}>Ki</span>
            <span className="text-xs font-medium" style={{ color: 'var(--text-3)' }}> Business Intelligence</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navGroups.map(group => {
          if (group.items.length === 1 && group.key === 'dashboard') {
            return <NavLink key={group.items[0].key} item={group.items[0]} />
          }
          const isOpen = expanded[group.key] ?? false
          const GroupIcon = resolveIcon(group.icon)
          return (
            <div key={group.key} className="pt-1">
              <button
                onClick={() => setExpanded(e => ({ ...e, [group.key]: !e[group.key] }))}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200"
                style={{ color: 'var(--text-3)' }}
                title={sidebarCollapsed ? group.label : undefined}>
                <GroupIcon size={15} />
                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1 text-left text-[11px] font-bold uppercase tracking-wider">{group.label}</span>
                    {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </>
                )}
              </button>
              {(isOpen || sidebarCollapsed) && (
                <div className="space-y-0.5 mt-0.5">
                  {group.items.map(item => <NavLink key={item.key} item={item} indent={!sidebarCollapsed} />)}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="px-3 py-2" style={{ borderTop: '1px solid var(--border)' }}>
        <button onClick={() => setSidebarCollapsed(c => !c)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs transition-all duration-200"
          style={{ color: 'var(--text-3)' }}
          onMouseEnter={hoverIn} onMouseLeave={e => hoverOut(e, false)}>
          {sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          {!sidebarCollapsed && <span>Menüyü Daralt</span>}
        </button>
      </div>

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
            {!sidebarCollapsed && <span>Bildirimler</span>}
            {!sidebarCollapsed && notifications.length > 0 && (
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
          {!sidebarCollapsed && <span>{dark ? 'Açık Tema' : 'Koyu Tema'}</span>}
        </button>

        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}>
            {initials}
          </div>
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{user?.name || 'Kullanıcı'}</p>
              <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>{user?.email}</p>
            </div>
          )}
        </div>

        <button onClick={() => { clear(); navigate('/app/login') }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200 text-red-400 hover:bg-red-500/10">
          <LogOut size={16} /> {!sidebarCollapsed && <span>Çıkış Yap</span>}
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

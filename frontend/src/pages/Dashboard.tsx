import { useEffect, useState } from 'react'
import { Database, LifeBuoy, MessageSquare, HardDrive, RefreshCw, X, Bot, Mail, Users, CheckCircle2, Circle } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../lib/api'

interface OnboardingStep { key: string; label: string; desc: string; done: boolean; to: string; icon: React.ElementType }

function OnboardingBanner({ steps, onDismiss }: { steps: OnboardingStep[]; onDismiss: () => void }) {
  const done = steps.filter(s => s.done).length
  const total = steps.length
  if (done === total) return null

  return (
    <div className="mb-8 rounded-2xl p-5" style={{ background: 'rgba(45,138,107,0.07)', border: '1px solid rgba(45,138,107,0.20)' }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Platforma Hoş Geldiniz</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{done}/{total} adım tamamlandı</p>
        </div>
        <button onClick={onDismiss} style={{ color: 'var(--text-3)' }} className="hover:opacity-70 mt-0.5">
          <X size={15} />
        </button>
      </div>
      {/* Progress bar */}
      <div className="h-1.5 rounded-full mb-5" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${(done / total) * 100}%`, background: 'var(--forest)' }} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {steps.map(s => (
          <Link key={s.key} to={s.to}
            className="flex flex-col gap-2 p-3 rounded-xl transition-all hover:scale-[1.02]"
            style={{ background: s.done ? 'rgba(45,138,107,0.12)' : 'var(--surface-2)', border: `1px solid ${s.done ? 'rgba(45,138,107,0.25)' : 'var(--border)'}` }}>
            <div className="flex items-center justify-between">
              <s.icon size={16} style={{ color: s.done ? 'var(--forest)' : 'var(--text-3)' }} />
              {s.done
                ? <CheckCircle2 size={14} style={{ color: 'var(--forest)' }} />
                : <Circle size={14} style={{ color: 'var(--text-3)' }} />}
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-1)' }}>{s.label}</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>{s.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [connections,  setConnections]  = useState<any[]>([])
  const [tickets,      setTickets]      = useState<any[]>([])
  const [usedMB,       setUsedMB]       = useState(0)
  const [limitMB,      setLimitMB]      = useState(1024)
  const [emailDone,    setEmailDone]    = useState(false)
  const [memberCount,  setMemberCount]  = useState(0)
  const [dismissed,    setDismissed]    = useState(() => localStorage.getItem('ki-onboarding-dismissed') === '1')

  useEffect(() => {
    Promise.all([
      api.get('/crm/connections'),
      api.get('/support/tickets?status=open'),
      api.get('/tenants/storage-usage'),
      api.get('/tenants/email-config').catch(() => ({ data: { config: null } })),
      api.get('/tenants/me/members').catch(() => ({ data: { members: [] } })),
    ]).then(([crm, support, storage, email, members]) => {
      setConnections(crm.data.connections ?? [])
      setTickets((support.data.tickets ?? []).slice(0, 5))
      const used = storage.data.usedBytes ?? 0
      const limit = storage.data.limitBytes ?? 1073741824
      setUsedMB(Math.round(used / 1024 / 1024))
      setLimitMB(Math.round(limit / 1024 / 1024))
      setEmailDone(!!email.data.config?.smtp?.host)
      setMemberCount((members.data.members ?? []).length)
    }).catch(console.error)
  }, [])

  const onboardingSteps: OnboardingStep[] = [
    { key: 'crm',    label: 'CRM Bağlantısı', desc: 'Veri kaynağı ekle',   done: connections.length > 0, to: '/app/settings', icon: Database },
    { key: 'email',  label: 'E-posta Kanalı', desc: 'SMTP/IMAP kur',       done: emailDone,              to: '/app/settings', icon: Mail },
    { key: 'team',   label: 'Ekip Üyesi',     desc: 'Davet gönder',         done: memberCount > 1,        to: '/app/settings', icon: Users },
    { key: 'ai',     label: 'Entity AI',      desc: 'Yapay zeka talimatı', done: false,                   to: '/app/entity-ai', icon: Bot },
  ]

  const dismiss = () => { localStorage.setItem('ki-onboarding-dismissed', '1'); setDismissed(true) }

  const priorityColors: Record<string, string> = {
    low: '#4ade80', medium: '#fbbf24', high: '#fb923c', urgent: '#f87171',
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Dashboard</h1>
        <button onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all"
          style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
          <RefreshCw size={14} /> Yenile
        </button>
      </div>

      {!dismissed && <OnboardingBanner steps={onboardingSteps} onDismiss={dismiss} />}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'CRM Bağlantıları', value: connections.length, icon: Database },
          { label: 'Açık Destek',      value: tickets.length,     icon: LifeBuoy },
          { label: 'AI Oturumu',       value: 0,                  icon: MessageSquare },
          { label: 'Depolama',         value: `${usedMB}/${limitMB} MB`, icon: HardDrive },
        ].map((card, i) => (
          <div key={i} className="p-5 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: 'rgba(45,138,107,0.12)' }}>
                <card.icon size={18} style={{ color: 'var(--forest)' }} />
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>{card.label}</p>
                <p className="text-xl font-bold mt-0.5" style={{ color: 'var(--text-1)' }}>{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CRM connections */}
        <div className="rounded-xl p-5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>CRM Bağlantıları</h3>
            <Link to="/app/settings" className="text-xs" style={{ color: 'var(--forest)' }}>Yönet</Link>
          </div>
          {connections.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>Henüz bağlantı yok</p>
              <Link to="/app/settings" className="text-xs mt-2 inline-block" style={{ color: 'var(--forest)' }}>+ Bağlantı Ekle</Link>
            </div>
          ) : connections.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{c.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>{c.crmType}</p>
              </div>
              <span className="px-2 py-1 rounded-lg text-xs"
                style={{ background: c.syncStatus === 'done' ? 'rgba(74,222,128,0.1)' : 'var(--surface-modal)', color: c.syncStatus === 'done' ? '#4ade80' : 'var(--text-3)' }}>
                {c.syncStatus ?? 'idle'}
              </span>
            </div>
          ))}
        </div>

        {/* Support tickets */}
        <div className="rounded-xl p-5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Son Destek Talepleri</h3>
            <Link to="/app/support" className="text-xs" style={{ color: 'var(--forest)' }}>Tümü</Link>
          </div>
          {tickets.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>Henüz talep yok</div>
          ) : tickets.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{t.subject}</p>
                <p className="text-xs" style={{ color: priorityColors[t.priority] ?? 'var(--text-3)' }}>{t.priority}</p>
              </div>
              <span className="ml-3 flex-shrink-0 px-2 py-1 rounded-lg text-xs"
                style={{ background: 'rgba(251,146,60,0.1)', color: '#fb923c' }}>{t.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

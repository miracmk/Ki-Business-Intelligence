import { useEffect, useState } from 'react'
import { Database, LifeBuoy, MessageSquare, HardDrive, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../lib/api'

export default function Dashboard() {
  const [stats, setStats] = useState({ crmRecords: 0, openTickets: 0, aiSessions: 0, usedMB: 0, limitMB: 1024 })
  const [connections, setConnections] = useState<any[]>([])
  const [tickets, setTickets] = useState<any[]>([])
  useEffect(() => {
    Promise.all([
      api.get('/crm/connections'),
      api.get('/support/tickets?status=open'),
      api.get('/tenants/storage-usage'),
    ]).then(([crm, support, storage]) => {
      setConnections(crm.data.connections ?? [])
      setTickets((support.data.tickets ?? []).slice(0, 5))
      const used = storage.data.usedBytes ?? 0
      const limit = storage.data.limitBytes ?? 1073741824
      setStats(s => ({ ...s, usedMB: Math.round(used / 1024 / 1024), limitMB: Math.round(limit / 1024 / 1024) }))
    }).catch(console.error)
  }, [])

  const priorityColors: Record<string, string> = { low: 'text-green-400', medium: 'text-yellow-400', high: 'text-orange-400', urgent: 'text-red-400' }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <button onClick={() => window.location.reload()} className="flex items-center gap-2 px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg">
          <RefreshCw size={16} /> Yenile
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'CRM Bağlantıları', value: connections.length, icon: Database, color: 'blue' },
          { label: 'Açık Destek', value: tickets.length, icon: LifeBuoy, color: 'orange' },
          { label: 'AI Chat', icon: MessageSquare, color: 'purple', value: 0 },
          { label: `Depolama`, value: `${stats.usedMB}/${stats.limitMB} MB`, icon: HardDrive, color: 'green' },
        ].map((card, i) => (
          <div key={i} className="p-6 bg-[#111111] rounded-xl border border-[#2a2a2a]">
            <div className="flex items-center gap-4">
              <div className={`p-3 bg-${card.color}-900/30 rounded-lg`}>
                <card.icon size={24} className={`text-${card.color}-500`} />
              </div>
              <div>
                <p className="text-gray-500 text-sm">{card.label}</p>
                <p className="text-2xl font-bold text-white">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 bg-[#111111] rounded-xl border border-[#2a2a2a]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">CRM Bağlantıları</h3>
            <Link to="/settings" className="text-[#6366f1] text-sm hover:underline">Yönet</Link>
          </div>
          {connections.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              <p>Henüz bağlantı yok</p>
              <Link to="/settings" className="text-[#6366f1] text-sm mt-2 inline-block">+ Bağlantı Ekle</Link>
            </div>
          ) : connections.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between py-3 border-b border-[#2a2a2a] last:border-0">
              <div>
                <p className="text-white font-medium">{c.name}</p>
                <p className="text-gray-500 text-sm">{c.crmType}</p>
              </div>
              <span className={`px-2 py-1 rounded text-xs ${c.syncStatus === 'done' ? 'bg-green-900/30 text-green-400' : 'bg-gray-900/30 text-gray-400'}`}>
                {c.syncStatus ?? 'idle'}
              </span>
            </div>
          ))}
        </div>

        <div className="p-6 bg-[#111111] rounded-xl border border-[#2a2a2a]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Son Destek Talepleri</h3>
            <Link to="/support" className="text-[#6366f1] text-sm hover:underline">Tümü</Link>
          </div>
          {tickets.length === 0 ? (
            <div className="text-gray-500 text-center py-8">Henüz talep yok</div>
          ) : tickets.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between py-3 border-b border-[#2a2a2a] last:border-0">
              <div>
                <p className="text-white text-sm font-medium truncate max-w-[200px]">{t.subject}</p>
                <p className={`text-xs ${priorityColors[t.priority] ?? 'text-gray-400'}`}>{t.priority}</p>
              </div>
              <span className="px-2 py-1 bg-orange-900/30 text-orange-400 rounded text-xs">{t.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

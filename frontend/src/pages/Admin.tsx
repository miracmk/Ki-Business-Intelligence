import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { BarChart3, Sparkles, ShieldCheck, Users, RefreshCw } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../store/auth'

const tabs = [
  { id: 'overview', label: 'Genel Bakış' },
  { id: 'entities', label: 'Entityler' },
  { id: 'support', label: 'Destek' },
]

const serviceCategories = [
  { value: 'data_integration', label: 'Data Integration' },
  { value: 'ai_chat', label: 'AI Chat' },
  { value: 'db_services', label: 'DB Services' },
  { value: 'accounting_module', label: 'Accounting Module' },
  { value: 'crm_integration', label: 'CRM Integration' },
  { value: 'erp_integration', label: 'ERP Integration' },
  { value: 'payment_integration', label: 'Payment Integration' },
  { value: 'file_storage', label: 'File Storage' },
  { value: 'support_system', label: 'Support System' },
  { value: 'platform_general', label: 'Platform General' },
  { value: 'other', label: 'Other' },
]


export default function Admin() {
  const { user } = useAuth()
  const [currentTab, setCurrentTab] = useState('overview')
  const [metrics, setMetrics] = useState<any>(null)
  const [entities, setEntities] = useState<any[]>([])
  const [tickets, setTickets] = useState<any[]>([])
  const [entityQuery, setEntityQuery] = useState('')
  const [ticketFilter, setTicketFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [ticketDetail, setTicketDetail] = useState<any>(null)

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'supervisor') return
    api.get('/admin/metrics').then(res => setMetrics(res.data)).catch(console.error)
    api.get('/admin/entities?limit=20').then(res => setEntities(res.data.entities ?? [])).catch(console.error)
    api.get('/admin/support/tickets').then(res => setTickets(res.data.tickets ?? [])).catch(console.error)
  }, [user])

  const activeEntities = useMemo(() => entities.filter((entity) => !entityQuery || String(entity.company_name ?? entity.client_id ?? '').toLowerCase().includes(entityQuery.toLowerCase())), [entities, entityQuery])
  const activeTickets = useMemo(() => tickets.filter((ticket) => (!ticketFilter || ticket.service_category?.includes(ticketFilter)) && (!statusFilter || ticket.status === statusFilter)), [tickets, ticketFilter, statusFilter])

  const loadTicket = async (ticket: any) => {
    setTicketDetail(ticket)
    try {
      const { data } = await api.get(`/support/tickets/${ticket.id}/messages`)
      setTicketDetail({ ...ticket, messages: data.messages ?? [] })
    } catch (error) {
      console.error(error)
    }
  }

  if (user?.role !== 'admin' && user?.role !== 'supervisor') {
    return <Navigate to="/app/dashboard" replace />
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Platform Management</h1>
          <p className="text-gray-400">Ki Business Intelligence — KIBI AI Platform Yönetimi</p>
        </div>
        <button onClick={() => window.location.reload()} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#6366f1] hover:bg-[#4f46e5] text-white">
          <RefreshCw size={16} /> Yenile
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setCurrentTab(tab.id)} className={`px-4 py-2 rounded-2xl text-sm font-medium ${currentTab === tab.id ? 'bg-[#6366f1] text-white' : 'bg-[#111111] text-gray-300 border border-[#2a2a2a]'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {currentTab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="p-6 bg-[#111111] rounded-3xl border border-[#2a2a2a]">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-[#6366f1] to-[#4f46e5]"><Sparkles size={20} className="text-white" /></div>
              <div>
                <h2 className="text-sm text-gray-400">Toplam Entity</h2>
                <p className="text-3xl font-semibold text-white">{metrics?.metrics?.total_entities ?? 0}</p>
              </div>
            </div>
            <p className="text-sm text-gray-500">Platform genelinde kayıtlı entity sayısı.</p>
          </div>

          <div className="p-6 bg-[#111111] rounded-3xl border border-[#2a2a2a]">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-[#10b981] to-[#14b8a6]"><ShieldCheck size={20} className="text-white" /></div>
              <div>
                <h2 className="text-sm text-gray-400">Açık Destek Talepleri</h2>
                <p className="text-3xl font-semibold text-white">{metrics?.openTickets ?? 0}</p>
              </div>
            </div>
            <p className="text-sm text-gray-500">KIBI destek sisteminde çözülmeyi bekleyen talepler.</p>
          </div>

          <div className="p-6 bg-[#111111] rounded-3xl border border-[#2a2a2a]">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-[#f59e0b] to-[#f97316]"><Users size={20} className="text-white" /></div>
              <div>
                <h2 className="text-sm text-gray-400">Ücretli / Ücretsiz Entity</h2>
                <p className="text-3xl font-semibold text-white">{metrics?.paidEntities ?? 0} / {metrics?.freeEntities ?? 0}</p>
              </div>
            </div>
            <p className="text-sm text-gray-500">Abonelik durumu olan müşterilerin dağılımı.</p>
          </div>
        </div>
      )}

      {currentTab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="p-6 bg-[#111111] rounded-3xl border border-[#2a2a2a]">
            <h3 className="text-lg font-semibold text-white mb-4">CRM Entegrasyon Dağılımı</h3>
            {metrics?.crmTypeDistribution?.length ? (
              <div className="space-y-3">
                {metrics.crmTypeDistribution.map((item: any) => (
                  <div key={item.crm_type} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-300">{item.crm_type}</span>
                    <span className="text-sm font-semibold text-white">{item.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">Veri bulunamadı.</p>
            )}
          </div>

          <div className="p-6 bg-[#111111] rounded-3xl border border-[#2a2a2a]">
            <h3 className="text-lg font-semibold text-white mb-4">En Çok Token Kullanan Entityler</h3>
            {metrics?.topTokenUsers?.length ? (
              <div className="space-y-3">
                {metrics.topTokenUsers.map((item: any) => (
                  <div key={item.entity_id} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-white">{item.tenant_name || item.entity_id}</p>
                      <p className="text-xs text-gray-500">{item.client_id ?? item.entity_id}</p>
                    </div>
                    <span className="text-sm font-semibold text-white">{item.tokens}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">Veri bulunamadı.</p>
            )}
          </div>
        </div>
      )}

      {currentTab === 'entities' && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <BarChart3 size={20} className="text-[#6366f1]" />
              <h2 className="text-xl font-semibold text-white">Entityler</h2>
            </div>
            <input
              placeholder="Ara..."
              value={entityQuery}
              onChange={(e) => setEntityQuery(e.target.value)}
              className="max-w-sm px-4 py-3 rounded-2xl bg-[#111111] border border-[#2a2a2a] text-white"
            />
          </div>
          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-left text-sm text-gray-300">
              <thead>
                <tr>
                  <th className="px-6 py-4">Client</th>
                  <th className="px-6 py-4">Şirket</th>
                  <th className="px-6 py-4">Ülke</th>
                  <th className="px-6 py-4">Token</th>
                  <th className="px-6 py-4">Durum</th>
                </tr>
              </thead>
              <tbody>
                {activeEntities.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">Entity bulunamadı.</td></tr>
                ) : activeEntities.map((entity) => (
                  <tr key={entity.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                    <td className="px-6 py-4 text-white">{entity.client_id || entity.clientId}</td>
                    <td className="px-6 py-4">{entity.company_name || entity.companyName || '-'}</td>
                    <td className="px-6 py-4">{entity.country || '-'}</td>
                    <td className="px-6 py-4">{entity.tokens ?? '-'}</td>
                    <td className="px-6 py-4">{entity.is_active ? 'Aktif' : 'Pasif'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {currentTab === 'support' && (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="p-6 rounded-3xl border border-[#2a2a2a] bg-[#111111] space-y-4">
            <h2 className="text-lg font-semibold text-white">Destek Ticketları</h2>
            <select value={ticketFilter} onChange={(e) => setTicketFilter(e.target.value)} className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl text-white">
              <option value="">Tüm Kategoriler</option>
              {serviceCategories.map(cat => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl text-white">
              <option value="">Tüm Durumlar</option>
              <option value="open">Açık</option>
              <option value="kibi_processing">KIBI İşliyor</option>
              <option value="escalated">Eskalasyon</option>
              <option value="in_progress">İşlemde</option>
              <option value="resolved">Çözüldü</option>
            </select>
            <div className="space-y-3 max-h-[520px] overflow-y-auto">
              {activeTickets.length === 0 ? (
                <div className="text-gray-500">Filtreye uygun ticket yok.</div>
              ) : activeTickets.map((ticket) => (
                <button key={ticket.id} onClick={() => loadTicket(ticket)} className="w-full text-left p-4 rounded-3xl border border-[#2a2a2a] hover:bg-[#1a1a1a]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-white truncate">{ticket.ticket_number || ticket.ticketNumber}</span>
                    <span className="text-xs text-gray-400">{ticket.priority}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1 truncate">{ticket.subject}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="p-6 rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            {!ticketDetail ? (
              <div className="text-gray-500">Bir ticket seçin.</div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-white">{ticketDetail.subject}</h3>
                    <p className="text-sm text-gray-400">{ticketDetail.service_category}</p>
                  </div>
                  <span className="text-sm text-gray-300">{ticketDetail.status}</span>
                </div>
                <div className="grid gap-3 mb-4 sm:grid-cols-2">
                  <div className="p-4 rounded-3xl bg-[#0a0a0a] border border-[#2a2a2a]">
                    <p className="text-xs text-gray-400">Intent</p>
                    <p className="text-white">{ticketDetail.intent || '-'}</p>
                  </div>
                  <div className="p-4 rounded-3xl bg-[#0a0a0a] border border-[#2a2a2a]">
                    <p className="text-xs text-gray-400">Mood</p>
                    <p className="text-white">{ticketDetail.mood || '-'}</p>
                  </div>
                </div>
                <div className="space-y-3 mb-4">
                  {ticketDetail.messages?.map((message: any) => (
                    <div key={message.id} className="p-4 rounded-3xl bg-[#0a0a0a] border border-[#2a2a2a]">
                      <p className="text-xs text-gray-500">{message.sender_type}</p>
                      <p className="text-white mt-2">{message.content}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

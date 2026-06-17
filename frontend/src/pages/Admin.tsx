import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { BarChart3, Sparkles, ShieldCheck, Users, RefreshCw, Mail, Phone, Pencil, X, Bot } from 'lucide-react'
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

const PLAN_LABELS: Record<string, string> = {
  free:          'Ücretsiz',
  starter:       'Başlangıç',    // legacy
  basic:         'Başlangıç',
  growth:        'Büyüme',       // legacy
  premium:       'Premium',
  enterprise:    'Kurumsal',
  custom_models: 'Özel Modeller',
}

const PLAN_COLORS: Record<string, string> = {
  free:          'bg-gray-700 text-gray-300',
  starter:       'bg-blue-900 text-blue-300',
  basic:         'bg-blue-900 text-blue-300',
  growth:        'bg-emerald-900 text-emerald-300',
  premium:       'bg-emerald-900 text-emerald-300',
  enterprise:    'bg-purple-900 text-purple-300',
  custom_models: 'bg-orange-900 text-orange-300',
}

function PlanBadge({ plan }: { plan?: string }) {
  const p = plan ?? 'free'
  return (
    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${PLAN_COLORS[p] ?? 'bg-gray-700 text-gray-300'}`}>
      {PLAN_LABELS[p] ?? p}
    </span>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${active ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}`}>
      {active ? 'Aktif' : 'Pasif'}
    </span>
  )
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

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

  // Edit modal state
  const [editEntity, setEditEntity] = useState<any>(null)
  const [editPlan, setEditPlan] = useState('free')
  const [editIsActive, setEditIsActive] = useState(true)
  const [editSaving, setEditSaving] = useState(false)

  // AI draft state
  const [aiDraft, setAiDraft] = useState('')
  const [aiDraftLoading, setAiDraftLoading] = useState(false)

  const loadEntities = () =>
    api.get('/admin/entities?limit=50').then(res => setEntities(res.data.entities ?? [])).catch(console.error)

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'supervisor') return
    api.get('/admin/metrics').then(res => setMetrics(res.data)).catch(console.error)
    loadEntities()
    api.get('/admin/support/tickets').then(res => setTickets(res.data.tickets ?? [])).catch(console.error)
  }, [user])

  const activeEntities = useMemo(() =>
    entities.filter(e => !entityQuery || [e.company_name, e.client_id, e.owner_email].some(v =>
      String(v ?? '').toLowerCase().includes(entityQuery.toLowerCase())
    )),
    [entities, entityQuery]
  )

  const activeTickets = useMemo(() =>
    tickets.filter(t =>
      (!ticketFilter || t.service_category?.includes(ticketFilter)) &&
      (!statusFilter || t.status === statusFilter)
    ),
    [tickets, ticketFilter, statusFilter]
  )

  const openEditModal = (entity: any) => {
    setEditEntity(entity)
    setEditPlan(entity.plan_name ?? 'free')
    setEditIsActive(entity.tenant_is_active ?? true)
  }

  const closeEditModal = () => {
    setEditEntity(null)
    setEditSaving(false)
  }

  const saveEntityEdit = async () => {
    if (!editEntity) return
    setEditSaving(true)
    try {
      const planChanged = editPlan !== (editEntity.plan_name ?? 'free')
      const statusChanged = editIsActive !== (editEntity.tenant_is_active ?? true)
      await Promise.all([
        planChanged   ? api.put(`/admin/entities/${editEntity.id}/plan`,   { planName: editPlan }) : null,
        statusChanged ? api.put(`/admin/entities/${editEntity.id}/status`, { isActive: editIsActive }) : null,
      ].filter(Boolean))
      await loadEntities()
      closeEditModal()
    } catch (e) {
      console.error(e)
    } finally {
      setEditSaving(false)
    }
  }

  const loadTicket = async (ticket: any) => {
    setTicketDetail(ticket)
    setAiDraft('')
    try {
      const { data } = await api.get(`/support/tickets/${ticket.id}/messages`)
      setTicketDetail({ ...ticket, messages: data.messages ?? [] })
    } catch (error) {
      console.error(error)
    }
  }

  const generateAiDraft = async () => {
    if (!ticketDetail) return
    setAiDraftLoading(true)
    setAiDraft('')
    try {
      const { data } = await api.post(`/admin/support/tickets/${ticketDetail.id}/ai-draft`)
      setAiDraft(data.draft ?? '')
    } catch (e: any) {
      setAiDraft('Taslak oluşturulamadı: ' + (e.response?.data?.error ?? e.message))
    } finally {
      setAiDraftLoading(false)
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

      {/* ── Overview ─────────────────────────────────────────────────── */}
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

      {/* ── Entities ─────────────────────────────────────────────────── */}
      {currentTab === 'entities' && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <BarChart3 size={20} className="text-[#6366f1]" />
              <h2 className="text-xl font-semibold text-white">Entityler</h2>
              <span className="text-sm text-gray-500">{activeEntities.length} kayıt</span>
            </div>
            <input
              placeholder="Ara (şirket, client ID, e-posta)..."
              value={entityQuery}
              onChange={(e) => setEntityQuery(e.target.value)}
              className="max-w-sm px-4 py-3 rounded-2xl bg-[#111111] border border-[#2a2a2a] text-white"
            />
          </div>

          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-left text-sm text-gray-300">
              <thead className="border-b border-[#2a2a2a]">
                <tr>
                  <th className="px-4 py-4 text-gray-400 font-medium">Entity ID</th>
                  <th className="px-4 py-4 text-gray-400 font-medium">Şirket</th>
                  <th className="px-4 py-4 text-gray-400 font-medium">İletişim</th>
                  <th className="px-4 py-4 text-gray-400 font-medium">Paket</th>
                  <th className="px-4 py-4 text-gray-400 font-medium">Kayıt</th>
                  <th className="px-4 py-4 text-gray-400 font-medium">Durum</th>
                  <th className="px-4 py-4 text-gray-400 font-medium">Bakiye</th>
                  <th className="px-4 py-4 text-gray-400 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {activeEntities.length === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-500">Entity bulunamadı.</td></tr>
                ) : activeEntities.map((entity) => (
                  <tr key={entity.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-4 py-4">
                      <span className="font-mono text-xs text-gray-400">{entity.client_id ?? String(entity.id ?? '').slice(0, 8)}</span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-white font-medium">{entity.company_name ?? '-'}</p>
                      <p className="text-xs text-gray-500">{entity.country ?? ''}</p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        {entity.owner_email && (
                          <a href={`mailto:${entity.owner_email}`} className="flex items-center gap-1 text-xs text-[#6366f1] hover:underline">
                            <Mail size={11} />{entity.owner_email}
                          </a>
                        )}
                        {entity.owner_phone && (
                          <a href={`tel:${entity.owner_phone}`} className="flex items-center gap-1 text-xs text-[#10b981] hover:underline">
                            <Phone size={11} />{entity.owner_phone}
                          </a>
                        )}
                        {!entity.owner_email && !entity.owner_phone && <span className="text-gray-600">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <PlanBadge plan={entity.plan_name} />
                    </td>
                    <td className="px-4 py-4 text-gray-400 text-xs whitespace-nowrap">
                      {formatDate(entity.created_at)}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge active={entity.tenant_is_active ?? true} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-0.5">
                        {entity.balance_usd != null && (
                          <span className="text-xs text-white">${Number(entity.balance_usd).toFixed(2)}</span>
                        )}
                        {entity.balance_ki_coin != null && Number(entity.balance_ki_coin) > 0 && (
                          <span className="text-xs text-[#f59e0b]">{Number(entity.balance_ki_coin).toFixed(4)} KC</span>
                        )}
                        {entity.balance_usd == null && <span className="text-gray-600 text-xs">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => openEditModal(entity)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300 text-xs"
                      >
                        <Pencil size={12} /> Düzenle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Support ──────────────────────────────────────────────────── */}
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
                <button key={ticket.id} onClick={() => loadTicket(ticket)} className={`w-full text-left p-4 rounded-3xl border transition-colors ${ticketDetail?.id === ticket.id ? 'border-[#6366f1] bg-[#1a1a2e]' : 'border-[#2a2a2a] hover:bg-[#1a1a1a]'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-white truncate">{ticket.ticket_number || ticket.ticketNumber}</span>
                    <span className="text-xs text-gray-400">{ticket.priority}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1 truncate">{ticket.subject}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 rounded-3xl border border-[#2a2a2a] bg-[#111111] space-y-4">
            {!ticketDetail ? (
              <div className="text-gray-500">Bir ticket seçin.</div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-white">{ticketDetail.subject}</h3>
                    <p className="text-sm text-gray-400">{ticketDetail.service_category} · {ticketDetail.status}</p>
                  </div>
                  <button
                    onClick={generateAiDraft}
                    disabled={aiDraftLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#6366f1] to-[#4f46e5] hover:opacity-90 disabled:opacity-50 text-white text-sm whitespace-nowrap"
                  >
                    <Bot size={15} />
                    {aiDraftLoading ? 'Oluşturuluyor...' : 'KIBI AI Taslak'}
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="p-4 rounded-3xl bg-[#0a0a0a] border border-[#2a2a2a]">
                    <p className="text-xs text-gray-400">Intent</p>
                    <p className="text-white">{ticketDetail.intent || '-'}</p>
                  </div>
                  <div className="p-4 rounded-3xl bg-[#0a0a0a] border border-[#2a2a2a]">
                    <p className="text-xs text-gray-400">Mood</p>
                    <p className="text-white">{ticketDetail.mood || '-'}</p>
                  </div>
                </div>

                <div className="space-y-3 max-h-[280px] overflow-y-auto">
                  {ticketDetail.messages?.map((message: any) => (
                    <div key={message.id} className={`p-4 rounded-3xl border ${message.sender_type === 'customer' ? 'border-[#2a2a2a] bg-[#0a0a0a]' : 'border-[#1e3a2a] bg-[#0a1a0f]'}`}>
                      <p className="text-xs text-gray-500 mb-1">{message.sender_type === 'customer' ? 'Müşteri' : 'Destek'}</p>
                      <p className="text-white text-sm">{message.content}</p>
                    </div>
                  ))}
                  {(!ticketDetail.messages || ticketDetail.messages.length === 0) && (
                    <p className="text-gray-500 text-sm">Henüz mesaj yok.</p>
                  )}
                </div>

                {aiDraft && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Bot size={14} className="text-[#6366f1]" />
                      <p className="text-xs font-medium text-[#6366f1]">KIBI AI Yanıt Taslağı</p>
                    </div>
                    <textarea
                      value={aiDraft}
                      onChange={(e) => setAiDraft(e.target.value)}
                      rows={6}
                      className="w-full px-4 py-3 rounded-2xl bg-[#0a1a3a] border border-[#2a3a6a] text-white text-sm resize-none focus:outline-none focus:border-[#6366f1]"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => navigator.clipboard.writeText(aiDraft)}
                        className="px-4 py-2 rounded-xl bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300 text-xs"
                      >
                        Kopyala
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Edit Entity Modal ─────────────────────────────────────────── */}
      {editEntity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeEditModal}>
          <div className="w-full max-w-md bg-[#111111] border border-[#2a2a2a] rounded-3xl p-6 space-y-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Entity Düzenle</h2>
              <button onClick={closeEditModal} className="p-2 rounded-xl hover:bg-[#2a2a2a] text-gray-400"><X size={18} /></button>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-gray-400">Şirket</p>
              <p className="text-white font-medium">{editEntity.company_name ?? editEntity.client_id}</p>
              <p className="text-xs text-gray-500 font-mono">{editEntity.id}</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-400">Paket (Tier)</label>
              <select
                value={editPlan}
                onChange={e => setEditPlan(e.target.value)}
                className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl text-white"
              >
                <option value="free">Ücretsiz — $0/ay (1 kullanıcı, 40 mesaj)</option>
                <option value="basic">Başlangıç — $25/ay (3 kullanıcı, 150 mesaj)</option>
                <option value="premium">Premium — $100/ay (10 kullanıcı, 750 mesaj)</option>
                <option value="enterprise">Kurumsal — $1000/ay (50 kullanıcı, 4500 mesaj)</option>
                <option value="custom_models">Özel Modeller — $50/ay + $0.05/mesaj</option>
              </select>
            </div>

            <div className="flex items-center justify-between p-4 bg-[#0a0a0a] rounded-2xl border border-[#2a2a2a]">
              <div>
                <p className="text-sm text-white">Entity Durumu</p>
                <p className="text-xs text-gray-500">Aktif / Pasif</p>
              </div>
              <button
                onClick={() => setEditIsActive(!editIsActive)}
                className={`relative w-12 h-6 rounded-full transition-colors ${editIsActive ? 'bg-[#6366f1]' : 'bg-[#3a3a3a]'}`}
              >
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${editIsActive ? 'translate-x-7' : 'translate-x-1'}`} />
              </button>
            </div>

            {editEntity.owner_email && (
              <div className="flex gap-3">
                <a href={`mailto:${editEntity.owner_email}`} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0a0a0a] border border-[#2a2a2a] text-gray-300 text-sm hover:bg-[#1a1a1a]">
                  <Mail size={14} /> E-posta Gönder
                </a>
                {editEntity.owner_phone && (
                  <a href={`tel:${editEntity.owner_phone}`} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0a0a0a] border border-[#2a2a2a] text-gray-300 text-sm hover:bg-[#1a1a1a]">
                    <Phone size={14} /> Ara
                  </a>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={closeEditModal} className="flex-1 py-3 rounded-2xl bg-[#2a2a2a] text-gray-300 hover:bg-[#3a3a3a]">
                İptal
              </button>
              <button
                onClick={saveEntityEdit}
                disabled={editSaving}
                className="flex-1 py-3 rounded-2xl bg-[#6366f1] hover:bg-[#4f46e5] text-white disabled:opacity-50"
              >
                {editSaving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

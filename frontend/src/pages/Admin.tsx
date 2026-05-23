import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { BarChart3, Sparkles, ShieldCheck, Users, RefreshCw, Send } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../store/auth'

const MODEL_ROLE_INFO: Record<string, { label: string; desc: string }> = {
  conversation:       { label: 'Konuşma', desc: 'Kullanıcı ile doğrudan sohbet eden ana model' },
  db_search:          { label: 'DB Arama', desc: 'SQL sorgu üretimi ve veritabanı aramaları' },
  qdrant_search:      { label: 'Vektör Arama', desc: 'Qdrant semantik vektör araması' },
  redis_search:       { label: 'Cache Arama', desc: 'Redis önbellek ve hızlı veri erişimi' },
  intent:             { label: 'Niyet Tespiti', desc: 'Kullanıcı niyetini anlama ve sınıflandırma' },
  support_intent:     { label: 'Destek Niyet', desc: 'Destek taleplerinde niyet tespiti' },
  support_refine:     { label: 'Destek Geliştirme', desc: 'Destek yanıtlarını iyileştirme ve netleştirme' },
  support_resolver:   { label: 'Destek Çözüm', desc: 'Çözüm önerisi üretme' },
  support_answering:  { label: 'Destek Yanıt', desc: 'Son kullanıcıya yanıt oluşturma' },
}

const tabs = [
  { id: 'overview', label: 'Genel Bakış' },
  { id: 'entities', label: 'Entityler' },
  { id: 'chat', label: 'KIBI Chat' },
  { id: 'support', label: 'Destek' },
  { id: 'models', label: 'Model Yönetimi' },
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
  const [models, setModels] = useState<any[]>([])
  const [chatMessages, setChatMessages] = useState<any[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [entityQuery, setEntityQuery] = useState('')
  const [ticketFilter, setTicketFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [ticketDetail, setTicketDetail] = useState<any>(null)
  const [modelEdit, setModelEdit] = useState<any>(null)
  const [modelForm, setModelForm] = useState<any>({ primaryModel: '', fallback1: '', fallback2: '', fallback3: '', provider: 'openrouter', apiKey: '', temperature: 0.4, maxTokens: 1500, isActive: true })
  const [openrouterModels, setOpenrouterModels] = useState<any[]>([])

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'supervisor') return
    api.get('/admin/metrics').then(res => setMetrics(res.data)).catch(console.error)
    api.get('/admin/entities?limit=20').then(res => setEntities(res.data.entities ?? [])).catch(console.error)
    api.get('/admin/support/tickets').then(res => setTickets(res.data.tickets ?? [])).catch(console.error)
    api.get('/admin/models').then(res => setModels(res.data.models ?? [])).catch(console.error)
    api.get('/ai/openrouter-models').then(res => setOpenrouterModels(res.data.models ?? [])).catch(console.error)
  }, [user])

  const activeEntities = useMemo(() => entities.filter((entity) => !entityQuery || String(entity.company_name ?? entity.client_id ?? '').toLowerCase().includes(entityQuery.toLowerCase())), [entities, entityQuery])
  const activeTickets = useMemo(() => tickets.filter((ticket) => (!ticketFilter || ticket.service_category?.includes(ticketFilter)) && (!statusFilter || ticket.status === statusFilter)), [tickets, ticketFilter, statusFilter])

  const handleModelEdit = (model: any) => {
    setModelEdit(model)
    // Drizzle ORM returns camelCase field names
    setModelForm({
      primaryModel: model.primaryModel || '',
      fallback1: model.fallback1 || '',
      fallback2: model.fallback2 || '',
      fallback3: model.fallback3 || '',
      provider: model.provider || 'openrouter',
      apiKey: model.apiKey || '',
      temperature: Number(model.temperature) || 0.4,
      maxTokens: Number(model.maxTokens) || 1500,
      isActive: model.isActive ?? true,
    })
  }

  const saveModelConfig = async () => {
    if (!modelEdit) return
    await api.put(`/admin/models/${modelEdit.modelRole}`, modelForm)
    setModelEdit(null)
    api.get('/admin/models').then(res => setModels(res.data.models ?? [])).catch(console.error)
  }

  const sendChat = async () => {
    if (!chatInput.trim()) return
    setChatMessages((prev) => [...prev, { role: 'user', content: chatInput }])
    setChatLoading(true)
    try {
      const sessionId = localStorage.getItem('kibi-admin-session') || `admin-${Date.now()}`
      localStorage.setItem('kibi-admin-session', sessionId)
      const { data } = await api.post('/kibi/chat', { message: chatInput, sessionId })
      setChatMessages((prev) => [...prev, { role: 'assistant', content: data.response || data.answer || 'Yanıt yok' }])
      setChatInput('')
    } catch (error) {
      console.error(error)
      setChatMessages((prev) => [...prev, { role: 'assistant', content: 'Mesaj gönderilemedi.' }])
    } finally {
      setChatLoading(false)
    }
  }

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

      {currentTab === 'chat' && (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="space-y-4">
            <div className="p-6 rounded-3xl border border-[#2a2a2a] bg-[#111111]">
              <h3 className="text-lg font-semibold text-white mb-3">Kısa Açıklama</h3>
              <p className="text-gray-400 text-sm">KIBI ile platform genelindeki veriler üzerinden sorular sorabilirsiniz.</p>
            </div>
          </div>
          <div className="flex flex-col rounded-3xl border border-[#2a2a2a] bg-[#111111] overflow-hidden">
            <div className="p-6 border-b border-[#2a2a2a]"><h2 className="text-lg font-semibold text-white">KIBI Admin Chat</h2></div>
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              {chatMessages.length === 0 && <div className="text-gray-500">Sorunuzu aşağıya yazın.</div>}
              {chatMessages.map((msg, index) => (
                <div key={index} className={`max-w-[80%] ${msg.role === 'user' ? 'ml-auto bg-[#6366f1] text-white' : 'bg-[#0f172a] text-gray-200'} rounded-3xl px-4 py-3`}> {msg.content}</div>
              ))}
            </div>
            <div className="p-4 border-t border-[#2a2a2a] bg-[#090a0f]">
              <div className="flex gap-3">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  rows={2}
                  className="flex-1 rounded-3xl border border-[#2a2a2a] bg-[#111111] px-4 py-3 text-white"
                  placeholder="KIBI'ye sorun..."
                />
                <button onClick={sendChat} disabled={chatLoading} className="flex items-center gap-2 px-4 py-3 rounded-3xl bg-[#6366f1] text-white disabled:opacity-50">
                  <Send size={16} /> Gönder
                </button>
              </div>
            </div>
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

      {currentTab === 'models' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-[#2a2a2a] bg-[#111111] p-6">
              <h2 className="text-lg font-semibold text-white mb-4">KIBI AI — Model Konfigürasyonları</h2>
              <div className="space-y-4">
                {models.length === 0 ? (
                  <p className="text-gray-500">Henüz model konfigürasyonu bulunamadı.</p>
                ) : models.map((model) => {
                  const info = MODEL_ROLE_INFO[model.modelRole]
                  return (
                    <div key={model.id} className="rounded-3xl border border-[#2a2a2a] p-4 bg-[#0b1120]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-white font-semibold">{info?.label ?? model.modelRole}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${model.isActive ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
                              {model.isActive ? 'Aktif' : 'Pasif'}
                            </span>
                          </div>
                          {info?.desc && <p className="text-xs text-gray-500 mt-0.5">{info.desc}</p>}
                          <p className="text-sm text-[#6366f1] mt-1 truncate font-mono text-xs">{model.primaryModel || '— seçilmedi —'}</p>
                        </div>
                        <button onClick={() => handleModelEdit(model)} className="px-3 py-2 rounded-2xl bg-[#6366f1] text-white text-sm shrink-0">Düzenle</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-[#2a2a2a] bg-[#111111] p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Model Düzenle</h2>
            {!modelEdit ? (
              <p className="text-gray-500">Listeden bir model seçin.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-400">Rol</p>
                  <p className="mt-1 text-white font-medium">{MODEL_ROLE_INFO[modelEdit.modelRole]?.label ?? modelEdit.modelRole}</p>
                  {MODEL_ROLE_INFO[modelEdit.modelRole]?.desc && (
                    <p className="text-xs text-gray-500 mt-0.5">{MODEL_ROLE_INFO[modelEdit.modelRole].desc}</p>
                  )}
                </div>
                {(['primaryModel', 'fallback1', 'fallback2', 'fallback3'] as const).map((key, i) => (
                  <div key={key}>
                    <label className="text-sm text-gray-400">{i === 0 ? 'Ana Model' : `Yedek ${i}`}</label>
                    <select
                      value={modelForm[key]}
                      onChange={e => setModelForm({ ...modelForm, [key]: e.target.value })}
                      className="w-full mt-1 px-4 py-3 rounded-3xl bg-[#0a0a0a] border border-[#2a2a2a] text-white text-sm"
                    >
                      <option value="">— Seçin —</option>
                      {openrouterModels.map((m: any) => (
                        <option key={m.id} value={m.id}>{m.name ?? m.id}</option>
                      ))}
                      {modelForm[key] && !openrouterModels.find((m: any) => m.id === modelForm[key]) && (
                        <option value={modelForm[key]}>{modelForm[key]}</option>
                      )}
                    </select>
                  </div>
                ))}
                <div>
                  <label className="text-sm text-gray-400">Provider</label>
                  <select value={modelForm.provider} onChange={e => setModelForm({ ...modelForm, provider: e.target.value })} className="w-full mt-1 px-4 py-3 rounded-3xl bg-[#0a0a0a] border border-[#2a2a2a] text-white text-sm">
                    <option value="openrouter">OpenRouter</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="google">Google</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-400">API Key</label>
                  <input type="password" value={modelForm.apiKey} onChange={e => setModelForm({ ...modelForm, apiKey: e.target.value })} className="w-full mt-1 px-4 py-3 rounded-3xl bg-[#0a0a0a] border border-[#2a2a2a] text-white" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm text-gray-400">Temperature</label>
                    <input type="number" step="0.1" min="0" max="2" value={modelForm.temperature} onChange={e => setModelForm({ ...modelForm, temperature: Number(e.target.value) })} className="w-full mt-1 px-4 py-3 rounded-3xl bg-[#0a0a0a] border border-[#2a2a2a] text-white" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">Max Tokens</label>
                    <input type="number" value={modelForm.maxTokens} onChange={e => setModelForm({ ...modelForm, maxTokens: Number(e.target.value) })} className="w-full mt-1 px-4 py-3 rounded-3xl bg-[#0a0a0a] border border-[#2a2a2a] text-white" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input id="activeToggle" type="checkbox" checked={modelForm.isActive} onChange={e => setModelForm({ ...modelForm, isActive: e.target.checked })} className="h-4 w-4 accent-[#6366f1]" />
                  <label htmlFor="activeToggle" className="text-gray-300">Aktif</label>
                </div>
                <button onClick={saveModelConfig} className="w-full px-4 py-3 rounded-3xl bg-[#6366f1] text-white">Kaydet</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

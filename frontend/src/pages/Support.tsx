import { useEffect, useState, useRef } from 'react'
import { Plus, X, ChevronLeft, TrendingUp, Sparkles, Send, AlertTriangle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../store/auth'

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: '💬 WhatsApp', telegram: '✈️ Telegram', instagram: '📸 Instagram',
  email: '📧 E-posta', web: '🌐 Web', chat: '💬 Chat', other: 'Diğer',
}

const statusColors: Record<string, string> = {
  open:           'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  in_progress:    'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  escalated:      'bg-red-500/20 text-red-400 border border-red-500/30',
  kibi_processing:'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  resolved:       'bg-green-500/20 text-green-400 border border-green-500/30',
  closed:         'bg-gray-500/20 text-gray-400 border border-gray-500/30',
}
const statusLabels: Record<string, string> = {
  open: 'Açık', in_progress: 'İşlemde', escalated: 'Eskale', kibi_processing: 'İşleniyor', resolved: 'Çözüldü', closed: 'Kapatıldı',
}
const priorityColors: Record<string, string> = {
  low: 'text-green-400', medium: 'text-yellow-400', high: 'text-orange-400', urgent: 'text-red-400',
}

export default function Support() {
  const { user } = useAuth()
  const isElevated = ['admin', 'supervisor', 'entity_main', 'entity_supervisor'].includes((user as any)?.role ?? '')
  const [tickets,    setTickets]    = useState<any[]>([])
  const [selected,   setSelected]   = useState<any>(null)
  const [messages,   setMessages]   = useState<any[]>([])
  const [newMsg,     setNewMsg]     = useState('')
  const [sending,    setSending]    = useState(false)
  const [showModal,  setShowModal]  = useState(false)
  const [filter,     setFilter]     = useState('')
  const [aiLoading,  setAiLoading]  = useState(false)
  const [aiDraft,    setAiDraft]    = useState('')
  const [replyExpanded, setReplyExpanded] = useState(false)
  const [escalating, setEscalating] = useState(false)
  const [newTicket,  setNewTicket]  = useState({
    subject: '', description: '', priority: 'medium', serviceCategory: 'other', contactChannel: 'email',
  })
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadTickets = () =>
    api.get(`/support/tickets${filter ? `?status=${filter}` : ''}`)
      .then(r => setTickets(r.data.tickets ?? []))

  useEffect(() => { loadTickets() }, [filter])

  const selectTicket = (t: any) => {
    setSelected(t)
    setAiDraft('')
    setNewMsg('')
    api.get(`/support/tickets/${t.id}/messages`).then(r => setMessages(r.data.messages ?? []))
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if ((!newMsg.trim() && !aiDraft.trim()) || !selected || sending) return
    const content = aiDraft.trim() || newMsg.trim()
    setSending(true)
    try {
      await api.post(`/support/tickets/${selected.id}/messages`, { content, senderType: 'agent' })
      setNewMsg('')
      setAiDraft('')
      api.get(`/support/tickets/${selected.id}/messages`).then(r => setMessages(r.data.messages ?? []))
    } catch (e: any) {
      console.error(e)
    } finally {
      setSending(false)
    }
  }

  const escalate = async () => {
    if (!selected || escalating) return
    setEscalating(true)
    try {
      await api.post(`/support/tickets/${selected.id}/escalate`)
      setSelected({ ...selected, status: 'escalated' })
      loadTickets()
      api.get(`/support/tickets/${selected.id}/messages`).then(r => setMessages(r.data.messages ?? []))
    } catch (e: any) {
      console.error(e)
    } finally {
      setEscalating(false)
    }
  }

  const requestAiDraft = async () => {
    if (!selected || aiLoading) return
    setAiLoading(true)
    setAiDraft('')
    try {
      const res = await api.post(`/support/tickets/${selected.id}/ai-draft`)
      setAiDraft(res.data.draft ?? '')
      setReplyExpanded(true)
    } catch (e: any) {
      console.error(e)
    } finally {
      setAiLoading(false)
    }
  }

  const createTicket = async () => {
    if (!newTicket.subject || !newTicket.description) return
    try {
      await api.post('/support/tickets', newTicket)
      setShowModal(false)
      setNewTicket({ subject: '', description: '', priority: 'medium', serviceCategory: 'other', contactChannel: 'email' })
      loadTickets()
    } catch (e: any) {
      console.error(e)
    }
  }

  const lastMsg = messages[messages.length - 1]

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* ── Ticket List Sidebar ── */}
      <aside className="w-72 flex-shrink-0 flex flex-col" style={{ borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="p-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>Destek</h3>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: 'rgba(38,166,154,0.15)', color: 'var(--accent)', border: '1px solid rgba(38,166,154,0.25)' }}>
              <Plus size={13} /> Yeni
            </button>
          </div>
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg text-sm outline-none"
            style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
            <option value="">Tümü</option>
            <option value="open">Açık</option>
            <option value="in_progress">İşlemde</option>
            <option value="escalated">Eskale</option>
            <option value="resolved">Çözüldü</option>
            <option value="closed">Kapatıldı</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tickets.length === 0
            ? <p className="text-xs text-center py-10" style={{ color: 'var(--text-3)' }}>Talep yok</p>
            : tickets.map(t => (
              <div key={t.id}
                onClick={() => selectTicket(t)}
                className="p-4 cursor-pointer transition-all"
                style={{
                  borderBottom: '1px solid var(--border)',
                  background: selected?.id === t.id ? 'rgba(38,166,154,0.08)' : '',
                  borderLeft: selected?.id === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                }}>
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{t.subject}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColors[t.status] ?? ''}`}>
                    {statusLabels[t.status] ?? t.status}
                  </span>
                  <span className={`text-[11px] font-medium ${priorityColors[t.priority] ?? ''}`}>{t.priority}</span>
                </div>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>
                  {new Date(t.openedAt).toLocaleDateString('tr-TR')}
                </p>
              </div>
            ))
          }
        </div>
      </aside>

      {/* ── Detail Panel ── */}
      {!selected ? (
        <div className="flex-1 flex items-center justify-center flex-col gap-3" style={{ color: 'var(--text-3)' }}>
          <AlertTriangle size={36} className="opacity-30" />
          <p className="text-sm">Bir destek talebi seçin</p>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">

          {/* LEFT: Message History */}
          <div className="w-80 flex-shrink-0 flex flex-col" style={{ borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>SOHBET GEÇMİŞİ</p>
              <p className="text-sm font-medium mt-0.5 truncate" style={{ color: 'var(--text-1)' }}>{selected.ticketNumber}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {messages.length === 0
                ? <p className="text-xs text-center py-6" style={{ color: 'var(--text-3)' }}>Henüz mesaj yok</p>
                : messages.map((m: any) => (
                  <div key={m.id}
                    className={`flex ${m.senderType === 'agent' ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[85%] px-3 py-2 rounded-xl text-xs"
                      style={
                        m.senderType === 'system'
                          ? { background: 'rgba(251,191,36,0.08)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)', fontStyle: 'italic' }
                          : m.senderType === 'kibi' || m.senderType === 'ai'
                          ? { background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }
                          : m.senderType === 'agent'
                          ? { background: 'rgba(38,166,154,0.18)', color: 'var(--text-1)' }
                          : { background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }
                      }>
                      {(m.senderType === 'kibi' || m.senderType === 'ai') && (
                        <span className="block text-[9px] mb-1 opacity-70">AI</span>
                      )}
                      {m.content}
                    </div>
                  </div>
                ))
              }
              <div ref={bottomRef} />
            </div>
          </div>

          {/* RIGHT: Latest message + reply */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Header: ticket info */}
            <div className="px-5 py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg transition-all hover:opacity-70"
                style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}>
                <ChevronLeft size={16} />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>{selected.subject}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColors[selected.status] ?? ''}`}>
                    {statusLabels[selected.status] ?? selected.status}
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                    {CHANNEL_LABELS[selected.contact_channel || selected.contactChannel || 'web'] ?? 'Web'}
                    {(selected.external_contact_id || selected.externalContactId) &&
                      <span className="font-mono ml-1 opacity-70">· {(selected.external_contact_id || selected.externalContactId)?.slice(0, 20)}</span>}
                    {' '}· {selected.service_category || selected.serviceCategory || 'Genel'}
                    {(selected.external_contact_id || selected.externalContactId) &&
                      <span className="ml-1.5 opacity-60" title="Harici kullanıcı — cevaplandığında kanalına iletilir">
                        <ExternalLink size={9} className="inline" />
                      </span>}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select value={selected.status}
                  onChange={async e => {
                    await api.put(`/support/tickets/${selected.id}/status`, { status: e.target.value })
                    setSelected({ ...selected, status: e.target.value })
                    loadTickets()
                  }}
                  className="px-2 py-1 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                  <option value="open">Açık</option>
                  <option value="in_progress">İşlemde</option>
                  <option value="resolved">Çözüldü</option>
                  <option value="closed">Kapatıldı</option>
                </select>
              </div>
            </div>

            {/* Latest message display */}
            <div className="flex-1 overflow-y-auto p-5">
              {lastMsg ? (
                <div className="max-w-2xl">
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-3)' }}>
                    SON MESAJ — {lastMsg.senderType === 'customer' ? 'Müşteri' : lastMsg.senderType === 'agent' ? 'Agent' : lastMsg.senderType === 'ai' || lastMsg.senderType === 'kibi' ? 'AI' : 'Sistem'}
                  </p>
                  <div className="px-5 py-4 rounded-2xl text-sm leading-relaxed"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}>
                    {lastMsg.content}
                  </div>
                  <p className="text-[10px] mt-2" style={{ color: 'var(--text-3)' }}>
                    {new Date(lastMsg.createdAt).toLocaleString('tr-TR')}
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm" style={{ color: 'var(--text-3)' }}>Ticket seçili, henüz mesaj yok.</p>
                </div>
              )}
            </div>

            {/* Reply area */}
            <div className="p-4" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
              {/* AI Draft section */}
              {aiDraft && (
                <div className="mb-3 px-4 py-3 rounded-xl text-sm"
                  style={{ background: 'rgba(139,92,246,0.10)', border: '1px solid rgba(139,92,246,0.25)', color: 'var(--text-1)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={13} style={{ color: '#a78bfa' }} />
                    <span className="text-xs font-semibold" style={{ color: '#a78bfa' }}>AI Taslağı</span>
                    <button onClick={() => setAiDraft('')} className="ml-auto" style={{ color: 'var(--text-3)' }}>
                      <X size={13} />
                    </button>
                  </div>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">{aiDraft}</p>
                  <button
                    onClick={() => { setNewMsg(aiDraft); setAiDraft('') }}
                    className="mt-2 text-xs px-3 py-1 rounded-lg transition-all"
                    style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}>
                    Yanıt alanına kopyala
                  </button>
                </div>
              )}

              {/* Expandable textarea */}
              <div className="flex items-end gap-2 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>Yanıt</span>
                    <button onClick={() => setReplyExpanded(e => !e)} style={{ color: 'var(--text-3)' }}>
                      {replyExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </div>
                  <textarea
                    value={newMsg}
                    onChange={e => setNewMsg(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                    placeholder="Yanıtınızı yazın… (Shift+Enter yeni satır)"
                    rows={replyExpanded ? 6 : 3}
                    className="w-full px-3 py-2.5 rounded-xl text-sm resize-none outline-none transition-all"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Back */}
                <button onClick={() => setSelected(null)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                  <ChevronLeft size={13} /> Geri
                </button>

                {/* AI Draft */}
                <button onClick={requestAiDraft} disabled={aiLoading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                  style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.25)' }}>
                  <Sparkles size={13} />
                  {aiLoading ? 'AI yazıyor…' : 'AI ile Taslak'}
                </button>

                <div className="flex-1" />

                {/* Escalate */}
                {isElevated && (
                  <button onClick={escalate} disabled={escalating || selected?.status === 'escalated'}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
                    <TrendingUp size={13} />
                    {escalating ? 'Gönderiliyor…' : 'Üst Yönetime Gönder'}
                  </button>
                )}

                {/* Reply */}
                <button onClick={sendMessage} disabled={sending || (!newMsg.trim() && !aiDraft.trim())}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
                  style={{ background: 'rgba(38,166,154,0.85)', color: '#fff' }}>
                  <Send size={13} />
                  {sending ? 'Gönderiliyor…' : 'Cevapla'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── New Ticket Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl flex flex-col"
            style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Yeni Destek Talebi</h3>
              <button onClick={() => setShowModal(false)} style={{ color: 'var(--text-3)' }} className="hover:opacity-70">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <input placeholder="Başlık *" value={newTicket.subject}
                onChange={e => setNewTicket({ ...newTicket, subject: e.target.value })}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }} />
              <textarea placeholder="Açıklama *" value={newTicket.description}
                onChange={e => setNewTicket({ ...newTicket, description: e.target.value })}
                rows={4} className="w-full px-3 py-2 rounded-xl text-sm resize-none outline-none"
                style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }} />
              {[
                {
                  label: 'Kategori', key: 'serviceCategory',
                  options: [
                    ['data_integration','Data Integration'],['ai_chat','AI Chat'],['crm_integration','CRM Integration'],
                    ['accounting_module','Muhasebe Modülü'],['db_services','DB Servisleri'],['payment_integration','Ödeme Entegrasyonu'],
                    ['file_storage','Dosya Depolama'],['support_system','Destek Sistemi'],['platform_general','Genel Platform'],['other','Diğer'],
                  ],
                },
                {
                  label: 'Kanal', key: 'contactChannel',
                  options: [['email','Email'],['phone','Telefon'],['chat','Chat'],['whatsapp','WhatsApp'],['telegram','Telegram'],['support_portal','Destek Portalı'],['other','Diğer']],
                },
                {
                  label: 'Öncelik', key: 'priority',
                  options: [['low','Düşük'],['medium','Orta'],['high','Yüksek'],['urgent','Acil']],
                },
              ].map(({ key, options }) => (
                <select key={key} value={(newTicket as any)[key]}
                  onChange={e => setNewTicket({ ...newTicket, [key]: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                  {options.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                </select>
              ))}
            </div>
            <div className="flex gap-3 px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-2 rounded-xl text-sm transition-all"
                style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>İptal</button>
              <button onClick={createTicket} disabled={!newTicket.subject || !newTicket.description}
                className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                style={{ background: 'rgba(38,166,154,0.85)', color: '#fff' }}>Oluştur</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

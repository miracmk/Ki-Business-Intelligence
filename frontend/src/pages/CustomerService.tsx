import { useEffect, useState } from 'react'
import { Plus, X, RefreshCw, Lock, MessageCircle, Send } from 'lucide-react'
import api from '../lib/api'

interface Ticket { id: string; ticketNumber: string; subject: string; description?: string; status?: string; priority?: string; contactId?: string; createdAt?: string }
interface SlaPolicy { id: string; name: string; priority: string; firstResponseHours: number; resolutionHours: number }
interface Message { id: string; senderType: string; content: string; createdAt: string }

const STATUS_LBL: Record<string, string> = { open: 'Açık', in_progress: 'İşlemde', waiting_customer: 'Müşteri Bekleniyor', resolved: 'Çözüldü', closed: 'Kapalı' }
const STATUS_CLS: Record<string, string> = { open: 'bg-orange-900 text-orange-300', in_progress: 'bg-blue-900 text-blue-300', waiting_customer: 'bg-purple-900 text-purple-300', resolved: 'bg-green-900 text-green-300', closed: 'bg-gray-700 text-gray-300' }
const PRIORITY_CLS: Record<string, string> = { low: 'text-green-400', medium: 'text-yellow-400', high: 'text-orange-400', urgent: 'text-red-400' }

const iCls = 'w-full px-3 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-white text-sm focus:outline-none focus:border-[#6366f1]'

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-gray-400">{label}</label><div className="mt-1">{children}</div></div>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#0f0f0f] rounded-3xl border border-[#2a2a2a] p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-white" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function CustomerService() {
  const [entitled, setEntitled] = useState<boolean | null>(null)
  const [activating, setActivating] = useState(false)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [policies, setPolicies] = useState<SlaPolicy[]>([])
  const [loading, setLoading] = useState(false)
  const [newTicketModal, setNewTicketModal] = useState<any>(null)
  const [threadTicket, setThreadTicket] = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')

  const checkEntitlement = async () => {
    try {
      const { data } = await api.get('/entitlements')
      const row = (data.entitlements ?? []).find((e: any) => e.moduleKey === 'addon_customer_service')
      setEntitled(!!row && ['active', 'trial'].includes(row.status))
    } catch { setEntitled(false) }
  }

  const loadAll = async () => {
    setLoading(true)
    try {
      const [t, p] = await Promise.all([
        api.get('/customer-service/tickets').then(r => r.data.tickets ?? []),
        api.get('/customer-service/sla-policies').then(r => r.data.policies ?? []),
      ])
      setTickets(t); setPolicies(p)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  useEffect(() => { checkEntitlement() }, [])
  useEffect(() => { if (entitled) loadAll() }, [entitled])

  const activate = async () => {
    setActivating(true)
    try {
      await api.post('/entitlements/addon_customer_service/activate', {})
      await checkEntitlement()
    } catch (err) { console.error(err) }
    setActivating(false)
  }

  const openThread = async (t: Ticket) => {
    setThreadTicket(t)
    const { data } = await api.get(`/customer-service/tickets/${t.id}/messages`)
    setMessages(data.messages ?? [])
  }

  const sendMessage = async () => {
    if (!threadTicket || !newMessage.trim()) return
    await api.post(`/customer-service/tickets/${threadTicket.id}/messages`, { senderType: 'agent', content: newMessage })
    setNewMessage('')
    const { data } = await api.get(`/customer-service/tickets/${threadTicket.id}/messages`)
    setMessages(data.messages ?? [])
  }

  function NewTicketModal() {
    const [form, setForm] = useState({ subject: '', description: '', category: '', priority: 'medium', slaPolicyId: '' })
    const save = async () => {
      await api.post('/customer-service/tickets', { ...form, slaPolicyId: form.slaPolicyId || null })
      setNewTicketModal(null); loadAll()
    }
    return (
      <Modal title="Yeni Destek Bileti" onClose={() => setNewTicketModal(null)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><F label="Konu"><input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} className={iCls} /></F></div>
          <div className="sm:col-span-2"><F label="Açıklama"><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className={iCls} /></F></div>
          <F label="Kategori"><input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={iCls} /></F>
          <F label="Öncelik"><select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className={iCls}>
            <option value="low">Düşük</option><option value="medium">Orta</option><option value="high">Yüksek</option><option value="urgent">Acil</option>
          </select></F>
          <F label="SLA Politikası"><select value={form.slaPolicyId} onChange={e => setForm({ ...form, slaPolicyId: e.target.value })} className={iCls}>
            <option value="">Yok</option>{policies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></F>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setNewTicketModal(null)} className="px-4 py-2 rounded-2xl border border-[#2a2a2a] text-gray-400">İptal</button>
          <button onClick={save} className="px-4 py-2 rounded-2xl bg-[#6366f1] text-white">Oluştur</button>
        </div>
      </Modal>
    )
  }

  if (entitled === null) return <div className="p-8 text-gray-400">Yükleniyor...</div>

  if (!entitled) {
    return (
      <div className="p-8">
        <div className="max-w-xl mx-auto mt-16 p-8 rounded-3xl border border-[#2a2a2a] bg-[#111111] text-center space-y-4">
          <Lock size={40} className="mx-auto text-[#6366f1]" />
          <h1 className="text-2xl font-bold text-white">Customer Service Management</h1>
          <p className="text-gray-400">Müşteri destek biletleri, SLA takibi ve konuşma geçmişi — native add-on modülü. Aktive ederek kullanmaya başlayabilirsiniz.</p>
          <button onClick={activate} disabled={activating} className="px-6 py-3 rounded-2xl bg-[#6366f1] text-white font-medium disabled:opacity-50">
            {activating ? 'Etkinleştiriliyor...' : 'Modülü Etkinleştir'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Customer Service</h1>
          <p className="text-gray-400">Destek biletleri ve SLA takibi</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-gray-300 hover:text-white">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Yenile
          </button>
          <button onClick={() => setNewTicketModal({})} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Yeni Bilet</button>
        </div>
      </div>

      {newTicketModal !== null && <NewTicketModal />}

      {threadTicket && (
        <Modal title={`${threadTicket.ticketNumber} — ${threadTicket.subject}`} onClose={() => setThreadTicket(null)}>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {messages.length === 0 ? <p className="text-gray-500 text-sm">Henüz mesaj yok.</p> : messages.map(m => (
              <div key={m.id} className={`p-3 rounded-2xl text-sm ${m.senderType === 'agent' ? 'bg-[#6366f1]/20 ml-8' : 'bg-[#1a1a1a] mr-8'}`}>
                <p className="text-xs text-gray-400 mb-1">{m.senderType === 'agent' ? 'Temsilci' : 'Müşteri'}</p>
                <p className="text-white">{m.content}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newMessage} onChange={e => setNewMessage(e.target.value)} className={iCls} placeholder="Mesaj yaz..." onKeyDown={e => e.key === 'Enter' && sendMessage()} />
            <button onClick={sendMessage} className="px-4 py-2 rounded-2xl bg-[#6366f1] text-white"><Send size={16} /></button>
          </div>
        </Modal>
      )}

      <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
        <table className="min-w-full text-sm text-gray-300">
          <thead><tr><th className="px-6 py-4 text-left">Bilet No</th><th className="px-6 py-4 text-left">Konu</th><th className="px-6 py-4 text-left">Öncelik</th><th className="px-6 py-4 text-left">Durum</th><th className="px-6 py-4 text-right">İşlem</th></tr></thead>
          <tbody>
            {tickets.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-500">Bilet bulunamadı.</td></tr>
            ) : tickets.map(t => (
              <tr key={t.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                <td className="px-6 py-4 font-mono text-xs">{t.ticketNumber}</td>
                <td className="px-6 py-4 text-white">{t.subject}</td>
                <td className={`px-6 py-4 ${PRIORITY_CLS[t.priority ?? ''] ?? ''}`}>{t.priority ?? '-'}</td>
                <td className="px-6 py-4"><span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_CLS[t.status ?? ''] ?? 'bg-gray-700 text-gray-300'}`}>{STATUS_LBL[t.status ?? ''] ?? t.status}</span></td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => openThread(t)} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-[#6366f1]"><MessageCircle size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

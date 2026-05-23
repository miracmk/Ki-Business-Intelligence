import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import api from '../lib/api'

const statusColors: Record<string, string> = { open: 'bg-orange-900/30 text-orange-400', in_progress: 'bg-blue-900/30 text-blue-400', resolved: 'bg-green-900/30 text-green-400', closed: 'bg-gray-900/30 text-gray-400' }
const priorityColors: Record<string, string> = { low: 'text-green-400', medium: 'text-yellow-400', high: 'text-orange-400', urgent: 'text-red-400' }

export default function Support() {
  const [tickets, setTickets] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [newMsg, setNewMsg] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [newTicket, setNewTicket] = useState({ subject: '', description: '', priority: 'medium', serviceCategory: 'other', contactChannel: 'email' })
  const [filter, setFilter] = useState('')

  const loadTickets = () => api.get(`/support/tickets${filter ? `?status=${filter}` : ''}`).then(r => setTickets(r.data.tickets ?? []))

  useEffect(() => { loadTickets() }, [filter])

  const selectTicket = (t: any) => {
    setSelected(t)
    api.get(`/support/tickets/${t.id}/messages`).then(r => setMessages(r.data.messages ?? []))
  }

  const sendMessage = async () => {
    if (!newMsg.trim() || !selected) return
    await api.post(`/support/tickets/${selected.id}/messages`, { content: newMsg, senderType: 'agent' })
    setNewMsg('')
    api.get(`/support/tickets/${selected.id}/messages`).then(r => setMessages(r.data.messages ?? []))
  }

  const createTicket = async () => {
    if (!newTicket.subject || !newTicket.description) return
    await api.post('/support/tickets', newTicket)
    setShowModal(false)
    setNewTicket({ subject: '', description: '', priority: 'medium', serviceCategory: 'other', contactChannel: 'email' })
    loadTickets()
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-80 bg-[#111111] border-r border-[#2a2a2a] flex flex-col">
        <div className="p-4 border-b border-[#2a2a2a]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white">Destek</h3>
            <button onClick={() => setShowModal(true)} className="flex items-center gap-1 px-3 py-1.5 bg-[#6366f1] hover:bg-[#4f46e5] text-white text-sm rounded-lg">
              <Plus size={14} /> Yeni
            </button>
          </div>
          <select value={filter} onChange={e => setFilter(e.target.value)} className="w-full px-3 py-1.5 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-gray-300 text-sm">
            <option value="">Tümü</option>
            <option value="open">Açık</option>
            <option value="in_progress">İşlemde</option>
            <option value="resolved">Çözüldü</option>
            <option value="closed">Kapatıldı</option>
          </select>
        </div>
        <div className="flex-1 overflow-y-auto">
          {tickets.length === 0 ? <div className="text-gray-500 text-sm text-center py-8">Talep yok</div>
          : tickets.map(t => (
            <div key={t.id} onClick={() => selectTicket(t)} className={`p-4 border-b border-[#2a2a2a] cursor-pointer hover:bg-[#1a1a1a] ${selected?.id === t.id ? 'bg-[#1a1a1a] border-l-2 border-l-[#6366f1]' : ''}`}>
              <p className="text-white text-sm font-medium truncate">{t.subject}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-1.5 py-0.5 rounded text-xs ${statusColors[t.status]}`}>{t.status}</span>
                <span className={`text-xs ${priorityColors[t.priority]}`}>{t.priority}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">Bir ticket seçin</div>
        ) : (
          <>
            <div className="p-4 border-b border-[#2a2a2a]">
              <div className="flex items-center gap-4 mb-3">
                <h2 className="text-white font-semibold flex-1 truncate">{selected.subject}</h2>
                <select value={selected.status} onChange={async e => { await api.put(`/support/tickets/${selected.id}/status`, { status: e.target.value }); setSelected({ ...selected, status: e.target.value }); loadTickets() }}
                  className="px-2 py-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded text-gray-300 text-sm">
                  <option value="open">Açık</option>
                  <option value="in_progress">İşlemde</option>
                  <option value="resolved">Çözüldü</option>
                  <option value="closed">Kapatıldı</option>
                </select>
                <select value={selected.priority} onChange={async e => { await api.put(`/support/tickets/${selected.id}/priority`, { priority: e.target.value }); setSelected({ ...selected, priority: e.target.value }) }}
                  className="px-2 py-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded text-gray-300 text-sm">
                  <option value="low">Düşük</option>
                  <option value="medium">Orta</option>
                  <option value="high">Yüksek</option>
                  <option value="urgent">Acil</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="rounded-full border border-[#2a2a2a] px-3 py-1 text-gray-300">Kategori: {selected.service_category || selected.serviceCategory || 'Belirtilmedi'}</span>
                <span className="rounded-full border border-[#2a2a2a] px-3 py-1 text-gray-300">Kanal: {selected.contact_channel || selected.contactChannel || 'Belirtilmedi'}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m: any) => (
                <div key={m.id} className={`flex ${m.senderType === 'agent' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] p-3 rounded-xl text-sm ${m.senderType === 'ai' ? 'bg-purple-900/20 border border-purple-800/30 text-purple-200' : m.senderType === 'agent' ? 'bg-[#6366f1] text-white' : 'bg-[#1a1a1a] text-gray-200 border border-[#2a2a2a]'}`}>
                    {m.senderType === 'ai' && <span className="text-xs text-purple-400 block mb-1">AI</span>}
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-[#2a2a2a] flex gap-3">
              <textarea value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
                placeholder="Yanıtınızı yazın..." rows={2}
                className="flex-1 px-3 py-2 bg-[#111111] border border-[#2a2a2a] rounded-lg text-white text-sm resize-none focus:ring-1 focus:ring-[#6366f1]" />
              <button onClick={sendMessage} className="px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm">Gönder</button>
            </div>
          </>
        )}
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-[#111111] rounded-xl border border-[#2a2a2a] p-6 w-96">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Yeni Ticket</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <input placeholder="Başlık" value={newTicket.subject} onChange={e => setNewTicket({ ...newTicket, subject: e.target.value })}
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm" />
              <textarea placeholder="Açıklama" value={newTicket.description} onChange={e => setNewTicket({ ...newTicket, description: e.target.value })}
                rows={4} className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm resize-none" />
              <select value={newTicket.serviceCategory} onChange={e => setNewTicket({ ...newTicket, serviceCategory: e.target.value })}
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-gray-300 text-sm">
                <option value="data_integration">Data Integration</option>
                <option value="ai_chat">AI Chat</option>
                <option value="db_services">DB Services</option>
                <option value="accounting_module">Accounting Module</option>
                <option value="crm_integration">CRM Integration</option>
                <option value="payment_integration">Payment Integration</option>
                <option value="file_storage">File Storage</option>
                <option value="support_system">Support System</option>
                <option value="platform_general">Platform General</option>
                <option value="other">Other</option>
              </select>
              <select value={newTicket.contactChannel} onChange={e => setNewTicket({ ...newTicket, contactChannel: e.target.value })}
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-gray-300 text-sm">
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="chat">Chat</option>
                <option value="support_portal">Support Portal</option>
                <option value="other">Other</option>
              </select>
              <select value={newTicket.priority} onChange={e => setNewTicket({ ...newTicket, priority: e.target.value })}
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-gray-300 text-sm">
                <option value="low">Düşük</option>
                <option value="medium">Orta</option>
                <option value="high">Yüksek</option>
                <option value="urgent">Acil</option>
              </select>
              <button onClick={createTicket} className="w-full py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm font-medium">Oluştur</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

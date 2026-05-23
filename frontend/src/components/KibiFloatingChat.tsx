import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, X, Send } from 'lucide-react'
import api from '../lib/api'

const SESSION_KEY = 'kibi-floating-session'

export default function KibiFloatingChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [entityContext, setEntityContext] = useState<any>(null)

  useEffect(() => {
    if (!open) return
    api.get('/kibi/entity-context').then(res => setEntityContext(res.data.entityContext)).catch(() => setEntityContext(null))
  }, [open])

  useEffect(() => {
    const sessionId = localStorage.getItem(SESSION_KEY) || `session-${Date.now()}`
    localStorage.setItem(SESSION_KEY, sessionId)
  }, [])

  const sessionId = useMemo(() => localStorage.getItem(SESSION_KEY) || `session-${Date.now()}`, [])

  const sendMessage = async () => {
    if (!input.trim()) return
    const messageText = input.trim()
    setMessages(prev => [...prev, { role: 'user', content: messageText }])
    setInput('')
    setLoading(true)
    try {
      const { data } = await api.post('/kibi/chat', { message: messageText, sessionId })
      setMessages(prev => [...prev, { role: 'assistant', content: data.response || data.answer || 'Yanıt alınamadı.' }])
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'KIBI yanıtı alınamadı.' }])
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {open && (
        <div className="w-[360px] max-h-[520px] rounded-3xl border border-[#2a2a2a] bg-[#0c1221] shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-[#111827]">
            <div>
              <p className="text-sm font-semibold text-white">KIBI Chat</p>
              <p className="text-xs text-gray-400">Sohbet geçmişinden bağlam sağlar</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white"><X size={18} /></button>
          </div>
          <div className="p-4 space-y-3 overflow-y-auto max-h-[370px]">
            {entityContext && (
              <div className="rounded-3xl bg-[#111111] p-3 text-xs text-gray-300">
                <p>Entity: {entityContext.clientId || 'Yok'}</p>
                <p>Mood: {entityContext.mood || 'Bilinmiyor'}</p>
              </div>
            )}
            {messages.length === 0 ? (
              <div className="text-gray-500 text-sm">KIBI ile hemen konuşmaya başlayın.</div>
            ) : messages.map((msg, index) => (
              <div key={index} className={`rounded-3xl px-4 py-3 text-sm ${msg.role === 'user' ? 'ml-auto bg-[#6366f1] text-white' : 'bg-[#111111] text-gray-200'}`}>
                {msg.content}
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-[#1f2937] bg-[#0b111e]">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={2}
                className="flex-1 min-h-[56px] resize-none rounded-3xl border border-[#2a2a2a] bg-[#111827] px-4 py-3 text-white focus:outline-none"
                placeholder="Mesajınızı yazın..."
              />
              <button onClick={sendMessage} disabled={loading} className="rounded-3xl bg-[#6366f1] px-4 py-3 text-white disabled:opacity-60">
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
      <button onClick={() => setOpen((prev) => !prev)} className="mt-3 flex items-center gap-3 rounded-full bg-[#6366f1] px-4 py-3 text-white shadow-2xl hover:bg-[#4f46e5]">
        <MessageCircle size={18} />
        {open ? 'Kapat' : 'KIBI Aç'}
      </button>
    </div>
  )
}

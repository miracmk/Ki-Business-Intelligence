import { useState, useRef, useEffect } from 'react'
import { Send, ShieldCheck, Trash2 } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../store/auth'

interface Msg { role: 'user' | 'assistant'; content: string }

const SESSION_KEY = 'ki-admin-ai-session'

export default function KibiAdminAI() {
  const { user } = useAuth()
  const persistentSessionId = `admin_${(user as any)?.id ?? 'unknown'}_persistent`

  const [messages, setMessages] = useState<Msg[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [initDone, setInitDone] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load session history on mount from Redis (via a dummy send that fetches context)
  // Admin sessions are Redis-backed, so we restore from localStorage as UI cache
  useEffect(() => {
    try {
      const cached = localStorage.getItem(SESSION_KEY)
      if (cached) {
        setMessages(JSON.parse(cached))
      }
    } catch { /* non-fatal */ }
    setInitDone(true)
  }, [])

  useEffect(() => {
    if (initDone && messages.length > 0) {
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(messages.slice(-50)))
      } catch { /* non-fatal */ }
    }
  }, [messages, initDone])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const clearSession = () => {
    setMessages([])
    localStorage.removeItem(SESSION_KEY)
  }

  const send = async () => {
    if (!input.trim() || loading) return
    setError('')
    const text = input
    setInput('')
    setMessages(p => [...p, { role: 'user', content: text }])
    setLoading(true)
    try {
      const res = await api.post('/ai/admin-chat', {
        message:   text,
        sessionId: persistentSessionId,
      })
      setMessages(p => [...p, { role: 'assistant', content: res.data.response }])
    } catch (e: any) {
      setError(e.response?.data?.error || 'Mesaj gönderilemedi')
      setMessages(p => p.slice(0, -1))
      setInput(text)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(38,166,154,0.15)' }}>
            <ShieldCheck size={18} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>KIBI Admin AI</h2>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>Tam erişim — tüm entity verilerini görebilir · Geçmiş aktif</p>
          </div>
        </div>
        <button onClick={clearSession} title="Sohbeti temizle"
          className="p-2 rounded-lg transition-all hover:opacity-70"
          style={{ color: 'var(--text-3)' }}>
          <Trash2 size={15} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="max-w-xl mx-auto mt-8 text-center space-y-3">
            <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>KIBI Admin AI'ya Hoş Geldiniz</h3>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              Tüm entity verilerine, KIBI AI ve Entity AI sohbet geçmişlerine kısıtsız erişimle çalışır.
              Sohbet geçmişiniz bu oturumda korunur.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-6 text-left">
              {['Tüm entity özeti', 'Bu ay token kullanımı', 'Destek talep durumu', 'Sistem sağlığı'].map(q => (
                <button key={q} onClick={() => setInput(q)}
                  className="px-3 py-2.5 rounded-xl text-xs text-left transition-all"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[75%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed"
              style={m.role === 'user'
                ? { background: 'rgba(38,166,154,0.18)', color: 'var(--text-1)' }
                : { background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div className="flex gap-1.5 items-center">
                {[0, 100, 200].map(d => (
                  <span key={d} className="w-2 h-2 rounded-full animate-bounce"
                    style={{ background: 'var(--accent)', animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        {error && <p className="text-red-400 text-xs text-center">{error}</p>}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex gap-2">
          <input
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Admin sorusu… (Enter göndermek için)"
            className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}
          />
          <button onClick={send} disabled={loading || !input.trim()}
            className="px-4 py-2.5 rounded-xl transition-all disabled:opacity-40"
            style={{ background: 'rgba(38,166,154,0.8)', color: '#fff' }}>
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

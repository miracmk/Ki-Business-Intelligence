import { useState, useRef, useEffect } from 'react'
import { Send, Plus, MessageSquare, Trash2, Settings2, X, Save } from 'lucide-react'
import api from '../lib/api'

interface Msg { role: 'user' | 'assistant'; content: string }
interface Session { id: string; title: string; messages: Msg[] }

export default function AiChat() {
  const [sessions, setSessions]       = useState<Session[]>([])
  const [activeId, setActiveId]       = useState<string | null>(null)
  const [input,    setInput]          = useState('')
  const [loading,  setLoading]        = useState(false)
  const [error,    setError]          = useState('')
  const [showInstructions, setShowInstructions] = useState(false)
  const [instructions, setInstructions]         = useState('')
  const [savingInstructions, setSavingInstructions] = useState(false)
  const [instrSaved, setInstrSaved]   = useState(false)
  const bottomRef                     = useRef<HTMLDivElement>(null)

  const activeSession = sessions.find(s => s.id === activeId)
  const messages      = activeSession?.messages ?? []

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    api.get('/ai/config').then(r => {
      setInstructions(r.data.config?.kibiInstructions ?? '')
    }).catch(() => {})
  }, [])

  const saveInstructions = async () => {
    setSavingInstructions(true)
    try {
      await api.put('/tenants/ai-config', { kibiInstructions: instructions })
      setInstrSaved(true)
      setTimeout(() => setInstrSaved(false), 2000)
    } catch { /* non-fatal */ } finally {
      setSavingInstructions(false)
    }
  }

  const newSession = () => {
    const id = `s_${Date.now()}`
    setSessions(prev => [{ id, title: 'Yeni Sohbet', messages: [] }, ...prev])
    setActiveId(id)
    setError('')
  }

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id)
      if (activeId === id) setActiveId(next[0]?.id ?? null)
      return next
    })
  }

  const send = async () => {
    if (!input.trim() || loading) return

    let sid = activeId
    if (!sid) {
      sid = `s_${Date.now()}`
      setSessions(prev => [{ id: sid!, title: input.slice(0, 42), messages: [] }, ...prev])
      setActiveId(sid)
    }

    const text = input
    setInput('')
    setError('')

    setSessions(prev => prev.map(s =>
      s.id === sid
        ? { ...s, title: s.messages.length === 0 ? text.slice(0, 42) : s.title, messages: [...s.messages, { role: 'user', content: text }] }
        : s
    ))

    setLoading(true)
    try {
      const res = await api.post('/ai/chat', { message: text, sessionId: sid })
      setSessions(prev => prev.map(s =>
        s.id === sid
          ? { ...s, messages: [...s.messages, { role: 'assistant', content: res.data.response }] }
          : s
      ))
    } catch (e: any) {
      setError(e.response?.data?.error || 'Mesaj gönderilemedi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
    <div className="flex" style={{ height: '100%' }}>

      {/* ── Sidebar ── */}
      <aside className="w-56 flex-shrink-0 flex flex-col"
        style={{ borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <button onClick={newSession}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'rgba(38,166,154,0.10)', color: 'var(--accent)', border: '1px solid rgba(38,166,154,0.20)' }}>
            <Plus size={15} /> Yeni Sohbet
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {sessions.length === 0 && (
            <p className="text-xs text-center py-8" style={{ color: 'var(--text-3)' }}>Henüz sohbet yok</p>
          )}
          {sessions.map(s => (
            <div key={s.id}
              onClick={() => { setActiveId(s.id); setError('') }}
              className="group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all"
              style={s.id === activeId
                ? { background: 'rgba(38,166,154,0.10)', color: 'var(--accent)' }
                : { color: 'var(--text-2)' }}>
              <MessageSquare size={12} className="flex-shrink-0 opacity-60" />
              <span className="text-xs flex-1 truncate">{s.title}</span>
              <button onClick={e => deleteSession(s.id, e)}
                className="opacity-0 group-hover:opacity-70 hover:opacity-100 transition-opacity p-0.5 rounded"
                style={{ color: 'var(--text-3)' }}>
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(38,166,154,0.15)' }}>
            <MessageSquare size={18} style={{ color: 'var(--accent)' }} />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>KIBI AI</h2>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>İş rehberi · Sektörel analiz · Büyüme asistanı</p>
          </div>
          <button
            onClick={() => setShowInstructions(true)}
            title="Özel Talimatlar"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
            style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}
          >
            <Settings2 size={13} />
            Talimatlar
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="max-w-xl mx-auto mt-12 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
                style={{ background: 'rgba(38,166,154,0.10)' }}>
                <MessageSquare size={28} style={{ color: 'var(--accent)' }} />
              </div>
              <h3 className="font-semibold text-base" style={{ color: 'var(--text-1)' }}>KIBI AI'ya Hoş Geldiniz</h3>
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                İş geliştirme, sektörel analiz ve stratejik rehberlik için sorularınızı sorun.
              </p>
              <div className="grid grid-cols-2 gap-2 mt-6 text-left">
                {[
                  'Pazar analizi nasıl yapılır?',
                  'Satış artırma stratejileri',
                  'Rakip analizi yap',
                  'Büyüme fırsatları neler?',
                ].map(q => (
                  <button key={q} onClick={() => setInput(q)}
                    className="px-3 py-2.5 rounded-xl text-xs text-left transition-all hover:scale-[1.02]"
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
                  ? { background: 'rgba(38,166,154,0.16)', color: 'var(--text-1)' }
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
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="KIBI AI'ya sorun… (Shift+Enter yeni satır)"
              rows={1}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
              style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}
            />
            <button onClick={send} disabled={loading || !input.trim()}
              className="px-4 py-2.5 rounded-xl transition-all disabled:opacity-40 flex-shrink-0"
              style={{ background: 'rgba(38,166,154,0.85)', color: '#fff' }}>
              <Send size={16} />
            </button>
          </div>
          <p className="text-[10px] mt-2 text-center" style={{ color: 'var(--text-3)' }}>
            KIBI AI genel iş bilgisi sunar. Entity verileriniz için Entity AI'ı kullanın.
          </p>
        </div>
      </main>
    </div>

    {/* ── Instructions modal ── */}
    {showInstructions && (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl flex flex-col"
          style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>KIBI AI — Özel Talimatlar</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Her sohbette sistem prompt'una eklenir</p>
            </div>
            <button onClick={() => setShowInstructions(false)} style={{ color: 'var(--text-3)' }} className="hover:opacity-70">
              <X size={18} />
            </button>
          </div>
          <div className="p-5">
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              rows={8}
              placeholder={'Örnek:\n- Her zaman Türkçe yanıt ver\n- Rakam verirken TL cinsinden belirt\n- Rakip analizi yaparken sektör ortalamasını dahil et'}
              className="w-full px-3 py-2.5 rounded-xl text-sm resize-none outline-none"
              style={{ background: 'var(--surface-modal-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}
            />
            <p className="text-[11px] mt-2" style={{ color: 'var(--text-3)' }}>
              Bu talimatlar tüm KIBI AI sohbetlerinde geçerlidir. Entity AI için ayrı talimat vardır.
            </p>
          </div>
          <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
            <button onClick={() => setShowInstructions(false)}
              className="px-4 py-2 rounded-xl text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
              İptal
            </button>
            <button onClick={saveInstructions} disabled={savingInstructions}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition-all"
              style={{ background: 'rgba(38,166,154,0.85)', color: '#fff' }}>
              <Save size={14} />
              {instrSaved ? 'Kaydedildi ✓' : savingInstructions ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

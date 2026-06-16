import { useState, useRef, useEffect } from 'react'
import { Send, Bot, Settings2, X, Save, Info, Plus, MessageSquare, Trash2 } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../store/auth'

interface Msg { role: 'user' | 'assistant'; content: string }
interface Session { id: string; title: string; messages: Msg[] }

export default function EntityAI() {
  const [sessions, setSessions]       = useState<Session[]>([])
  const [activeId, setActiveId]       = useState<string | null>(null)
  const [input,        setInput]        = useState('')
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [companyName,  setCompanyName]  = useState<string>('')
  const { user } = useAuth()
  const isAdmin = (user as any)?.role === 'admin' || (user as any)?.role === 'supervisor'
  const [showInstructions, setShowInstructions] = useState(false)
  const [instructions, setInstructions]         = useState('')
  const [savingInstructions, setSavingInstructions] = useState(false)
  const [instrSaved,   setInstrSaved]   = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const activeSession = sessions.find(s => s.id === activeId)
  const messages      = activeSession?.messages ?? []

  useEffect(() => {
    api.get('/tenants/me').then(r => {
      const name = r.data?.tenant?.name || ''
      setCompanyName(name)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    api.get('/ai/config').then(r => {
      setInstructions(r.data.config?.entityInstructions ?? '')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    api.get(`/ai/sessions?type=entity_ai`).then(r => {
      const list = r.data.sessions ?? []
      const mapped = list.map((s: any) => ({ id: s.id, title: s.title || 'Yeni Sohbet', messages: [] }))
      setSessions(mapped)
      if (mapped[0]) setActiveId(mapped[0].id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!activeId) return
    const active = sessions.find(s => s.id === activeId)
    if (active && active.messages.length === 0) {
      setLoading(true)
      api.get(`/ai/sessions/${activeId}/messages`).then(r => {
        const msgs = r.data.messages ?? []
        setSessions(prev => prev.map(s =>
          s.id === activeId
            ? { ...s, messages: msgs.map((m: any) => ({ role: m.role, content: m.content })) }
            : s
        ))
      }).catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [activeId])

  const saveInstructions = async () => {
    setSavingInstructions(true)
    try {
      await api.put('/tenants/ai-config', { entityInstructions: instructions })
      setInstrSaved(true)
      setTimeout(() => setInstrSaved(false), 2000)
    } catch { /* non-fatal */ } finally {
      setSavingInstructions(false)
    }
  }

  const newSession = async () => {
    try {
      const res = await api.post('/ai/sessions', { title: 'Yeni Sohbet', type: 'entity_ai' })
      const newSess = res.data.session
      setSessions(prev => [{ id: newSess.id, title: newSess.title, messages: [] }, ...prev])
      setActiveId(newSess.id)
      setError('')
    } catch {
      setError('Yeni sohbet oturumu oluşturulamadı')
    }
  }

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await api.delete(`/ai/sessions/${id}`)
      setSessions(prev => {
        const next = prev.filter(s => s.id !== id)
        if (activeId === id) setActiveId(next[0]?.id ?? null)
        return next
      })
    } catch {
      setError('Sohbet silinemedi')
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const aiTitle = companyName ? `${companyName} AI` : 'Entity AI'

  const send = async () => {
    if (!input.trim() || loading) return

    let sid = activeId
    let isNew = false

    if (!sid) {
      isNew = true
      try {
        const res = await api.post('/ai/sessions', { title: input.slice(0, 42), type: 'entity_ai' })
        const newSess = res.data.session
        sid = newSess.id
        setSessions(prev => [{ id: sid!, title: input.slice(0, 42), messages: [] }, ...prev])
        setActiveId(sid)
      } catch {
        setError('Oturum oluşturulamadı')
        return
      }
    }

    const text = input
    setInput('')
    setError('')

    setSessions(prev => prev.map(s =>
      s.id === sid
        ? { ...s, title: (s.messages.length === 0 && !isNew) ? text.slice(0, 42) : s.title, messages: [...s.messages, { role: 'user', content: text }] }
        : s
    ))

    setLoading(true)
    try {
      const res = await api.post('/ai/entity-chat', { message: text, sessionId: sid })
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
            style={{ background: 'rgba(45,138,107,0.10)', color: 'var(--forest)', border: '1px solid rgba(45,138,107,0.20)' }}>
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
                ? { background: 'rgba(45,138,107,0.10)', color: 'var(--forest)' }
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
            style={{ background: 'rgba(45,138,107,0.15)' }}>
            <Bot size={18} style={{ color: 'var(--forest)' }} />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{aiTitle}</h2>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              {companyName ? `${companyName} verilerine özel yapay zeka asistanı` : 'Şirket verilerinize özel yapay zeka asistanı'}
            </p>
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

        {/* Admin info banner */}
        {isAdmin && (
          <div className="mx-6 mt-4 flex items-start gap-3 px-4 py-3 rounded-xl text-xs"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.20)', color: '#fbbf24' }}>
            <Info size={14} className="flex-shrink-0 mt-0.5" />
            <div>
              <strong>Platform Yöneticisi:</strong> Entity AI yalnızca bu entity'nin CRM/ERP/Muhasebe verilerine erişir.
              Platform genelinde yönetim için <strong>KIBI Chat</strong> (Platform menüsü) kullanın.
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="max-w-xl mx-auto mt-12 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
                style={{ background: 'rgba(45,138,107,0.10)' }}>
                <Bot size={28} style={{ color: 'var(--forest)' }} />
              </div>
              <h3 className="font-semibold text-base" style={{ color: 'var(--text-1)' }}>
                {aiTitle}'ya Hoş Geldiniz
              </h3>
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                {companyName
                  ? `${companyName} stok, personel, gelir, gider ve satış verilerine chat yoluyla erişin.`
                  : 'Şirketinizin stok, personel, gelir, gider ve kazanç/zarar verilerine chat yoluyla erişin.'}
              </p>
              <div className="grid grid-cols-2 gap-2 mt-6 text-left">
                {['Stok durumu nasıl?', 'Bu ay gelir ne kadar?', 'En çok satan ürün?', 'Personel durumu'].map(q => (
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
                  ? { background: 'rgba(45,138,107,0.16)', color: 'var(--text-1)' }
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
                      style={{ background: 'var(--forest)', animationDelay: `${d}ms` }} />
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
              placeholder={companyName ? `${companyName} verisi hakkında soru sorun…` : 'Şirket veriniz hakkında soru sorun…'}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}
            />
            <button onClick={send} disabled={loading || !input.trim()}
              className="px-4 py-2.5 rounded-xl transition-all disabled:opacity-40 flex-shrink-0"
              style={{ background: 'rgba(45,138,107,0.85)', color: '#fff' }}>
              <Send size={16} />
            </button>
          </div>
          <p className="text-[10px] mt-2 text-center" style={{ color: 'var(--text-3)' }}>
            {aiTitle} yalnızca {companyName || 'şirketinizin'} verilerine erişir.
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
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{aiTitle} — Özel Talimatlar</h3>
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
              placeholder={'Örnek:\n- Her zaman Türkçe yanıt ver\n- Stok verisini tablo halinde göster\n- Finansal verileri TL cinsinden belirt'}
              className="w-full px-3 py-2.5 rounded-xl text-sm resize-none outline-none"
              style={{ background: 'var(--surface-modal-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}
            />
            <p className="text-[11px] mt-2" style={{ color: 'var(--text-3)' }}>
              Bu talimatlar tüm {aiTitle} sohbetlerinde geçerlidir.
            </p>
          </div>
          <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
            <button onClick={() => setShowInstructions(false)}
              className="px-4 py-2 rounded-xl text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
              İptal
            </button>
            <button onClick={saveInstructions} disabled={savingInstructions}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition-all"
              style={{ background: 'rgba(45,138,107,0.85)', color: '#fff' }}>
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

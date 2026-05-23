import { useState, useRef, useEffect } from 'react'
import { Send, Bot, Settings2, X, Save } from 'lucide-react'
import api from '../lib/api'

interface Msg { role: 'user' | 'assistant'; content: string }

export default function EntityAI() {
  const [messages,     setMessages]     = useState<Msg[]>([])
  const [input,        setInput]        = useState('')
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [companyName,  setCompanyName]  = useState<string>('')
  const [showInstructions, setShowInstructions] = useState(false)
  const [instructions, setInstructions]         = useState('')
  const [savingInstructions, setSavingInstructions] = useState(false)
  const [instrSaved,   setInstrSaved]   = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const aiTitle = companyName ? `${companyName} AI` : 'Entity AI'

  const send = async () => {
    if (!input.trim() || loading) return
    setError('')
    const text = input
    setInput('')
    setMessages(p => [...p, { role: 'user', content: text }])
    setLoading(true)
    try {
      const res = await api.post('/ai/entity-chat', { message: text })
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
    <>
    <div className="flex flex-col" style={{ height: '100%' }}>

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

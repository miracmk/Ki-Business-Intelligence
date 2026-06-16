import React, { useState } from 'react'
import { ChevronLeft, ChevronRight, Database, Server, BarChart3, X } from 'lucide-react'

interface WizardProps {
  onClose: () => void
}

export function UniversalConnectorWizard({ onClose }: WizardProps) {
  const [step, setStep] = useState(1)
  const [sourceType, setSourceType] = useState<'crm_api' | 'database' | 'erp_api' | null>(null)
  const [connectionId, setConnectionId] = useState<string | null>(null)

  const stepTitles = [
    'Kaynak Seç',
    'Bağlantı Kur',
    'Yapı Tarama',
    'Connector AI Analizi',
    'Onay & Düzenleme',
    'Sorgu Şablonları',
    'Tamamlama',
  ]

  const renderStep = () => {
    switch (step) {
      case 1:
        return <StepSourceSelect onSelect={t => { setSourceType(t); setStep(2) }} />
      case 2:
        return <StepConnect sourceType={sourceType!} onConnect={id => { setConnectionId(id); setStep(3) }} />
      case 3:
        return <StepScan onDone={() => setStep(4)} />
      case 4:
        return <StepAnalyze onDone={() => setStep(5)} />
      case 5:
        return <StepApprove onDone={() => setStep(6)} />
      case 6:
        return <StepQueries onDone={() => setStep(7)} />
      case 7:
        return <StepComplete onDone={onClose} />
      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50 p-4">
      <div className="w-full max-w-3xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: 'var(--surface-modal)' }}>
        <div className="flex items-center justify-between mb-6">
          <h1 style={{ color: 'var(--text-1)', fontSize: '1.5rem', fontWeight: 'bold' }}>Universal Connector Wizard</h1>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg">
            <X size={20} style={{ color: 'var(--text-3)' }} />
          </button>
        </div>

        {/* Adım İndikatörü */}
        <div className="mb-8 flex items-center justify-between">
          {stepTitles.map((title, i) => (
            <React.Fragment key={i}>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all"
                style={{
                  background: i + 1 <= step ? 'var(--teal)' : 'rgba(255,255,255,0.1)',
                  color: i + 1 <= step ? '#fff' : 'var(--text-3)',
                }}
              >
                {i + 1 <= step - 1 ? '✓' : i + 1}
              </div>
              {i < stepTitles.length - 1 && (
                <div
                  className="flex-1 h-1 mx-2 rounded-full"
                  style={{
                    background: i + 1 < step ? 'var(--teal)' : 'rgba(255,255,255,0.1)',
                  }}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        <div style={{ color: 'var(--text-2)', marginBottom: '1rem' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--teal)' }}>{stepTitles[step - 1]}</span>
        </div>

        {/* İçerik */}
        <div className="min-h-[300px]">{renderStep()}</div>

        {/* Navigation */}
        <div className="flex gap-3 mt-8 justify-between">
          <button
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
            className="flex items-center gap-2 px-4 py-2 rounded-lg disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-2)' }}
          >
            <ChevronLeft size={16} /> Geri
          </button>
          <button
            onClick={() => setStep(Math.min(7, step + 1))}
            disabled={step === 7}
            className="flex items-center gap-2 px-4 py-2 rounded-lg disabled:opacity-50"
            style={{ background: 'var(--teal)', color: '#fff' }}
          >
            İleri <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Adım Bileşenleri ────────────────────────────────────────────────────────

function StepSourceSelect({ onSelect }: { onSelect: (type: 'crm_api' | 'database' | 'erp_api') => void }) {
  const sources = [
    { type: 'crm_api' as const, icon: Server, color: '#3b82f6' },
    { type: 'database' as const, icon: Database, color: '#10b981' },
    { type: 'erp_api' as const, icon: BarChart3, color: '#f59e0b' },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {sources.map(src => (
        <button
          key={src.type}
          onClick={() => onSelect(src.type)}
          className="p-6 rounded-xl border-2 transition-all hover:scale-105"
          style={{
            background: 'rgba(38,166,154,0.08)',
            borderColor: 'var(--teal)',
          }}
        >
          <src.icon size={28} style={{ color: src.color, marginBottom: '1rem' }} />
          <h3 style={{ color: 'var(--text-1)', fontWeight: 'bold' }}>{src.type}</h3>
        </button>
      ))}
    </div>
  )
}

function StepConnect({ sourceType, onConnect }: { sourceType: 'crm_api' | 'database' | 'erp_api'; onConnect: (id: string) => void }) {
  const [name, setName] = useState('')

  return (
    <div className="space-y-4">
      <div>
        <label style={{ color: 'var(--text-2)' }} className="block text-sm mb-2">Bağlantı Adı</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Örn: CRM Bağlantısı"
          className="w-full px-4 py-2 rounded-lg text-sm"
          style={{ background: 'var(--surface-modal-2)', color: 'var(--text-1)', border: '1px solid rgba(255,255,255,0.08)' }}
        />
      </div>
      {sourceType === 'database' && (
        <>
          <input type="text" placeholder="Host" className="w-full px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface-modal-2)', color: 'var(--text-1)', border: '1px solid rgba(255,255,255,0.08)' }} />
          <input type="text" placeholder="Database" className="w-full px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface-modal-2)', color: 'var(--text-1)', border: '1px solid rgba(255,255,255,0.08)' }} />
        </>
      )}
      <button
        onClick={() => onConnect(`conn_${Date.now()}`)}
        disabled={!name}
        className="w-full py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
        style={{ background: 'var(--teal)', color: '#fff' }}
      >
        Bağlan
      </button>
    </div>
  )
}

function StepScan({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0)

  React.useEffect(() => {
    const interval = setInterval(() => setProgress(p => Math.min(100, p + 10)), 500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-4">
      <div className="text-sm" style={{ color: 'var(--text-3)' }}>Bağlantı taranıyor...</div>
      <div className="w-full h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
        <div className="h-full rounded-full transition-all" style={{ background: 'var(--teal)', width: `${progress}%` }} />
      </div>
      <div style={{ color: 'var(--text-2)', fontSize: '0.875rem' }}>{progress}%</div>
      {progress === 100 && (
        <button
          onClick={onDone}
          className="w-full py-2 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--teal)', color: '#fff' }}
        >
          Devam Et
        </button>
      )}
    </div>
  )
}

function StepAnalyze({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0)

  React.useEffect(() => {
    const interval = setInterval(() => setProgress(p => Math.min(100, p + 8)), 400)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-4">
      <div className="text-sm" style={{ color: 'var(--text-3)' }}>Connector AI verilerinizi analiz ediyor...</div>
      <div className="w-full h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
        <div className="h-full rounded-full transition-all" style={{ background: 'var(--teal)', width: `${progress}%` }} />
      </div>
      {progress === 100 && (
        <button
          onClick={onDone}
          className="w-full py-2 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--teal)', color: '#fff' }}
        >
          Devam Et
        </button>
      )}
    </div>
  )
}

function StepApprove({ onDone }: { onDone: () => void }) {
  const [_approved, setApproved] = useState(false)

  return (
    <div className="space-y-4">
      <div style={{ color: 'var(--text-2)' }}>Veri haritanız onaylanmak için hazır.</div>
      <button
        onClick={() => {
          setApproved(true)
          setTimeout(onDone, 500)
        }}
        className="w-full py-2 rounded-lg text-sm font-semibold"
        style={{ background: 'var(--teal)', color: '#fff' }}
      >
        Onayla
      </button>
    </div>
  )
}

function StepQueries({ onDone }: { onDone: () => void }) {
  return (
    <div className="space-y-4">
      <div style={{ color: 'var(--text-2)' }}>Sorgu şablonları hazır. Devam edebilirsiniz.</div>
      <button
        onClick={onDone}
        className="w-full py-2 rounded-lg text-sm font-semibold"
        style={{ background: 'var(--teal)', color: '#fff' }}
      >
        Devam Et
      </button>
    </div>
  )
}

function StepComplete({ onDone }: { onDone: () => void }) {
  return (
    <div className="space-y-4 text-center">
      <div style={{ color: 'var(--text-1)', fontSize: '1.25rem', fontWeight: 'bold' }}>✓ Tamamlandı!</div>
      <div style={{ color: 'var(--text-2)' }}>Bağlantınız hazır, Entity AI artık verilerinizi sorgulamak için bu kaynakları kullanabilir.</div>
      <button
        onClick={onDone}
        className="w-full py-2 rounded-lg text-sm font-semibold"
        style={{ background: 'var(--teal)', color: '#fff' }}
      >
        Kapat
      </button>
    </div>
  )
}

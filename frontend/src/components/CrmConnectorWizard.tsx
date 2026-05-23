import { useEffect, useRef, useState } from 'react'
import { X, ChevronRight, ChevronLeft, Database, Server, Loader2, CheckCircle, AlertCircle, Zap } from 'lucide-react'
import api from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────
interface LogLine { type: string; message: string; percent: number; ts: number }
interface ScannedModule {
  name: string; label: string; recordCount: number
  fields: { name: string; label: string; type: string; sampleValues: string[] }[]
}
interface ConnectorField {
  sourceField: string; targetField: string; transform: string; customFieldKey?: string
}
interface ConnectorModule { sourceModule: string; targetTable: string | null; fields: ConnectorField[] }
interface Connector { version: number; generatedAt: string; sourceType: string; mappings: ConnectorModule[]; unmappedFields: string[]; aiGenerated?: boolean }

const SOURCE_TYPES = [
  { id: 'crm-api',  label: 'CRM API',       desc: 'Zoho, HubSpot, Salesforce ve diğer CRM sistemleri',   icon: Zap      },
  { id: 'database', label: 'Veritabanı',     desc: 'PostgreSQL, MySQL — doğrudan tablo bağlantısı',        icon: Database },
  { id: 'erp',      label: 'ERP (yakında)',  desc: 'SAP, NetSuite, Odoo ERP entegrasyonları',              icon: Server   },
]

const CRM_API_PROVIDERS = ['zoho', 'salesforce', 'hubspot', 'dynamics365', 'pipedrive', 'freshsales']
const TARGET_TABLES = ['crm_contacts', 'crm_companies', 'crm_deals', 'erp_products']
const TRANSFORM_TYPES = ['direct', 'phone_e164', 'country_iso', 'name_case', 'email_lower', 'currency_strip', 'custom']

const DB_FIELDS = [
  { key: 'host',     label: 'Host',     type: 'text', placeholder: '192.168.1.10' },
  { key: 'port',     label: 'Port',     type: 'text', placeholder: '5432' },
  { key: 'database', label: 'Database', type: 'text', placeholder: 'mydb' },
  { key: 'username', label: 'Kullanıcı', type: 'text', placeholder: 'postgres' },
  { key: 'password', label: 'Şifre',    type: 'password', placeholder: '' },
  { key: 'name',     label: 'Bağlantı Adı', type: 'text', placeholder: 'Üretim Veritabanı' },
]

// ── Wizard ────────────────────────────────────────────────────────────────────
export default function CrmConnectorWizard({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep]               = useState(1)
  const [sourceType, setSourceType]   = useState<string>('')
  const [crmProvider, setCrmProvider] = useState<string>('zoho')
  const [dbForm, setDbForm]           = useState<Record<string, string>>({})
  const [testStatus, setTestStatus]   = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMsg, setTestMsg]         = useState('')
  const [connectionId, setConnectionId] = useState<string>('')
  const [logs, setLogs]               = useState<LogLine[]>([])
  const [scanProgress, setScanProgress] = useState(0)
  const [modules, setModules]         = useState<ScannedModule[]>([])
  const [connector, setConnector]     = useState<Connector | null>(null)
  const [genLoading, setGenLoading]   = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [editMapping, setEditMapping] = useState<ConnectorModule[]>([])
  const logsEndRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  useEffect(() => () => { esRef.current?.close() }, [])

  // Step 2 → test DB connection
  const testConnection = async () => {
    setTestStatus('testing'); setTestMsg('')
    try {
      const r = await api.post('/crm/db-test', { host: dbForm.host, port: Number(dbForm.port ?? 5432), database: dbForm.database, username: dbForm.username, password: dbForm.password, ssl: false })
      const tables: string[] = r.data.tables ?? []
      setTestStatus('ok'); setTestMsg(`Bağlantı başarılı! ${tables.length} tablo bulundu.`)
    } catch (e: any) {
      setTestStatus('fail'); setTestMsg(e.response?.data?.error ?? 'Bağlantı başarısız')
    }
  }

  // Step 2 → save and advance to step 3
  const saveAndScan = async () => {
    if (testStatus !== 'ok') { await testConnection(); return }
    try {
      const r = await api.post('/crm/db-connect', { name: dbForm.name || 'DB Bağlantısı', dbType: 'postgresql', host: dbForm.host, port: Number(dbForm.port ?? 5432), database: dbForm.database, username: dbForm.username, password: dbForm.password, ssl: false })
      setConnectionId(r.data.connection.id)
      setStep(3)
      startScan(r.data.connection.id)
    } catch (e: any) {
      setTestMsg(e.response?.data?.error ?? 'Kayıt hatası')
    }
  }

  // Step 3 → SSE scan
  const startScan = (connId: string) => {
    setLogs([]); setScanProgress(0); setModules([])
    const token = localStorage.getItem('accessToken') ?? ''
    const es = new EventSource(`/api/v1/crm/connections/${connId}/scan-structure/stream?token=${encodeURIComponent(token)}`)
    esRef.current = es

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { type: string; message: string; percent: number }
        setLogs(prev => [...prev, { ...data, ts: Date.now() }])
        setScanProgress(data.percent)
        if (data.type === 'structure') {
          try { const mod = JSON.parse(data.message); setModules(prev => [...prev, mod]) } catch { /* ignore */ }
        }
        if (data.type === 'done' || data.type === 'error') {
          es.close()
          if (data.type === 'done') setTimeout(() => setStep(4), 800)
        }
      } catch { /* ignore */ }
    }
    es.onerror = () => {
      setLogs(prev => [...prev, { type: 'error', message: 'Stream bağlantısı kesildi', percent: 0, ts: Date.now() }])
      es.close()
    }
  }

  // Step 4 → generate connector
  const generateConnector = async () => {
    setGenLoading(true)
    setLogs(prev => [...prev, { type: 'progress', message: 'AI modül yapısını analiz ediyor...', percent: 10, ts: Date.now() }])
    try {
      const r = await api.post(`/crm/connections/${connectionId}/generate-connector`, { modules })
      setConnector(r.data.connector)
      setEditMapping(r.data.connector.mappings ?? [])
      setLogs(prev => [...prev, { type: 'done', message: `Konnektör üretildi — ${r.data.connector.mappings?.length ?? 0} modül eşleşti`, percent: 100, ts: Date.now() }])
      setTimeout(() => setStep(5), 500)
    } catch (e: any) {
      setLogs(prev => [...prev, { type: 'error', message: e.response?.data?.error ?? 'Konnektör üretilemedi', percent: 0, ts: Date.now() }])
    } finally {
      setGenLoading(false)
    }
  }

  // Step 5 → save connector and start sync
  const confirmAndSave = async () => {
    setSaveLoading(true)
    try {
      const updatedConnector = { ...connector!, mappings: editMapping }
      await api.put(`/crm/connections/${connectionId}/connector`, { connector: updatedConnector })
      await api.post(`/crm/connections/${connectionId}/sync/entity`)
      onDone()
    } catch (e: any) {
      alert(e.response?.data?.error ?? 'Kayıt hatası')
    } finally {
      setSaveLoading(false)
    }
  }

  const updateFieldMapping = (modIdx: number, fIdx: number, key: string, val: string) => {
    setEditMapping(prev => {
      const next = prev.map(m => ({ ...m, fields: [...m.fields] }))
      if (next[modIdx]?.fields[fIdx]) {
        (next[modIdx].fields[fIdx] as any)[key] = val
      }
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="relative flex flex-col rounded-3xl shadow-2xl" style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)', width: 'min(96vw, 960px)', maxHeight: '90vh', minHeight: 500 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>CRM / DB Bağlantı Sihirbazı</h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>Adım {step} / 5 — {['Kaynak Seç', 'Bağlantı Kur', 'Yapı Tara', 'AI Konnektör', 'Onayla'][step - 1]}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-red-500/20"><X size={18} style={{ color: 'var(--text-3)' }} /></button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2 px-8 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          {[1, 2, 3, 4, 5].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: s <= step ? 'var(--accent)' : 'var(--surface-2)', color: s <= step ? '#fff' : 'var(--text-3)' }}>{s}</div>
              {s < 5 && <div className="h-px w-8" style={{ background: s < step ? 'var(--accent)' : 'var(--border)' }} />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">

          {/* STEP 1 — Source selection */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--text-2)' }}>Hangi kaynaktan veri çekmek istiyorsunuz?</p>
              <div className="grid gap-4 sm:grid-cols-3">
                {SOURCE_TYPES.map(src => (
                  <button key={src.id} onClick={() => setSourceType(src.id)} className="p-5 rounded-2xl text-left transition-all" style={{ background: sourceType === src.id ? 'rgba(38,166,154,0.15)' : 'var(--surface-2)', border: `2px solid ${sourceType === src.id ? 'var(--accent)' : 'var(--border)'}` }}>
                    <src.icon size={28} style={{ color: 'var(--accent)' }} className="mb-3" />
                    <p className="font-semibold" style={{ color: 'var(--text-1)' }}>{src.label}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{src.desc}</p>
                  </button>
                ))}
              </div>
              {sourceType === 'crm-api' && (
                <div>
                  <label className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>CRM Sağlayıcısı</label>
                  <select value={crmProvider} onChange={e => setCrmProvider(e.target.value)} className="mt-2 w-full px-4 py-3 rounded-2xl text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}>
                    {CRM_API_PROVIDERS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                  <p className="text-xs mt-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(38,166,154,0.08)', color: 'var(--text-3)' }}>CRM API bağlantısı Platform Ayarları → CRM sekmesinden eklenmiş olmalı. Mevcut bağlantınızı seçmek için ayarlara gidin.</p>
                </div>
              )}
            </div>
          )}

          {/* STEP 2 — Connection setup */}
          {step === 2 && (
            <div className="space-y-4 max-w-md">
              <p className="text-sm" style={{ color: 'var(--text-2)' }}>PostgreSQL veritabanı bağlantı bilgilerini girin.</p>
              {DB_FIELDS.map(f => (
                <div key={f.key}>
                  <label className="text-sm" style={{ color: 'var(--text-2)' }}>{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder} value={dbForm[f.key] ?? ''} onChange={e => setDbForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="mt-1 w-full px-4 py-3 rounded-2xl text-sm outline-none"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
                </div>
              ))}
              {testMsg && (
                <p className="text-sm flex items-center gap-2" style={{ color: testStatus === 'ok' ? 'var(--accent)' : '#f87171' }}>
                  {testStatus === 'ok' ? <CheckCircle size={14} /> : <AlertCircle size={14} />} {testMsg}
                </p>
              )}
              <button onClick={testConnection} disabled={testStatus === 'testing'} className="w-full py-3 rounded-2xl text-sm font-medium" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                {testStatus === 'testing' ? <Loader2 size={14} className="animate-spin inline mr-2" /> : null}
                Bağlantıyı Test Et
              </button>
            </div>
          )}

          {/* STEP 3 — Structure scan (log + tree) */}
          {step === 3 && (
            <div className="grid gap-4 lg:grid-cols-2" style={{ minHeight: 300 }}>
              <div className="flex flex-col rounded-2xl overflow-hidden" style={{ background: '#0a0f0e', border: '1px solid var(--border)' }}>
                <div className="px-4 py-2 text-xs font-mono" style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>Canlı Log — {scanProgress}%</div>
                <div className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-xs" style={{ maxHeight: 320 }}>
                  {logs.map((l, i) => (
                    <div key={i} className="flex gap-2">
                      <span style={{ color: l.type === 'error' ? '#f87171' : l.type === 'done' ? 'var(--accent)' : 'var(--text-3)' }}>{l.type === 'done' ? '✓' : l.type === 'error' ? '✗' : '›'}</span>
                      <span style={{ color: l.type === 'error' ? '#f87171' : l.type === 'done' ? 'var(--accent)' : 'var(--text-2)' }}>{l.message}</span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="px-4 py-2 text-xs font-mono" style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>Bulunan Yapı ({modules.length} modül)</div>
                <div className="overflow-y-auto p-3 space-y-2" style={{ maxHeight: 320 }}>
                  {modules.map((mod, i) => (
                    <div key={i} className="px-3 py-2 rounded-xl" style={{ background: 'var(--surface-3)' }}>
                      <div className="font-medium text-sm" style={{ color: 'var(--text-1)' }}>{mod.label ?? mod.name} <span className="text-xs ml-1" style={{ color: 'var(--text-3)' }}>({mod.recordCount?.toLocaleString() ?? '?'} kayıt)</span></div>
                      <div className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{mod.fields?.length ?? 0} kolon</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4 — AI connector generation */}
          {step === 4 && (
            <div className="grid gap-4 lg:grid-cols-2" style={{ minHeight: 300 }}>
              <div className="flex flex-col rounded-2xl overflow-hidden" style={{ background: '#0a0f0e', border: '1px solid var(--border)' }}>
                <div className="px-4 py-2 text-xs font-mono" style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>AI Normalizasyon Log</div>
                <div className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-xs" style={{ maxHeight: 320 }}>
                  {logs.slice(-30).map((l, i) => (
                    <div key={i} className="flex gap-2">
                      <span style={{ color: l.type === 'error' ? '#f87171' : l.type === 'done' ? 'var(--accent)' : 'var(--text-3)' }}>{l.type === 'done' ? '✓' : l.type === 'error' ? '✗' : '›'}</span>
                      <span style={{ color: l.type === 'error' ? '#f87171' : l.type === 'done' ? 'var(--accent)' : 'var(--text-2)' }}>{l.message}</span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="px-4 py-2 text-xs font-mono" style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>Konnektör Önizleme</div>
                <pre className="p-4 text-xs overflow-auto" style={{ maxHeight: 320, color: 'var(--text-2)', fontFamily: 'monospace' }}>
                  {connector ? JSON.stringify(connector.mappings?.slice(0, 3), null, 2) : '— Konnektör henüz oluşturulmadı —'}
                </pre>
              </div>
            </div>
          )}

          {/* STEP 5 — Confirm and save */}
          {step === 5 && connector && (
            <div className="space-y-6">
              <div className="p-4 rounded-2xl" style={{ background: 'rgba(38,166,154,0.1)', border: '1px solid var(--accent)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
                  {connector.aiGenerated !== false ? '✓ AI Konnektör Hazır' : '⚠ Temel Eşleştirme (AI kullanılamadı)'} — {connector.mappings.filter(m => m.targetTable).length} modül eşleşti
                </p>
              </div>

              <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                {editMapping.map((mod, modIdx) => (
                  <div key={mod.sourceModule} className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between px-4 py-3" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                      <span className="font-medium text-sm" style={{ color: 'var(--text-1)' }}>{mod.sourceModule}</span>
                      <select value={mod.targetTable ?? ''} onChange={e => setEditMapping(prev => prev.map((m, i) => i === modIdx ? { ...m, targetTable: e.target.value || null } : m))}
                        className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-1)' }}>
                        <option value="">— Eşleşme yok —</option>
                        {TARGET_TABLES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    {mod.targetTable && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead><tr style={{ background: 'var(--surface-3)' }}><th className="px-3 py-2 text-left" style={{ color: 'var(--text-3)' }}>Kaynak Alan</th><th className="px-3 py-2 text-left" style={{ color: 'var(--text-3)' }}>Hedef Alan</th><th className="px-3 py-2 text-left" style={{ color: 'var(--text-3)' }}>Dönüşüm</th></tr></thead>
                          <tbody>
                            {mod.fields.slice(0, 12).map((f, fIdx) => (
                              <tr key={f.sourceField} style={{ borderTop: '1px solid var(--border)' }}>
                                <td className="px-3 py-1.5 font-mono" style={{ color: 'var(--text-3)' }}>{f.sourceField}</td>
                                <td className="px-3 py-1.5">
                                  <input value={f.targetField} onChange={e => updateFieldMapping(modIdx, fIdx, 'targetField', e.target.value)}
                                    className="w-full px-2 py-1 rounded text-xs font-mono" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
                                </td>
                                <td className="px-3 py-1.5">
                                  <select value={f.transform} onChange={e => updateFieldMapping(modIdx, fIdx, 'transform', e.target.value)}
                                    className="text-xs px-2 py-1 rounded" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-1)' }}>
                                    {TRANSFORM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-5" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={() => step > 1 ? setStep(s => s - 1) : onClose()} className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <ChevronLeft size={16} /> {step === 1 ? 'İptal' : 'Geri'}
          </button>

          <div className="flex gap-3">
            {step === 1 && (
              <button disabled={!sourceType || sourceType === 'erp'} onClick={() => sourceType === 'database' ? setStep(2) : setStep(3)} className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-medium disabled:opacity-40" style={{ background: 'var(--accent)', color: '#fff' }}>
                Devam <ChevronRight size={16} />
              </button>
            )}
            {step === 2 && (
              <button onClick={saveAndScan} className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-medium" style={{ background: 'var(--accent)', color: '#fff' }}>
                {testStatus === 'ok' ? 'Kaydet & Tara' : 'Test Et & Tara'} <ChevronRight size={16} />
              </button>
            )}
            {step === 3 && scanProgress === 100 && (
              <button onClick={() => setStep(4)} className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-medium" style={{ background: 'var(--accent)', color: '#fff' }}>
                AI Konnektörü Oluştur <ChevronRight size={16} />
              </button>
            )}
            {step === 4 && (
              <button onClick={generateConnector} disabled={genLoading} className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-medium disabled:opacity-50" style={{ background: 'var(--forest)', color: '#fff' }}>
                {genLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                {connector ? 'Yeniden Oluştur' : 'AI Konnektör Üret'}
              </button>
            )}
            {step === 5 && (
              <button onClick={confirmAndSave} disabled={saveLoading} className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-medium disabled:opacity-50" style={{ background: 'var(--accent)', color: '#fff' }}>
                {saveLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Onayla ve Kaydet
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

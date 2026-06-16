import { useEffect, useMemo, useRef, useState } from 'react'
import { X, ChevronRight, ChevronLeft, Database, Server, Loader2, CheckCircle, AlertCircle, Zap } from 'lucide-react'
import api from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────
interface LogLine { type: string; message: string; percent: number; ts: number }
interface ScannedField { name: string; label: string; type: string; sampleValues: string[] }
interface ScannedModule {
  name: string; label: string; recordCount: number
  fields: ScannedField[]
  sampleRows?: Record<string, unknown>[]
}
interface ConnectorField { sourceField: string; targetField: string; transform: string; customFieldKey?: string | null }
interface ConnectorModule { sourceModule: string; targetTable: string | null; fields: ConnectorField[] }
interface Connector {
  version: number; generatedAt: string; sourceType: string
  mappings: ConnectorModule[]; unmappedFields: string[]; aiGenerated?: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────
const SOURCE_TYPES = [
  { id: 'crm-api',  label: 'CRM API',      desc: 'Zoho, HubSpot, Salesforce ve diğer CRM sistemleri', icon: Zap      },
  { id: 'database', label: 'Veritabanı',    desc: 'PostgreSQL, MySQL — doğrudan tablo bağlantısı',      icon: Database },
  { id: 'erp',      label: 'ERP (yakında)', desc: 'SAP, NetSuite, Odoo ERP entegrasyonları',            icon: Server   },
]

const TARGET_TABLE_OPTIONS = [
  { value: 'crm_contacts',  label: 'Kişiler / Müşteriler (crm_contacts)'  },
  { value: 'crm_companies', label: 'Şirketler / Hesaplar (crm_companies)' },
  { value: 'crm_deals',     label: 'Fırsatlar / Satışlar (crm_deals)'     },
  { value: 'erp_products',  label: 'Ürünler / Stok (erp_products)'        },
  { value: '',               label: 'Atla (Bu modülü yoksay)'               },
]

const TRANSFORM_TYPES = ['direct', 'phone_e164', 'country_iso', 'name_case', 'email_lower', 'currency_strip', 'custom']

const DB_FIELDS = [
  { key: 'host',     label: 'Host',          type: 'text',     placeholder: '192.168.1.10'        },
  { key: 'port',     label: 'Port',          type: 'text',     placeholder: '5432'                },
  { key: 'database', label: 'Veritabanı',    type: 'text',     placeholder: 'mydb'                },
  { key: 'username', label: 'Kullanıcı',     type: 'text',     placeholder: 'postgres'            },
  { key: 'password', label: 'Şifre',         type: 'password', placeholder: ''                    },
  { key: 'name',     label: 'Bağlantı Adı',  type: 'text',     placeholder: 'Üretim Veritabanı'   },
]

// Opsiyonel meta-tablo alanları (EAV / meta-schema yapısı için)
const META_TABLE_FIELDS = [
  { key: 'modulesTable', label: 'Modüller Tablosu',     placeholder: 'crm_modules veya tables_meta',   hint: 'Modül/tablo dizinini tutan tablo adı' },
  { key: 'fieldsTable',  label: 'Field\'lar Tablosu',   placeholder: 'crm_fields veya columns_meta',   hint: 'Alan/kolon tanımlarını tutan tablo adı' },
  { key: 'dataTable',    label: 'Veri Tablosu',         placeholder: 'crm_records veya data',          hint: 'Asıl client verilerini tutan tablo adı' },
]

const STEP_LABELS = ['Kaynak Seç', 'Bağlantı Kur', 'Yapıyı Gör', 'Modül Eşleştir', 'AI Konnektör', 'Onayla']

// Regex-based module → table suggestion (no AI)
function suggestTargetTable(moduleName: string): string {
  const n = moduleName.toLowerCase()
  if (/contact|lead|person|müşteri|kişi|customer/.test(n)) return 'crm_contacts'
  if (/account|company|firma|şirket|organization/.test(n)) return 'crm_companies'
  if (/deal|opportunity|fırsat|satış|pipeline|potent/.test(n)) return 'crm_deals'
  if (/product|item|ürün|inventory|stok|stock/.test(n)) return 'erp_products'
  return ''
}

// ── Wizard Component ──────────────────────────────────────────────────────────
export default function CrmConnectorWizard({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  // Navigation
  const [step, setStep] = useState(1)

  // Step 1
  const [sourceType, setSourceType] = useState('')

  // Step 2
  const [dbForm, setDbForm]             = useState<Record<string, string>>({})
  const [testStatus, setTestStatus]     = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMsg, setTestMsg]           = useState('')
  const [connectionId, setConnectionId] = useState('')
  const [showMetaTables, setShowMetaTables] = useState(false)

  // Step 3 — scan
  const [scanLogs, setScanLogs]       = useState<LogLine[]>([])
  const [scanProgress, setScanProgress] = useState(0)
  const [scanDone, setScanDone]       = useState(false)
  const [modules, setModules]         = useState<ScannedModule[]>([])
  const [structureTab, setStructureTab] = useState<'modules' | 'fields' | 'samples'>('modules')

  // Step 3.5 — direct import (skip mapping)
  const [importDone,     setImportDone]     = useState(false)
  const [importLoading,  setImportLoading]  = useState(false)
  const [importResult,   setImportResult]   = useState<{ importedModules: number; importedFields: number } | null>(null)

  // Step 4 — module mapping
  const [userMappings, setUserMappings] = useState<Record<string, string>>({})

  // Step 5 — AI generation
  const [aiLogs, setAiLogs]       = useState<LogLine[]>([])
  const [aiProgress, setAiProgress] = useState(0)
  const [aiDone, setAiDone]       = useState(false)
  const [connector, setConnector]   = useState<Connector | null>(null)

  // Step 6 — preview/edit
  const [editMapping, setEditMapping] = useState<ConnectorModule[]>([])
  const [saveLoading, setSaveLoading] = useState(false)

  const scanEsRef    = useRef<EventSource | null>(null)
  const aiEsRef      = useRef<EventSource | null>(null)
  const scanLogsEnd  = useRef<HTMLDivElement>(null)
  const aiLogsEnd    = useRef<HTMLDivElement>(null)

  useEffect(() => { scanLogsEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [scanLogs])
  useEffect(() => { aiLogsEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [aiLogs])
  useEffect(() => () => { scanEsRef.current?.close(); aiEsRef.current?.close() }, [])

  // ── Step 2 actions ───────────────────────────────────────────────────────
  const testConnection = async () => {
    setTestStatus('testing'); setTestMsg('')
    try {
      const r = await api.post('/crm/db-test', {
        host: dbForm.host, port: Number(dbForm.port ?? 5432),
        database: dbForm.database, username: dbForm.username, password: dbForm.password, ssl: false,
      })
      setTestStatus('ok'); setTestMsg(`Bağlantı başarılı! ${(r.data.tables ?? []).length} tablo bulundu.`)
    } catch (e: any) {
      setTestStatus('fail'); setTestMsg(e.response?.data?.error ?? 'Bağlantı başarısız')
    }
  }

  const saveAndAdvance = async () => {
    if (testStatus !== 'ok') { await testConnection(); return }
    try {
      const r = await api.post('/crm/db-connect', {
        name: dbForm.name || 'DB Bağlantısı', dbType: 'postgresql',
        host: dbForm.host, port: Number(dbForm.port ?? 5432),
        database: dbForm.database, username: dbForm.username, password: dbForm.password, ssl: false,
        modulesTable: dbForm.modulesTable || undefined,
        fieldsTable:  dbForm.fieldsTable  || undefined,
        dataTable:    dbForm.dataTable    || undefined,
      })
      setConnectionId(r.data.connection.id)
      setStep(3)
      startScan(r.data.connection.id)
    } catch (e: any) {
      setTestStatus('fail'); setTestMsg(e.response?.data?.error ?? 'Kayıt hatası')
    }
  }

  // ── Direct import (skip mapping) ─────────────────────────────────────────
  const importDirect = async () => {
    if (!connectionId || importLoading) return
    setImportLoading(true)
    try {
      const res = await api.post(`/crm/connections/${connectionId}/import-direct`)
      setImportResult(res.data)
      setImportDone(true)
    } catch (e: any) {
      alert(e.response?.data?.error ?? 'Import hatası')
    } finally {
      setImportLoading(false)
    }
  }

  // ── Step 3: SSE scan ─────────────────────────────────────────────────────
  const startScan = (connId: string) => {
    setScanLogs([]); setScanProgress(0); setScanDone(false); setModules([])
    const token = encodeURIComponent(localStorage.getItem('accessToken') ?? '')
    const es = new EventSource(`/api/v1/crm/connections/${connId}/scan-structure/stream?token=${token}`)
    scanEsRef.current = es

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { type: string; message: string; percent: number }
        setScanLogs(prev => [...prev, { ...data, ts: Date.now() }])
        setScanProgress(data.percent)
        if (data.type === 'structure') {
          try {
            const mod: ScannedModule = JSON.parse(data.message)
            setModules(prev => [...prev, mod])
          } catch { /* ignore */ }
        }
        if (data.type === 'done' || data.type === 'error') {
          es.close()
          if (data.type === 'done') setScanDone(true)
        }
      } catch { /* ignore */ }
    }
    es.onerror = () => {
      setScanLogs(prev => [...prev, { type: 'error', message: 'Stream bağlantısı kesildi', percent: 0, ts: Date.now() }])
      es.close()
    }
  }

  // ── Step 4: initialize userMappings with regex suggestions ───────────────
  const initMappings = () => {
    const initial: Record<string, string> = {}
    modules.forEach(mod => { initial[mod.name] = suggestTargetTable(mod.name) })
    setUserMappings(initial)
    setStep(4)
  }

  // ── Step 5: SSE AI generation ────────────────────────────────────────────
  const startAiGeneration = () => {
    setAiLogs([]); setAiProgress(0); setAiDone(false); setConnector(null)
    setStep(5)
    const token = encodeURIComponent(localStorage.getItem('accessToken') ?? '')
    const m = encodeURIComponent(JSON.stringify(userMappings))
    const es = new EventSource(
      `/api/v1/crm/connections/${connectionId}/generate-connector/stream?token=${token}&m=${m}`
    )
    aiEsRef.current = es

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { type: string; message: string; percent: number; connector?: Connector }
        setAiLogs(prev => [...prev, { ...data, ts: Date.now() }])
        setAiProgress(data.percent)
        if (data.type === 'done' || data.type === 'error') {
          es.close()
          if (data.type === 'done' && data.connector) {
            setConnector(data.connector)
            setEditMapping(data.connector.mappings ?? [])
            setAiDone(true)
            setTimeout(() => setStep(6), 600)
          }
        }
      } catch { /* ignore */ }
    }
    es.onerror = () => {
      setAiLogs(prev => [...prev, { type: 'error', message: 'Bağlantı kesildi', percent: 0, ts: Date.now() }])
      es.close()
    }
  }

  // ── Step 6: save connector and start sync ────────────────────────────────
  const confirmAndSave = async () => {
    setSaveLoading(true)
    try {
      await api.put(`/crm/connections/${connectionId}/connector`, { connector: { ...connector!, mappings: editMapping } })
      await api.post(`/crm/connections/${connectionId}/sync/entity`)
      onDone()
    } catch (e: any) {
      alert(e.response?.data?.error ?? 'Kayıt hatası')
    } finally {
      setSaveLoading(false)
    }
  }

  const updateFieldMapping = (modIdx: number, fIdx: number, key: string, val: string) => {
    setEditMapping(prev => prev.map((m, i) =>
      i !== modIdx ? m : { ...m, fields: m.fields.map((f, j) => j !== fIdx ? f : { ...f, [key]: val }) }
    ))
  }

  // ── Schema preview (Step 6 right panel) ─────────────────────────────────
  const schemaPreview = useMemo(() => {
    const tables: Record<string, { mapped: string[]; custom: string[] }> = {}
    for (const mod of editMapping) {
      if (!mod.targetTable) continue
      if (!tables[mod.targetTable]) tables[mod.targetTable] = { mapped: [], custom: [] }
      for (const f of mod.fields) {
        if (f.transform === 'custom' || f.targetField === 'custom_fields') {
          if (!tables[mod.targetTable].custom.includes(f.customFieldKey ?? f.sourceField))
            tables[mod.targetTable].custom.push(f.customFieldKey ?? f.sourceField)
        } else if (f.targetField && !tables[mod.targetTable].mapped.includes(f.targetField)) {
          tables[mod.targetTable].mapped.push(f.targetField)
        }
      }
    }
    return tables
  }, [editMapping])

  // ── Log renderer ─────────────────────────────────────────────────────────
  const LogPanel = ({ logs, logsEnd, progress }: { logs: LogLine[]; logsEnd: React.RefObject<HTMLDivElement>; progress: number }) => (
    <div className="flex flex-col rounded-2xl overflow-hidden h-full" style={{ background: '#0a0f0e', border: '1px solid var(--border)' }}>
      <div className="px-4 py-2 text-xs font-mono flex items-center justify-between" style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
        <span>Canlı Log</span>
        <span>{progress}%</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-xs" style={{ maxHeight: 340 }}>
        {logs.map((l, i) => (
          <div key={i} className="flex gap-2">
            <span style={{ color: l.type === 'error' ? '#f87171' : l.type === 'done' ? 'var(--accent)' : 'var(--text-3)' }}>
              {l.type === 'done' ? '✓' : l.type === 'error' ? '✗' : '›'}
            </span>
            <span style={{ color: l.type === 'error' ? '#f87171' : l.type === 'done' ? 'var(--accent)' : 'var(--text-2)' }}>{l.message}</span>
          </div>
        ))}
        <div ref={logsEnd} />
      </div>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="relative flex flex-col rounded-3xl shadow-2xl"
        style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)', width: 'min(96vw,1040px)', maxHeight: '92vh', minHeight: 520 }}>

        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>CRM / DB Bağlantı Sihirbazı</h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>Adım {step} / 6 — {STEP_LABELS[step - 1]}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-red-500/20"><X size={18} style={{ color: 'var(--text-3)' }} /></button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2 px-8 py-3 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)' }}>
          {[1, 2, 3, 4, 5, 6].map(s => (
            <div key={s} className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                style={{ background: s < step ? 'var(--accent)' : s === step ? 'var(--accent)' : 'var(--surface-2)', color: s <= step ? '#fff' : 'var(--text-3)' }}>
                {s < step ? '✓' : s}
              </div>
              {s < 6 && <div className="h-px w-6" style={{ background: s < step ? 'var(--accent)' : 'var(--border)' }} />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">

          {/* ── STEP 1: Source selection ─────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--text-2)' }}>Hangi kaynaktan veri çekmek istiyorsunuz?</p>
              <div className="grid gap-4 sm:grid-cols-3">
                {SOURCE_TYPES.map(src => (
                  <button key={src.id} onClick={() => setSourceType(src.id)}
                    className="p-5 rounded-2xl text-left transition-all"
                    style={{ background: sourceType === src.id ? 'rgba(38,166,154,0.15)' : 'var(--surface-2)', border: `2px solid ${sourceType === src.id ? 'var(--accent)' : 'var(--border)'}` }}>
                    <src.icon size={28} style={{ color: 'var(--accent)' }} className="mb-3" />
                    <p className="font-semibold" style={{ color: 'var(--text-1)' }}>{src.label}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{src.desc}</p>
                  </button>
                ))}
              </div>
              {sourceType === 'crm-api' && (
                <div className="p-4 rounded-2xl" style={{ background: 'rgba(38,166,154,0.08)', border: '1px solid var(--border)' }}>
                  <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                    CRM API bağlantıları <strong>Platform Ayarları → CRM</strong> sekmesinden eklenir. Önce oradan OAuth bağlantısını tamamlayın, ardından Ayarlar sayfasından yapı tarayıcısını başlatın.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: DB form ──────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4 max-w-lg">
              <p className="text-sm" style={{ color: 'var(--text-2)' }}>PostgreSQL veritabanı bağlantı bilgilerini girin.</p>
              {DB_FIELDS.map(f => (
                <div key={f.key}>
                  <label className="text-sm" style={{ color: 'var(--text-2)' }}>{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder} value={dbForm[f.key] ?? ''}
                    onChange={e => setDbForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="mt-1 w-full px-4 py-3 rounded-2xl text-sm outline-none"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
                </div>
              ))}

              {/* Meta-tablo alanları (EAV / meta-schema yapısı için opsiyonel) */}
              <div>
                <button type="button" onClick={() => setShowMetaTables(s => !s)}
                  className="flex items-center gap-2 text-sm py-2"
                  style={{ color: 'var(--accent)' }}>
                  <Database size={13} />
                  {showMetaTables ? 'Meta-Tablo Alanlarını Gizle' : 'Meta-Tablo Alanlarını Göster (EAV / özel şema)'}
                </button>
                {showMetaTables && (
                  <div className="mt-3 space-y-3 pl-3" style={{ borderLeft: '2px solid var(--accent)' }}>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      Veritabanınız EAV (Entity-Attribute-Value) veya meta-şema yapısındaysa, modül dizinini, alan tanımlarını ve client verisini tutan tablolar farklı olabilir. Aşağıdaki alanları doldurun.
                    </p>
                    {META_TABLE_FIELDS.map(f => (
                      <div key={f.key}>
                        <label className="text-sm" style={{ color: 'var(--text-2)' }}>{f.label}
                          <span className="ml-2 text-xs" style={{ color: 'var(--text-3)' }}>(opsiyonel)</span>
                        </label>
                        <p className="text-[11px] mb-1" style={{ color: 'var(--text-3)' }}>{f.hint}</p>
                        <input type="text" placeholder={f.placeholder} value={dbForm[f.key] ?? ''}
                          onChange={e => setDbForm(p => ({ ...p, [f.key]: e.target.value }))}
                          className="w-full px-4 py-2.5 rounded-2xl text-sm outline-none font-mono"
                          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {testMsg && (
                <p className="text-sm flex items-center gap-2" style={{ color: testStatus === 'ok' ? 'var(--accent)' : '#f87171' }}>
                  {testStatus === 'ok' ? <CheckCircle size={14} /> : <AlertCircle size={14} />} {testMsg}
                </p>
              )}
              <button onClick={testConnection} disabled={testStatus === 'testing'}
                className="w-full py-3 rounded-2xl text-sm font-medium"
                style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                {testStatus === 'testing' && <Loader2 size={14} className="animate-spin inline mr-2" />}
                Bağlantıyı Test Et
              </button>
            </div>
          )}

          {/* ── STEP 3: Structure scan + results ─────────────────────────── */}
          {step === 3 && !scanDone && (
            <div className="grid gap-4 lg:grid-cols-2" style={{ minHeight: 340 }}>
              <LogPanel logs={scanLogs} logsEnd={scanLogsEnd} progress={scanProgress} />
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="px-4 py-2 text-xs font-mono" style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
                  Bulunan Modüller ({modules.length})
                </div>
                <div className="overflow-y-auto p-3 space-y-2" style={{ maxHeight: 320 }}>
                  {modules.map((mod, i) => (
                    <div key={i} className="px-3 py-2 rounded-xl" style={{ background: 'var(--surface-3)' }}>
                      <div className="font-medium text-sm" style={{ color: 'var(--text-1)' }}>
                        {mod.label ?? mod.name}
                        <span className="text-xs ml-2" style={{ color: 'var(--text-3)' }}>({mod.recordCount?.toLocaleString() ?? '?'} kayıt)</span>
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{mod.fields?.length ?? 0} kolon</div>
                    </div>
                  ))}
                  {modules.length === 0 && <p className="text-xs text-center py-8" style={{ color: 'var(--text-3)' }}>Tarama devam ediyor...</p>}
                </div>
              </div>
            </div>
          )}

          {/* Step 3 done — 3-tab structure view */}
          {step === 3 && scanDone && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} style={{ color: 'var(--accent)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--accent)' }}>Tarama tamamlandı — {modules.length} modül bulundu</span>
              </div>

              {/* Direct import success banner */}
              {importDone && importResult && (
                <div className="flex items-start gap-3 p-4 rounded-2xl"
                  style={{ background: 'rgba(38,166,154,0.10)', border: '1px solid rgba(38,166,154,0.3)' }}>
                  <CheckCircle size={16} style={{ color: 'var(--accent)', marginTop: 2 }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>Eşleştirmesiz import tamamlandı</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                      {importResult.importedModules} modül ve {importResult.importedFields} field KIBI DB'ye aktarıldı.
                      Dashboard'dan CRM yapısı artık görünür.
                    </p>
                  </div>
                </div>
              )}
              {/* Tabs */}
              <div className="flex gap-2">
                {(['modules', 'fields', 'samples'] as const).map(tab => (
                  <button key={tab} onClick={() => setStructureTab(tab)}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                    style={{ background: structureTab === tab ? 'var(--accent)' : 'var(--surface-2)', color: structureTab === tab ? '#fff' : 'var(--text-2)', border: '1px solid var(--border)' }}>
                    {tab === 'modules' ? 'Modüller' : tab === 'fields' ? 'Alanlar' : 'Örnek Veri'}
                  </button>
                ))}
              </div>

              {/* Modules tab */}
              {structureTab === 'modules' && (
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <table className="w-full text-sm">
                    <thead><tr style={{ background: 'var(--surface-2)' }}>
                      <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-2)' }}>Modül Adı</th>
                      <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--text-2)' }}>Kayıt Sayısı</th>
                      <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--text-2)' }}>Alan Sayısı</th>
                    </tr></thead>
                    <tbody>
                      {modules.map((mod, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                          <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-1)' }}>{mod.label ?? mod.name}</td>
                          <td className="px-4 py-2.5 text-right" style={{ color: 'var(--text-2)' }}>{mod.recordCount?.toLocaleString() ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right" style={{ color: 'var(--text-3)' }}>{mod.fields?.length ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Fields tab */}
              {structureTab === 'fields' && (
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', maxHeight: 400, overflowY: 'auto' }}>
                  <table className="w-full text-sm">
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr style={{ background: 'var(--surface-2)' }}>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-2)' }}>Modül</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-2)' }}>Kolon Adı</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-2)' }}>Tip</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-2)' }}>Örnek Değer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modules.flatMap(mod =>
                        (mod.fields ?? []).slice(0, 20).map((f, fi) => (
                          <tr key={`${mod.name}-${fi}`} style={{ borderTop: '1px solid var(--border)' }}>
                            <td className="px-4 py-1.5 text-xs" style={{ color: 'var(--text-3)' }}>{mod.name}</td>
                            <td className="px-4 py-1.5 font-mono text-xs" style={{ color: 'var(--text-1)' }}>{f.name}</td>
                            <td className="px-4 py-1.5 text-xs" style={{ color: 'var(--text-3)' }}>{f.type ?? '—'}</td>
                            <td className="px-4 py-1.5 text-xs" style={{ color: 'var(--text-2)' }}>{f.sampleValues?.[0] ?? '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Samples tab */}
              {structureTab === 'samples' && (
                <div className="space-y-4" style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {modules.filter(m => m.sampleRows && m.sampleRows.length > 0).slice(0, 5).map(mod => (
                    <div key={mod.name} className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                      <div className="px-4 py-2 text-xs font-medium" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-2)' }}>
                        {mod.label ?? mod.name} — ilk {mod.sampleRows!.length} kayıt
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead><tr style={{ background: 'var(--surface-3)' }}>
                            {Object.keys(mod.sampleRows![0]!).slice(0, 8).map(k => (
                              <th key={k} className="px-3 py-1.5 text-left font-mono whitespace-nowrap" style={{ color: 'var(--text-3)' }}>{k}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {mod.sampleRows!.slice(0, 5).map((row, ri) => (
                              <tr key={ri} style={{ borderTop: '1px solid var(--border)' }}>
                                {Object.keys(mod.sampleRows![0]!).slice(0, 8).map(k => (
                                  <td key={k} className="px-3 py-1 whitespace-nowrap" style={{ color: 'var(--text-2)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {String(row[k] ?? '').slice(0, 40)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                  {modules.every(m => !m.sampleRows?.length) && (
                    <p className="text-sm text-center py-8" style={{ color: 'var(--text-3)' }}>Bu bağlantı için örnek veri alınamadı.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 4: Module mapping ───────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                Her kaynak modül için hedef tabloyu seçin. Sistem modül adına göre öneri yaptı, değiştirebilirsiniz.
              </p>
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', maxHeight: 480, overflowY: 'auto' }}>
                <table className="w-full text-sm">
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-2)' }}>Kaynak Modül</th>
                      <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--text-2)' }}>Kayıt</th>
                      <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-2)' }}>Hedef Tablo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((mod, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                        <td className="px-4 py-2.5">
                          <div className="font-medium" style={{ color: 'var(--text-1)' }}>{mod.label ?? mod.name}</div>
                          <div className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>{mod.name}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm" style={{ color: 'var(--text-3)' }}>
                          {mod.recordCount?.toLocaleString() ?? '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <select
                            value={userMappings[mod.name] ?? ''}
                            onChange={e => setUserMappings(prev => ({ ...prev, [mod.name]: e.target.value }))}
                            className="w-full px-3 py-2 rounded-xl text-sm"
                            style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none' }}>
                            {TARGET_TABLE_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value} style={{ background: 'var(--surface-modal)', color: 'var(--text-1)' }}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                Eşleşen modül sayısı: {Object.values(userMappings).filter(Boolean).length} / {modules.length}
              </p>
            </div>
          )}

          {/* ── STEP 5: AI generation (SSE log) ─────────────────────────── */}
          {step === 5 && (
            <div style={{ minHeight: 340 }}>
              <LogPanel logs={aiLogs} logsEnd={aiLogsEnd} progress={aiProgress} />
              {aiDone && connector && (
                <div className="mt-4 p-4 rounded-2xl flex items-center gap-3" style={{ background: 'rgba(38,166,154,0.1)', border: '1px solid var(--accent)' }}>
                  <CheckCircle size={16} style={{ color: 'var(--accent)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
                    Konnektör hazır — {connector.mappings.filter(m => m.targetTable).length} modül eşleşti. Önizleme yükleniyor...
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 6: Preview & confirm ────────────────────────────────── */}
          {step === 6 && connector && (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Left: editable mapping table */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Alan Eşleştirme</h3>
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', maxHeight: 420, overflowY: 'auto' }}>
                  {editMapping.filter(m => m.targetTable).map((mod, modIdx) => (
                    <div key={mod.sourceModule}>
                      <div className="px-4 py-2 text-xs font-semibold flex items-center justify-between"
                        style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-2)' }}>
                        <span>{mod.sourceModule}</span>
                        <span className="font-mono" style={{ color: 'var(--accent)' }}>→ {mod.targetTable}</span>
                      </div>
                      <table className="w-full text-xs">
                        <thead><tr style={{ background: 'var(--surface-3)' }}>
                          <th className="px-3 py-1.5 text-left" style={{ color: 'var(--text-3)' }}>Kaynak</th>
                          <th className="px-3 py-1.5 text-left" style={{ color: 'var(--text-3)' }}>Hedef</th>
                          <th className="px-3 py-1.5 text-left" style={{ color: 'var(--text-3)' }}>Dönüşüm</th>
                        </tr></thead>
                        <tbody>
                          {mod.fields.slice(0, 15).map((f, fIdx) => (
                            <tr key={f.sourceField} style={{ borderTop: '1px solid var(--border)' }}>
                              <td className="px-3 py-1 font-mono" style={{ color: 'var(--text-3)' }}>{f.sourceField}</td>
                              <td className="px-3 py-1">
                                <input value={f.targetField ?? ''} onChange={e => updateFieldMapping(modIdx, fIdx, 'targetField', e.target.value)}
                                  className="w-full px-2 py-0.5 rounded text-xs font-mono"
                                  style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none' }} />
                              </td>
                              <td className="px-3 py-1">
                                <select value={f.transform ?? 'direct'} onChange={e => updateFieldMapping(modIdx, fIdx, 'transform', e.target.value)}
                                  className="text-xs px-2 py-0.5 rounded"
                                  style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none' }}>
                                  {TRANSFORM_TYPES.map(t => <option key={t} value={t} style={{ background: 'var(--surface-modal)', color: 'var(--text-1)' }}>{t}</option>)}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: schema preview */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>DB Schema Önizleme</h3>
                <div className="space-y-3" style={{ maxHeight: 420, overflowY: 'auto' }}>
                  {Object.entries(schemaPreview).map(([table, { mapped, custom }]) => (
                    <div key={table} className="rounded-2xl p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <div className="font-mono text-sm font-semibold mb-2" style={{ color: 'var(--accent)' }}>{table}</div>
                      {mapped.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>Eşleşen alanlar:</p>
                          <div className="flex flex-wrap gap-1">
                            {mapped.map(f => (
                              <span key={f} className="px-2 py-0.5 rounded-lg text-xs font-mono"
                                style={{ background: 'rgba(38,166,154,0.15)', color: 'var(--accent)', border: '1px solid rgba(38,166,154,0.3)' }}>{f}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {custom.length > 0 && (
                        <div>
                          <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>custom_fields'e gidecek:</p>
                          <div className="flex flex-wrap gap-1">
                            {custom.slice(0, 8).map(f => (
                              <span key={f} className="px-2 py-0.5 rounded-lg text-xs font-mono"
                                style={{ background: 'var(--surface-3)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>{f}</span>
                            ))}
                            {custom.length > 8 && <span className="text-xs px-2 py-0.5" style={{ color: 'var(--text-3)' }}>+{custom.length - 8} daha</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {Object.keys(schemaPreview).length === 0 && (
                    <p className="text-sm text-center py-8" style={{ color: 'var(--text-3)' }}>Hiçbir modül eşleştirilmedi.</p>
                  )}
                </div>
                <div className="p-3 rounded-xl text-xs" style={{ background: 'rgba(38,166,154,0.08)', border: '1px solid rgba(38,166,154,0.2)', color: 'var(--text-3)' }}>
                  {connector.aiGenerated !== false ? '✓ AI ile oluşturuldu' : '⚠ Regex tabanlı (AI kullanılamadı)'} — v{connector.version}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-5" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <ChevronLeft size={16} /> {step === 1 ? 'İptal' : 'Geri'}
          </button>

          <div className="flex gap-3">
            {step === 1 && (
              <button disabled={!sourceType || sourceType !== 'database'}
                onClick={() => setStep(2)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-medium disabled:opacity-40"
                style={{ background: 'var(--accent)', color: '#fff' }}>
                Devam <ChevronRight size={16} />
              </button>
            )}
            {step === 2 && (
              <button onClick={saveAndAdvance}
                className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-medium"
                style={{ background: 'var(--accent)', color: '#fff' }}>
                {testStatus === 'ok' ? 'Kaydet & Tara' : 'Test Et & Kaydet'} <ChevronRight size={16} />
              </button>
            )}
            {step === 3 && !scanDone && (
              <span className="px-4 py-2.5 text-sm" style={{ color: 'var(--text-3)' }}>
                <Loader2 size={14} className="animate-spin inline mr-2" />Tarama devam ediyor...
              </span>
            )}
            {step === 3 && scanDone && !importDone && (
              <>
                <button onClick={importDirect} disabled={importLoading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-medium disabled:opacity-50"
                  style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}>
                  {importLoading ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
                  Eşleştirmesiz İçe Aktar
                </button>
                <button onClick={initMappings}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-medium"
                  style={{ background: 'var(--accent)', color: '#fff' }}>
                  Modülleri Eşleştir <ChevronRight size={16} />
                </button>
              </>
            )}
            {step === 3 && scanDone && importDone && (
              <button onClick={onDone}
                className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-medium"
                style={{ background: 'var(--accent)', color: '#fff' }}>
                <CheckCircle size={14} /> Tamamla
              </button>
            )}
            {step === 4 && (
              <button onClick={startAiGeneration}
                disabled={!Object.values(userMappings).some(Boolean)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-medium disabled:opacity-40"
                style={{ background: 'var(--forest)', color: '#fff' }}>
                <Zap size={14} /> AI Konnektör Üret
              </button>
            )}
            {step === 5 && aiDone && (
              <button onClick={() => setStep(6)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-medium"
                style={{ background: 'var(--accent)', color: '#fff' }}>
                Önizlemeye Git <ChevronRight size={16} />
              </button>
            )}
            {step === 6 && (
              <button onClick={confirmAndSave} disabled={saveLoading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--accent)', color: '#fff' }}>
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

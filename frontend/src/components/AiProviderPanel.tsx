import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Brain, Save, Trash2, RefreshCw, CheckCircle, AlertCircle,
  Zap, ChevronDown, ChevronRight, ExternalLink, Key, Search,
} from 'lucide-react'
import api from '../lib/api'

// ─── Provider display metadata ───────────────────────────────────────────────
export const PROVIDER_META: Record<string, { name: string; color: string; abbr: string }> = {
  openrouter:  { name: 'OpenRouter',   color: '#6366f1', abbr: 'OR' },
  openai:      { name: 'OpenAI',       color: '#10a37f', abbr: 'OA' },
  anthropic:   { name: 'Anthropic',    color: '#d97706', abbr: 'AN' },
  google:      { name: 'Google',       color: '#4285f4', abbr: 'GO' },
  mistral:     { name: 'Mistral AI',   color: '#ff7000', abbr: 'MI' },
  groq:        { name: 'Groq',         color: '#f55036', abbr: 'GQ' },
  together:    { name: 'Together AI',  color: '#7c3aed', abbr: 'TG' },
  fireworks:   { name: 'Fireworks AI', color: '#ec4899', abbr: 'FW' },
  deepseek:    { name: 'DeepSeek',     color: '#0ea5e9', abbr: 'DS' },
  cohere:      { name: 'Cohere',       color: '#39d353', abbr: 'CO' },
  cerebras:    { name: 'Cerebras',     color: '#f97316', abbr: 'CB' },
  cloudflare:  { name: 'Cloudflare',   color: '#f6821f', abbr: 'CF' },
  alibaba:     { name: 'Alibaba (QWen)',color: '#ff6a00', abbr: 'AL' },
  huggingface: { name: 'Hugging Face', color: '#ffd21e', abbr: 'HF' },
}
export function providerName(id: string) { return PROVIDER_META[id]?.name ?? id.charAt(0).toUpperCase() + id.slice(1) }
export function ProviderBadge({ id, size = 20 }: { id: string; size?: number }) {
  const meta = PROVIDER_META[id]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: 6,
      background: meta?.color ?? '#888',
      fontSize: size * 0.38, fontWeight: 700, color: '#fff',
      flexShrink: 0, letterSpacing: '-0.5px',
    }}>
      {meta?.abbr ?? id.slice(0,2).toUpperCase()}
    </span>
  )
}

export const MODEL_ROLE_LABELS: Record<string, string> = {
  intent_analysis:            'Niyet & Ruh Hali Analizörü',
  support_problem:            'Destek Sorun Analizörü',
  support_solution:           'Destek Çözüm Analizörü',
  support_generator:          'Destek Çözüm Üreticisi',
  sales_intent:               'Satış Niyet & Ruh Hali',
  sales_conversation:         'Satış Konuşma Motoru',
  consulting_intent:          'Danışman Niyet Analizörü',
  consulting_recommendation:  'Danışman Öneri Motoru',
  master_conversation:        'Master AI Motoru',
  db_query:                   'DB Sorgu Motoru',
  kb_vector:                  'KB Embedding Motoru',
  connector:                  'Connector AI',
  kb_signal_writer:           'KB Sinyal Yazıcı',
}

// Entity AI tab excludes the standalone consulting-advisor roles — every other
// role acts on the entity's own data and stays available.
export const ENTITY_MODEL_ROLE_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(MODEL_ROLE_LABELS).filter(([role]) => role !== 'consulting_intent' && role !== 'consulting_recommendation'),
)

// ─── AI Provider Panel types ──────────────────────────────────────────────────
interface AiProviderInfo {
  id:          string
  name:        string
  docsUrl:     string
  freeModels:  boolean
  isConfigured: boolean
}
interface ModelGroup  { provider: string; models: Array<{ id: string; name: string }> }
interface RoleConfig  { modelRole: string; primaryModel: string; fallback1?: string; fallback2?: string }

// ─── Ping result helpers ──────────────────────────────────────────────────────
type PingResult = { ok: boolean; latencyMs: number; speed?: string; errorType?: string; error?: string; model: string }
type FieldPing  = PingResult | 'loading' | undefined

export const ERROR_LABELS: Record<string, string> = {
  timeout:      'Zaman aşımı',
  network:      'Bağlantı hatası',
  auth:         'Kimlik doğrulama hatası',
  not_found:    'Model bulunamadı',
  rate_limit:   'Hız sınırı (429)',
  server_error: 'Sunucu hatası',
  error:        'Hata',
}

export function PingBadge({ result }: { result: FieldPing }) {
  if (!result) return null
  if (result === 'loading') return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded animate-pulse" style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}>
      <RefreshCw size={9} className="animate-spin" /> test ediliyor...
    </span>
  )
  if (result.ok) {
    const color = result.speed === 'fast' ? '#4ade80' : result.speed === 'slow' ? '#fbbf24' : '#f97316'
    const bg    = result.speed === 'fast' ? 'rgba(34,197,94,0.1)' : result.speed === 'slow' ? 'rgba(251,191,36,0.1)' : 'rgba(249,115,22,0.1)'
    const label = result.speed === 'fast' ? 'Kullanılabilir' : result.speed === 'slow' ? 'Yavaş' : 'Çok Yavaş'
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-full"
        style={{ background: bg, color }} title={`${result.latencyMs}ms`}>
        ✓ {label} · {result.latencyMs}ms
      </span>
    )
  }
  const errLabel = ERROR_LABELS[result.errorType ?? ''] ?? result.errorType ?? 'Hata'
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full max-w-[200px]"
      style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}
      title={result.error ?? ''}>
      ✗ {errLabel}{result.error ? ` — ${result.error.slice(0, 60)}` : ''}
    </span>
  )
}

// 3 dots summary for collapsed header view
type RolePing = { primary?: FieldPing; fb1?: FieldPing; fb2?: FieldPing }
export function PingDots({ rp }: { rp?: RolePing }) {
  if (!rp) return null
  const fields: Array<['primary' | 'fb1' | 'fb2', string]> = [['primary', 'P'], ['fb1', 'F1'], ['fb2', 'F2']]
  return (
    <div className="flex items-center gap-1">
      {fields.map(([f, lbl]) => {
        const r = rp[f]
        if (!r) return null
        if (r === 'loading') return <span key={f} className="w-4 h-4 rounded-full animate-pulse" style={{ background: 'var(--border)' }} title={lbl} />
        const color = r.ok ? (r.speed === 'fast' ? '#4ade80' : r.speed === 'slow' ? '#fbbf24' : '#f97316') : '#f87171'
        const label = r.ok ? `${lbl}: ✓ ${r.latencyMs}ms` : `${lbl}: ✗ ${ERROR_LABELS[r.errorType ?? ''] ?? 'Hata'}`
        return (
          <span key={f} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: color + '22', color }} title={label}>
            {lbl}
          </span>
        )
      })}
    </div>
  )
}

// ─── ModelCombobox — searchable model picker ──────────────────────────────────
function ModelCombobox({
  value, onChange, modelGroups, placeholder,
}: {
  value: string
  onChange: (val: string) => void
  modelGroups: ModelGroup[]
  placeholder: string
}) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const wrapperRef        = useRef<HTMLDivElement>(null)
  const [dropRect, setDropRect] = useState<DOMRect | null>(null)

  const openDrop = () => {
    if (wrapperRef.current) setDropRect(wrapperRef.current.getBoundingClientRect())
    setQuery('')
    setOpen(true)
  }
  const closeDrop = () => { setOpen(false); setQuery('') }

  const selectModel = (fullId: string) => { onChange(fullId); closeDrop() }

  const q = query.toLowerCase()
  const grouped = modelGroups
    .map(g => ({
      provider: g.provider,
      models: !q ? g.models : g.models.filter(m => m.id.toLowerCase().includes(q) || g.provider.toLowerCase().includes(q)),
    }))
    .filter(g => g.models.length > 0)

  const prov = value ? value.split('::')[0] : ''

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center" style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-modal)', overflow: 'hidden' }}>
        {prov && !open && <span className="ml-2 flex-shrink-0"><ProviderBadge id={prov} size={16} /></span>}
        {open && <Search size={13} className="ml-2 flex-shrink-0" style={{ color: 'var(--text-3)' }} />}
        <input
          value={open ? query : value}
          onChange={e => { if (open) setQuery(e.target.value) }}
          onFocus={openDrop}
          onBlur={() => setTimeout(closeDrop, 150)}
          placeholder={open ? 'Ara...' : placeholder}
          className="flex-1 px-3 py-2 text-xs outline-none font-mono"
          style={{ background: 'transparent', color: 'var(--text-1)' }}
        />
        {value && (
          <button onMouseDown={e => { e.preventDefault(); onChange('') }}
            className="px-2 text-xs" style={{ color: 'var(--text-3)' }}>×</button>
        )}
        <button onMouseDown={e => { e.preventDefault(); open ? closeDrop() : openDrop() }}
          className="px-2" style={{ color: 'var(--text-3)' }}>
          <ChevronDown size={12} />
        </button>
      </div>
      {open && dropRect && createPortal(
        <div style={{
          position: 'fixed',
          top: dropRect.bottom + 4,
          left: dropRect.left,
          width: dropRect.width,
          zIndex: 99999,
          maxHeight: 280,
          overflowY: 'auto',
          background: 'var(--surface-modal)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        }}>
          {modelGroups.length === 0
            ? <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-3)' }}>Model havuzu boş — "Modelleri Yükle" butonuna basın</div>
            : grouped.length === 0
              ? <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-3)' }}>Eşleşen model yok</div>
              : grouped.map(g => (
                <div key={g.provider}>
                  <div className="flex items-center gap-2 px-3 py-1.5 sticky top-0"
                    style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                    <ProviderBadge id={g.provider} size={14} />
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--text-2)' }}>{providerName(g.provider)}</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>({g.models.length})</span>
                  </div>
                  {g.models.slice(0, 30).map(m => {
                    const fullId = `${g.provider}::${m.id}`
                    return (
                      <button key={m.id}
                        onMouseDown={() => selectModel(fullId)}
                        className="w-full text-left px-3 py-1.5 text-[11px] font-mono transition-all"
                        style={{
                          color: value === fullId ? 'var(--accent)' : 'var(--text-1)',
                          background: value === fullId ? 'rgba(38,166,154,0.08)' : 'transparent',
                        }}>
                        {m.id}
                      </button>
                    )
                  })}
                </div>
              ))
          }
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── AiProviderPanel ─────────────────────────────────────────────────────────
export type AiScope = 'kibi' | 'entity-free' | 'entity-basic' | 'entity-premium' | 'entity-enterprise' | 'entity'

export const SCOPE_LABELS: Record<AiScope, string> = {
  'kibi':              'KIBI AI',
  'entity-free':       'Entity Free Tier',
  'entity-basic':      'Entity Basic Tier',
  'entity-premium':    'Entity Premium Tier',
  'entity-enterprise': 'Entity Enterprise Tier',
  'entity':            'Entity AI',
}

export const SCOPE_COLORS: Record<AiScope, string> = {
  'kibi':              'linear-gradient(135deg, var(--accent), var(--forest))',
  'entity-free':       'linear-gradient(135deg, #6366f1, #4f46e5)',
  'entity-basic':      'linear-gradient(135deg, #0ea5e9, #0284c7)',
  'entity-premium':    'linear-gradient(135deg, #d97706, #b45309)',
  'entity-enterprise': 'linear-gradient(135deg, #7c3aed, #6d28d9)',
  'entity':            'linear-gradient(135deg, var(--accent), var(--forest))',
}

export function AiProviderPanel({
  scope, baseEndpoint, modelsPath, isAdmin, disabled, roleLabels, showToast,
}: {
  scope:        AiScope
  baseEndpoint: string
  modelsPath?:  string
  isAdmin:      boolean
  disabled?:    boolean
  roleLabels?:  Record<string, string>
  showToast:    (msg: string, ok?: boolean) => void
}) {
  const readOnly = !isAdmin || !!disabled
  const labels = roleLabels ?? MODEL_ROLE_LABELS
  const [providers,   setProviders]   = useState<AiProviderInfo[]>([])
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>([])
  const [roles,       setRoles]       = useState<RoleConfig[]>([])
  const [roleEdits,   setRoleEdits]   = useState<Record<string, { primary: string; fb1: string; fb2: string }>>({})
  const [loading,      setLoading]      = useState(true)
  const [poolLoading,  setPoolLoading]  = useState(false)
  const [roleSaving,   setRoleSaving]   = useState(false)
  const [poolLastAt,   setPoolLastAt]   = useState<Date | null>(null)
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [editKey,      setEditKey]      = useState('')
  const [savingKey,    setSavingKey]    = useState(false)
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({})
  const [pingStatus,  setPingStatus]  = useState<Record<string, RolePing>>({})

  const pingOne = async (role: string, field: 'primary' | 'fb1' | 'fb2', model: string): Promise<void> => {
    if (!model) return
    setPingStatus(p => ({ ...p, [role]: { ...p[role], [field]: 'loading' } }))
    try {
      const r = await api.post(`${baseEndpoint}/test-model`, { model })
      const result: PingResult = { ok: r.data.ok, latencyMs: r.data.latencyMs, speed: r.data.speed, errorType: r.data.errorType, error: r.data.error, model }
      setPingStatus(p => ({ ...p, [role]: { ...p[role], [field]: result } }))
    } catch (e: any) {
      const result: PingResult = { ok: false, latencyMs: 0, errorType: 'network', error: e.response?.data?.error ?? e.message, model }
      setPingStatus(p => ({ ...p, [role]: { ...p[role], [field]: result } }))
    }
  }

  const pingAll = (role: string, edit: { primary: string; fb1: string; fb2: string }) => {
    const fields: Array<['primary' | 'fb1' | 'fb2', string]> = [
      ['primary', edit.primary],
      ['fb1', edit.fb1],
      ['fb2', edit.fb2],
    ]
    for (const [field, model] of fields) {
      if (model) pingOne(role, field, model)
    }
  }

  const poolCacheKey = `ki_model_pool_${scope}`

  const fetchModels = async (silent = false) => {
    if (!silent) setPoolLoading(true)
    try {
      const res = await api.get(modelsPath ?? `${baseEndpoint}/models`)
      const newGroups: ModelGroup[] = res.data.providers ?? []
      // Detect changes vs last saved snapshot
      try {
        const cached = localStorage.getItem(poolCacheKey)
        if (cached) {
          const { groups: oldGroups } = JSON.parse(cached) as { groups: ModelGroup[] }
          const oldIds = new Set(oldGroups.flatMap(g => g.models.map(m => `${g.provider}::${m.id}`)))
          const newIds = new Set(newGroups.flatMap(g => g.models.map(m => `${g.provider}::${m.id}`)))
          const added   = [...newIds].filter(id => !oldIds.has(id)).length
          const removed = [...oldIds].filter(id => !newIds.has(id)).length
          if (added || removed) {
            const parts: string[] = []
            if (added)   parts.push(`+${added} yeni model`)
            if (removed) parts.push(`${removed} model kaldırıldı`)
            showToast(`Model havuzu değişti: ${parts.join(', ')}`)
          }
        }
      } catch { /* ignore */ }
      localStorage.setItem(poolCacheKey, JSON.stringify({ groups: newGroups, savedAt: new Date().toISOString() }))
      setModelGroups(newGroups)
      setPoolLastAt(new Date())
    } catch {
      if (!silent) showToast('Model havuzu yüklenemedi', false)
    } finally {
      setPoolLoading(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pRes, rRes] = await Promise.allSettled([
        api.get(`${baseEndpoint}`),
        api.get(`${baseEndpoint}/roles`),
      ])
      if (pRes.status === 'fulfilled') setProviders(pRes.value.data.providers ?? [])
      if (rRes.status === 'fulfilled') {
        const rows: RoleConfig[] = rRes.value.data.roles ?? []
        setRoles(rows)
        const edits: Record<string, { primary: string; fb1: string; fb2: string }> = {}
        for (const r of rows) edits[r.modelRole] = { primary: r.primaryModel ?? '', fb1: r.fallback1 ?? '', fb2: r.fallback2 ?? '' }
        setRoleEdits(edits)
      }
    } finally { setLoading(false) }
  }, [baseEndpoint])

  useEffect(() => {
    load()
    // Restore model pool from localStorage; auto-refresh if stale or missing
    try {
      const cached = localStorage.getItem(poolCacheKey)
      if (cached) {
        const { groups, savedAt } = JSON.parse(cached) as { groups: ModelGroup[]; savedAt: string }
        setModelGroups(groups ?? [])
        setPoolLastAt(new Date(savedAt))
        const ageMs = Date.now() - new Date(savedAt).getTime()
        if (ageMs > 30 * 60 * 1000) fetchModels(true)
      } else {
        fetchModels(true)
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load])

  const saveKey = async (providerId: string) => {
    if (!editKey.trim()) return
    setSavingKey(true)
    try {
      await api.put(`${baseEndpoint}/${providerId}`, { apiKey: editKey.trim() })
      showToast('API key kaydedildi')
      setEditingId(null)
      setEditKey('')
      await load()
    } catch { showToast('Kayıt başarısız', false) }
    finally { setSavingKey(false) }
  }

  const deleteKey = async (providerId: string) => {
    try {
      await api.delete(`${baseEndpoint}/${providerId}`)
      showToast('Key silindi')
      await load()
    } catch { showToast('Silinemedi', false) }
  }

  const saveRoles = async () => {
    setRoleSaving(true)
    try {
      const rolesPayload: Record<string, any> = {}
      for (const [role, edit] of Object.entries(roleEdits)) {
        if (edit.primary) rolesPayload[role] = { primary: edit.primary, fallback1: edit.fb1 || undefined, fallback2: edit.fb2 || undefined }
      }
      await api.put(`${baseEndpoint}/roles`, { roles: rolesPayload })
      showToast('Roller kaydedildi')
      await load()
    } catch { showToast('Kayıt başarısız', false) }
    finally { setRoleSaving(false) }
  }

  if (loading) return <div className="text-center py-12" style={{ color: 'var(--text-3)' }}>Yükleniyor...</div>

  return (
    <div className="space-y-5">
      {scope !== 'kibi' && scope !== 'entity' && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.20)', color: '#fbbf24' }}>
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
          <span>
            <strong>{SCOPE_LABELS[scope]}</strong> — Bu sekmedeki key'ler ve model atamaları, ilgili plan seviyesindeki entity kullanıcılarına sunulan paylaşımlı altyapıyı oluşturur.
            {scope === 'entity-free' && ' Kendi API key\'i olmayan ücretsiz kullanıcılar bu havuzu kullanır.'}
            {scope === 'entity-basic' && ' Basic plan sahibi entityler bu havuzu kullanır.'}
            {scope === 'entity-premium' && ' Premium plan sahibi entityler bu havuzu kullanır.'}
            {scope === 'entity-enterprise' && ' Enterprise plan sahibi entityler bu havuzu kullanır.'}
          </span>
        </div>
      )}

      {/* ── Provider API Keys ── */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', backdropFilter: 'blur(20px)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}>
            <Key size={15} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>Provider API Anahtarları</h3>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>Model havuzunu genişletmek için provider key'lerini yapılandırın</p>
          </div>
        </div>
        <div className="space-y-2">
          {providers.map(p => (
            <div key={p.id} className="rounded-xl p-3.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                  <ProviderBadge id={p.id} size={28} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{providerName(p.id)}</span>
                      {p.isConfigured
                        ? <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(38,166,154,0.15)', color: 'var(--accent)' }}><CheckCircle size={9}/> Bağlı</span>
                        : <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,0.10)', color: '#fbbf24' }}><AlertCircle size={9}/> Yapılandırılmadı</span>
                      }
                      {p.freeModels && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}>Ücretsiz Modeller</span>}
                    </div>
                    {p.docsUrl && (
                      <a href={p.docsUrl} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                        API Key Al <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                </div>
                {!readOnly && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => { setEditingId(p.id === editingId ? null : p.id); setEditKey('') }}
                      className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                      style={{ background: 'rgba(38,166,154,0.12)', color: 'var(--accent)', border: '1px solid rgba(38,166,154,0.25)' }}>
                      {p.isConfigured ? 'Güncelle' : 'Ayarla'}
                    </button>
                    {p.isConfigured && (
                      <button onClick={() => deleteKey(p.id)}
                        className="p-1.5 rounded-lg"
                        style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {editingId === p.id && !readOnly && (
                <div className="mt-3 flex gap-2">
                  <div className="flex-1 relative">
                    <input type="password" value={editKey} onChange={e => setEditKey(e.target.value)}
                      placeholder="API key girin..."
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ background: 'var(--surface-modal-2)', border: '1px solid var(--accent)', color: 'var(--text-1)' }} />
                  </div>
                  <button onClick={() => saveKey(p.id)} disabled={savingKey || !editKey.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-white disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}>
                    <Save size={12} /> {savingKey ? '...' : 'Kaydet'}
                  </button>
                  <button onClick={() => { setEditingId(null); setEditKey('') }}
                    className="px-3 py-2 rounded-lg text-xs"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                    İptal
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Model Pool ── */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', backdropFilter: 'blur(20px)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
              <Zap size={15} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>Model Havuzu</h3>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                {poolLastAt
                  ? `Son güncelleme: ${Math.round((Date.now() - poolLastAt.getTime()) / 60000)} dakika önce`
                  : 'Yapılandırılmış provider\'lardan modelleri yükleyin'}
              </p>
            </div>
          </div>
          <button onClick={() => fetchModels()} disabled={poolLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-all disabled:opacity-50"
            style={{ background: 'rgba(38,166,154,0.12)', color: 'var(--accent)', border: '1px solid rgba(38,166,154,0.25)' }}>
            <RefreshCw size={12} className={poolLoading ? 'animate-spin' : ''} />
            Modelleri Yükle
          </button>
        </div>
        {modelGroups.length === 0
          ? <p className="text-sm text-center py-6" style={{ color: 'var(--text-3)' }}>Modeller yükleniyor veya henüz yapılandırılmış sağlayıcı yok.</p>
          : (
            <div className="flex flex-wrap gap-2">
              {modelGroups.map(g => (
                <div key={g.provider} className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <ProviderBadge id={g.provider} size={22} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{providerName(g.provider)}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(38,166,154,0.12)', color: 'var(--accent)' }}>
                    {g.models.length}
                  </span>
                </div>
              ))}
            </div>
          )
        }
      </div>

      {/* ── Role Assignments ── */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', backdropFilter: 'blur(20px)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}>
              <Brain size={15} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>Rol Bazlı Model Atama</h3>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>Her AI rolü için primary + 2 yedek model atayın (provider::model formatında)</p>
            </div>
          </div>
          {!readOnly && (
            <button onClick={saveRoles} disabled={roleSaving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}>
              <Save size={12} /> {roleSaving ? 'Kaydediliyor...' : 'Tümünü Kaydet'}
            </button>
          )}
        </div>
        <div className="space-y-2">
          {Object.entries(labels).map(([role, label]) => {
            const edit  = roleEdits[role] ?? { primary: '', fb1: '', fb2: '' }
            const saved = roles.find(r => r.modelRole === role)
            const isOpen = sectionOpen[role] ?? false
            return (
              <div key={role} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <div className="flex items-center" style={{ background: 'var(--surface-2)' }}>
                  <button onClick={() => setSectionOpen(p => ({ ...p, [role]: !p[role] }))}
                    className="flex-1 flex items-center justify-between gap-3 px-4 py-3 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm font-medium flex-shrink-0" style={{ color: 'var(--text-1)' }}>{label}</span>
                      {saved?.primaryModel
                        ? <span className="text-[11px] font-mono truncate max-w-[180px]" style={{ color: 'var(--accent)' }}>{saved.primaryModel}</span>
                        : <span className="text-xs" style={{ color: 'var(--text-3)' }}>— seçilmedi —</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {saved?.primaryModel && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>Kayıtlı</span>}
                      {isOpen ? <ChevronDown size={13} style={{ color: 'var(--text-3)' }} /> : <ChevronRight size={13} style={{ color: 'var(--text-3)' }} />}
                    </div>
                  </button>
                  {/* Ping All on header — always visible when any model is saved */}
                  {(saved?.primaryModel || edit.fb1 || edit.fb2) && isAdmin && (
                    <div className="flex items-center gap-1.5 px-3 flex-shrink-0">
                      <PingDots rp={pingStatus[role]} />
                      <button
                        onClick={e => { e.stopPropagation(); pingAll(role, edit) }}
                        className="text-[10px] px-2 py-1 rounded-lg border transition-all whitespace-nowrap"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-3)', background: 'var(--surface)' }}>
                        Ping Tümü
                      </button>
                    </div>
                  )}
                </div>
                {isOpen && !readOnly && (
                  <div className="px-4 pb-4 pt-3 space-y-3" style={{ background: 'var(--surface)' }}>
                    {[
                      { field: 'primary', label: 'Primary Model', required: true },
                      { field: 'fb1',     label: 'Fallback 1',   required: false },
                      { field: 'fb2',     label: 'Fallback 2',   required: false },
                    ].map(({ field, label: fLabel, required }) => {
                      const currentVal = edit[field as keyof typeof edit]
                      const fieldPing = pingStatus[role]?.[field as 'primary' | 'fb1' | 'fb2']
                      return (
                      <div key={field}>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px]" style={{ color: 'var(--text-3)' }}>{fLabel}{required ? ' *' : ''}</label>
                          {currentVal && (
                            <div className="flex items-center gap-2">
                              <PingBadge result={fieldPing} />
                              <button onClick={() => pingOne(role, field as 'primary' | 'fb1' | 'fb2', currentVal)}
                                className="text-[10px] px-2 py-0.5 rounded-lg border transition-all"
                                style={{ borderColor: 'var(--border)', color: 'var(--text-3)', background: 'var(--surface-2)' }}>
                                Ping
                              </button>
                            </div>
                          )}
                        </div>
                        <ModelCombobox
                          value={edit[field as keyof typeof edit]}
                          onChange={val => setRoleEdits(p => ({ ...p, [role]: { ...edit, [field]: val } }))}
                          modelGroups={modelGroups}
                          placeholder={required ? 'Ara veya yaz: provider::model' : 'Opsiyonel yedek'}
                        />
                      </div>
                    )
                  })}
                  </div>
                )}
                {isOpen && readOnly && saved?.primaryModel && (
                  <div className="px-4 pb-4 pt-2 space-y-1" style={{ background: 'var(--surface)' }}>
                    {[['Primary', saved.primaryModel], ['Fallback 1', saved.fallback1], ['Fallback 2', saved.fallback2]].filter(([, v]) => v).map(([l, v]) => (
                      <div key={l} className="flex items-center gap-2">
                        <span className="text-xs w-16 flex-shrink-0" style={{ color: 'var(--text-3)' }}>{l}</span>
                        <span className="text-[11px] font-mono" style={{ color: 'var(--text-1)' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

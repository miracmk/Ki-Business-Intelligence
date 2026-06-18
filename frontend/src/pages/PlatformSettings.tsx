import { useEffect, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import {
  Database, MessageSquare, BarChart3, Brain,
  Eye, EyeOff, Save, Trash2, RefreshCw, CheckCircle, AlertCircle,
  Server, Wifi, HardDrive, Zap, Plus, X,
  BookOpen, AlertTriangle,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../store/auth'
import {
  AiProviderPanel, type AiScope, SCOPE_COLORS, MODEL_ROLE_LABELS,
} from '../components/AiProviderPanel'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Connection {
  id:          string
  name:        string
  type:        string
  credentials: Record<string, string>
  createdAt:   string
}

interface ProviderField {
  key:         string
  label:       string
  isSecret:    boolean
  placeholder?: string
  hint?:       string
  type?:       'text' | 'number' | 'select'
  options?:    string[]
}

interface Provider {
  type:   string
  label:  string
  emoji:  string
  fields: ProviderField[]
}

// ─── Provider schemas ─────────────────────────────────────────────────────────
const CRM_PROVIDERS: Provider[] = [
  {
    type: 'zoho_crm', label: 'Zoho CRM', emoji: '🔷',
    fields: [
      { key: 'client_id',     label: 'Client ID',       isSecret: false },
      { key: 'client_secret', label: 'Client Secret',   isSecret: true  },
      { key: 'refresh_token', label: 'Refresh Token',   isSecret: true  },
      { key: 'data_center',   label: 'Data Center',     isSecret: false, placeholder: 'zohoapis.com', hint: 'zohoapis.com | zohoapis.eu | zohoapis.in' },
    ],
  },
  {
    type: 'salesforce', label: 'Salesforce', emoji: '☁️',
    fields: [
      { key: 'client_id',     label: 'Consumer Key',    isSecret: false },
      { key: 'client_secret', label: 'Consumer Secret', isSecret: true  },
      { key: 'refresh_token', label: 'Refresh Token',   isSecret: true  },
      { key: 'instance_url',  label: 'Instance URL',    isSecret: false, placeholder: 'https://xxx.salesforce.com' },
    ],
  },
  {
    type: 'hubspot', label: 'HubSpot', emoji: '🧡',
    fields: [
      { key: 'private_app_token', label: 'Private App Token', isSecret: true  },
      { key: 'portal_id',         label: 'Portal ID',          isSecret: false },
    ],
  },
  {
    type: 'dynamics_crm', label: 'Microsoft Dynamics 365 CRM', emoji: '🪟',
    fields: [
      { key: 'tenant_id',     label: 'Tenant ID (Azure)',   isSecret: false },
      { key: 'client_id',     label: 'Client ID (App)',      isSecret: false },
      { key: 'client_secret', label: 'Client Secret',        isSecret: true  },
      { key: 'resource_url',  label: 'Resource URL',         isSecret: false, placeholder: 'https://xxx.crm.dynamics.com/' },
    ],
  },
  {
    type: 'pipedrive', label: 'Pipedrive', emoji: '🟢',
    fields: [
      { key: 'api_token',      label: 'API Token',       isSecret: true  },
      { key: 'company_domain', label: 'Company Domain',  isSecret: false, placeholder: 'yourcompany.pipedrive.com' },
    ],
  },
]

const ERP_PROVIDERS: Provider[] = [
  {
    type: 'sap_b1', label: 'SAP Business One', emoji: '🔵',
    fields: [
      { key: 'server_url',  label: 'Service Layer URL', isSecret: false, placeholder: 'https://server:50000/b1s/v1/' },
      { key: 'company_db',  label: 'Company DB',        isSecret: false },
      { key: 'username',    label: 'Username',           isSecret: false },
      { key: 'password',    label: 'Password',           isSecret: true  },
    ],
  },
  {
    type: 'netsuite', label: 'Oracle NetSuite', emoji: '🟠',
    fields: [
      { key: 'account_id',      label: 'Account ID',       isSecret: false },
      { key: 'consumer_key',    label: 'Consumer Key',     isSecret: false },
      { key: 'consumer_secret', label: 'Consumer Secret',  isSecret: true  },
      { key: 'token_id',        label: 'Token ID',         isSecret: false },
      { key: 'token_secret',    label: 'Token Secret',     isSecret: true  },
    ],
  },
  {
    type: 'odoo', label: 'Odoo', emoji: '🟣',
    fields: [
      { key: 'host',     label: 'Host URL',  isSecret: false, placeholder: 'https://yourcompany.odoo.com' },
      { key: 'database', label: 'Database',  isSecret: false },
      { key: 'username', label: 'Username',  isSecret: false },
      { key: 'api_key',  label: 'API Key',   isSecret: true  },
    ],
  },
  {
    type: 'dynamics_fo', label: 'Microsoft Dynamics 365 F&O', emoji: '🪟',
    fields: [
      { key: 'tenant_id',       label: 'Tenant ID (Azure)',    isSecret: false },
      { key: 'client_id',       label: 'Client ID (App)',       isSecret: false },
      { key: 'client_secret',   label: 'Client Secret',         isSecret: true  },
      { key: 'environment_url', label: 'Environment URL',        isSecret: false, placeholder: 'https://xxx.cloudax.dynamics.com/' },
    ],
  },
]

const ACCOUNTING_PROVIDERS: Provider[] = [
  {
    type: 'xero', label: 'Xero', emoji: '🔷',
    fields: [
      { key: 'client_id',     label: 'Client ID',      isSecret: false },
      { key: 'client_secret', label: 'Client Secret',  isSecret: true  },
      { key: 'refresh_token', label: 'Refresh Token',  isSecret: true  },
      { key: 'tenant_id',     label: 'Tenant ID',      isSecret: false, hint: 'Xero organization ID — found in Xero HQ' },
    ],
  },
  {
    type: 'zoho_books', label: 'Zoho Books', emoji: '📚',
    fields: [
      { key: 'org_id',        label: 'Organization ID',  isSecret: false },
      { key: 'client_id',     label: 'Client ID',         isSecret: false },
      { key: 'client_secret', label: 'Client Secret',     isSecret: true  },
      { key: 'refresh_token', label: 'Refresh Token',     isSecret: true  },
    ],
  },
  {
    type: 'parasut', label: 'Paraşüt', emoji: '🇹🇷',
    fields: [
      { key: 'username',   label: 'E-posta',     isSecret: false },
      { key: 'password',   label: 'Şifre',       isSecret: true  },
      { key: 'company_id', label: 'Şirket ID',   isSecret: false, hint: 'Paraşüt dashboard URL\'sindeki sayısal ID' },
    ],
  },
  {
    type: 'quickbooks', label: 'QuickBooks Online', emoji: '🟩',
    fields: [
      { key: 'client_id',     label: 'Client ID',      isSecret: false },
      { key: 'client_secret', label: 'Client Secret',  isSecret: true  },
      { key: 'refresh_token', label: 'Refresh Token',  isSecret: true  },
      { key: 'realm_id',      label: 'Company ID',     isSecret: false, hint: 'QuickBooks Company ID (Realm ID)' },
    ],
  },
]

// ─── Comms channel schemas ─────────────────────────────────────────────────────
const COMM_CHANNELS: { id: string; label: string; color: string; emoji: string; fields: ProviderField[] }[] = [
  {
    id: 'whatsapp', label: 'WhatsApp Business Cloud API', color: '#25D366', emoji: '📲',
    fields: [
      { key: 'phone_number_id', label: 'Phone Number ID',             isSecret: false, hint: 'Meta Business Suite → WhatsApp → API Setup' },
      { key: 'access_token',   label: 'Permanent Access Token',       isSecret: true  },
      { key: 'waba_id',        label: 'WhatsApp Business Account ID', isSecret: false },
      { key: 'app_secret',     label: 'App Secret',                   isSecret: true,  hint: 'Meta App → Settings → Basic → App Secret' },
      { key: 'verify_token',   label: 'Webhook Verify Token',         isSecret: false, hint: 'Özel belirlediğiniz güvenlik tokeni (webhook kurulumu için)' },
    ],
  },
  {
    id: 'instagram', label: 'Instagram Graph API', color: '#E1306C', emoji: '📸',
    fields: [
      { key: 'access_token', label: 'Page Access Token (Long-lived)', isSecret: true  },
      { key: 'page_id',      label: 'Instagram Business Account ID',  isSecret: false, hint: 'Business Manager → Instagram Accounts → Account ID' },
      { key: 'app_secret',   label: 'App Secret',                     isSecret: true,  hint: 'Meta App → Settings → Basic → App Secret' },
      { key: 'verify_token', label: 'Webhook Verify Token',           isSecret: false },
    ],
  },
  {
    id: 'telegram', label: 'Telegram Bot API', color: '#0088cc', emoji: '✈️',
    fields: [
      { key: 'bot_token',      label: 'Bot Token',         isSecret: true,  hint: '@BotFather → /newbot → token (format: 123456:ABC-DEF...)' },
      { key: 'bot_username',   label: 'Bot Username',      isSecret: false, hint: '@BotFather tarafından verilen bot ismi (@olmadan)' },
      { key: 'webhook_secret', label: 'Webhook Secret',    isSecret: true,  hint: 'Webhook doğrulama için özel gizli token (en az 32 karakter)' },
    ],
  },
  {
    id: 'email', label: 'E-posta / SMTP', color: '#6366f1', emoji: '📧',
    fields: [
      { key: 'host',       label: 'SMTP Host',        isSecret: false, placeholder: 'smtp.example.com' },
      { key: 'port',       label: 'Port',             isSecret: false, placeholder: '587', hint: '587 (STARTTLS) | 465 (SSL) | 25 (düz)' },
      { key: 'username',   label: 'SMTP Kullanıcı',  isSecret: false },
      { key: 'password',   label: 'SMTP Şifre',      isSecret: true  },
      { key: 'from_name',  label: 'Gönderen Adı',    isSecret: false, placeholder: 'Ki Business' },
      { key: 'from_email', label: 'Gönderen E-posta', isSecret: false, placeholder: 'noreply@example.com' },
      { key: 'secure',     label: 'SSL/TLS',          isSecret: false, type: 'select', options: ['true', 'false'], hint: 'Port 465 için true, 587 için false' },
    ],
  },
  {
    id: 'voip', label: 'VOIP / SIP', color: '#f59e0b', emoji: '📞',
    fields: [
      { key: 'sip_server',     label: 'SIP Server / Domain', isSecret: false, placeholder: 'sip.example.com' },
      { key: 'sip_user',       label: 'SIP Kullanıcı',       isSecret: false },
      { key: 'sip_password',   label: 'SIP Şifre',           isSecret: true  },
      { key: 'sip_port',       label: 'SIP Port',            isSecret: false, placeholder: '5060', hint: '5060 (UDP/TCP) | 5061 (TLS)' },
      { key: 'sip_transport',  label: 'Transport',           isSecret: false, type: 'select', options: ['UDP', 'TCP', 'TLS'] },
      { key: 'trunk_provider', label: 'Trunk Sağlayıcı',    isSecret: false, placeholder: 'Twilio / Vonage / Sinch / vb.' },
      { key: 'api_key',        label: 'Provider API Key',   isSecret: true,  hint: 'Sağlayıcı API anahtarı (opsiyonel)' },
      { key: 'api_secret',     label: 'Provider API Secret', isSecret: true,  hint: 'Sağlayıcı API gizlisi (opsiyonel)' },
    ],
  },
]

const TABS = [
  { id: 'crm',        label: 'CRM',          icon: Database      },
  { id: 'erp',        label: 'ERP',          icon: Server        },
  { id: 'accounting', label: 'Muhasebe',     icon: BarChart3     },
  { id: 'comms',      label: 'İletişim',     icon: MessageSquare },
  { id: 'database',   label: 'Veritabanı',   icon: HardDrive     },
  { id: 'ai',         label: 'AI Modelleri', icon: Brain         },
  { id: 'logs',       label: 'AI Günlükleri', icon: BarChart3    },
]

// ─── AI Models Tab (two sub-tabs) ─────────────────────────────────────────────
// ─── PlatformVectorPanel ──────────────────────────────────────────────────────
function PlatformVectorPanel({ isAdmin, showToast }: { isAdmin: boolean; showToast: (msg: string, ok?: boolean) => void }) {
  const [docs,        setDocs]        = useState<any[]>([])
  const [loading,     setLoading]     = useState(false)
  const [reindexing,  setReindexing]  = useState(false)
  const [showAdd,     setShowAdd]     = useState(false)
  const [newTitle,    setNewTitle]    = useState('')
  const [newContent,  setNewContent]  = useState('')
  const [newTags,     setNewTags]     = useState('')
  const [saving,      setSaving]      = useState(false)

  const loadDocs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/platform-vector-docs')
      setDocs(res.data.docs ?? [])
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadDocs() }, [loadDocs])

  const saveDoc = async () => {
    if (!newTitle.trim() || !newContent.trim()) return
    setSaving(true)
    try {
      await api.post('/admin/platform-vector-docs', {
        title:   newTitle.trim(),
        content: newContent.trim(),
        tags:    newTags.split(',').map(t => t.trim()).filter(Boolean),
      })
      showToast('Doküman eklendi ve vektöre indexlendi')
      setNewTitle(''); setNewContent(''); setNewTags(''); setShowAdd(false)
      await loadDocs()
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Kaydedilemedi', false)
    } finally {
      setSaving(false)
    }
  }

  const deleteDoc = async (id: string) => {
    try {
      await api.delete(`/admin/platform-vector-docs/${id}`)
      showToast('Doküman silindi')
      await loadDocs()
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Silinemedi', false)
    }
  }

  const reindexAll = async () => {
    setReindexing(true)
    try {
      const res = await api.post('/admin/platform-vector-docs/reindex-all')
      showToast(`${res.data.indexed}/${res.data.total} doküman yeniden indexlendi`)
      await loadDocs()
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Reindex başarısız', false)
    } finally {
      setReindexing(false)
    }
  }

  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="font-bold" style={{ color: 'var(--text-1)' }}>KIBI AI Vektör Tabanı</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Platform düzeyindeki AI arama için bilgi dokümanları</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={loadDocs} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'var(--surface-modal-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Yenile
          </button>
          {isAdmin && (
            <>
              <button onClick={reindexAll} disabled={reindexing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                style={{ background: 'rgba(168,85,247,0.10)', border: '1px solid rgba(168,85,247,0.25)', color: '#a855f7' }}>
                <Database size={12} /> {reindexing ? 'Reindex...' : 'Tümünü Reindex'}
              </button>
              <button onClick={() => setShowAdd(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white"
                style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}>
                <Plus size={12} /> Doküman Ekle
              </button>
            </>
          )}
        </div>
      </div>

      {showAdd && (
        <div className="mb-4 p-4 rounded-xl space-y-3" style={{ background: 'var(--surface-modal-2)', border: '1px solid var(--border)' }}>
          <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="Doküman başlığı..."
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--surface-modal)', border: '1px solid var(--accent)', color: 'var(--text-1)' }} />
          <textarea value={newContent} onChange={e => setNewContent(e.target.value)}
            placeholder="İçerik (KIBI hizmet açıklaması, politika, SSS...)&#10;AI sorgu sırasında bu içerik anlamsal olarak aranır."
            rows={5}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
            style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
          <input type="text" value={newTags} onChange={e => setNewTags(e.target.value)}
            placeholder="Etiketler (virgülle ayır): hizmet, fiyat, teknik..."
            className="w-full px-3 py-2 rounded-lg text-xs outline-none"
            style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)', color: 'var(--text-2)' }} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowAdd(false); setNewTitle(''); setNewContent(''); setNewTags('') }}
              className="px-4 py-2 rounded-lg text-xs"
              style={{ background: 'var(--surface-modal)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
              İptal
            </button>
            <button onClick={saveDoc} disabled={saving || !newTitle.trim() || !newContent.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}>
              <Save size={12} /> {saving ? 'Kaydediliyor...' : 'Kaydet & Vektörle'}
            </button>
          </div>
        </div>
      )}

      {loading
        ? <div className="text-center py-8 text-sm" style={{ color: 'var(--text-3)' }}>Yükleniyor...</div>
        : docs.length === 0
          ? <div className="text-center py-10" style={{ color: 'var(--text-3)' }}>
              <BookOpen size={30} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Henüz platform dokümanı eklenmedi</p>
              <p className="text-xs mt-1 opacity-60">KIBI AI'ın kullanacağı bilgi tabanını oluşturun</p>
            </div>
          : <div className="space-y-2">
              {docs.map((doc: any) => (
                <div key={doc.id} className="p-3 rounded-xl" style={{ background: 'var(--surface-modal-2)', border: '1px solid var(--border)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{doc.title}</span>
                        {doc.isIndexed
                          ? <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(38,166,154,0.12)', color: 'var(--accent)' }}>
                              <CheckCircle size={9} /> İndexlendi
                            </span>
                          : <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,0.10)', color: '#fbbf24' }}>
                              <AlertTriangle size={9} /> Bekliyor
                            </span>
                        }
                        {doc.tags?.length > 0 && doc.tags.map((tag: string) => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-3)' }}>{doc.content}</p>
                      {doc.vectorModel && (
                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-4, var(--text-3))', opacity: 0.7 }}>Model: {doc.vectorModel}</p>
                      )}
                    </div>
                    {isAdmin && (
                      <button onClick={() => deleteDoc(doc.id)}
                        className="p-1.5 rounded-lg flex-shrink-0"
                        style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
      }

      {/* KB Arama Testi */}
      <KbSearchTest />

      {/* Sinyal İstatistikleri */}
      <KbSignalStats />
    </div>
  )
}

function KbSearchTest() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  const runSearch = async () => {
    if (!query.trim()) return
    setSearching(true); setSearched(false)
    try {
      const res = await api.post('/admin/kb-search', { query: query.trim(), limit: 5 })
      setResults(res.data.results ?? [])
    } catch { setResults([]) } finally {
      setSearching(false); setSearched(true)
    }
  }

  return (
    <div className="mt-4 p-4 rounded-xl" style={{ background: 'var(--surface-modal-2)', border: '1px solid var(--border)' }}>
      <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-1)' }}>KB Arama Testi</h4>
      <div className="flex gap-2 mb-3">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runSearch()}
          placeholder="Arama sorgusu..."
          className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
        />
        <button onClick={runSearch} disabled={searching || !query.trim()}
          className="px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))', color: '#fff' }}>
          {searching ? '...' : 'Ara'}
        </button>
      </div>
      {searched && (
        <div className="space-y-2">
          {results.length === 0
            ? <p className="text-xs" style={{ color: 'var(--text-3)' }}>Sonuç bulunamadı</p>
            : results.map((r: any, i: number) => (
              <div key={i} className="p-3 rounded-lg" style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-1)' }}>{r.payload?.title ?? `Sonuç ${i + 1}`}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
                    Skor: {(r.score * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs line-clamp-2" style={{ color: 'var(--text-3)' }}>{r.payload?.content ?? ''}</p>
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}

function KbSignalStats() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/kb-signals').then(r => setStats(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return null
  if (!stats) return null

  return (
    <div className="mt-4 p-4 rounded-xl" style={{ background: 'var(--surface-modal-2)', border: '1px solid var(--border)' }}>
      <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-1)' }}>Sinyal İstatistikleri</h4>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Toplam İstek', value: stats.total, color: '#818cf8' },
          { label: 'Başarı Oranı', value: `${stats.successRate}%`, color: '#22c55e' },
          { label: 'KB Yazılan', value: `${stats.kbWritten} (${stats.kbWrittenRate}%)`, color: 'var(--accent)' },
          { label: 'Yönlendirilen', value: stats.escalated, color: '#f59e0b' },
          { label: 'Ort. Güven', value: `${stats.avgConfidence}%`, color: '#a78bfa' },
        ].map(s => (
          <div key={s.label} className="p-3 rounded-lg" style={{ background: 'var(--surface-modal)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>{s.label}</p>
            <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>
      {Object.keys(stats.byRole ?? {}).length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>Rol Dağılımı</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(stats.byRole as Record<string, number>).map(([role, count]) => (
              <span key={role} className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
                {role}: {count}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── AI Logs Tab ─────────────────────────────────────────────────────────────
function AiLogsTab() {
  const [logs, setLogs] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [filterRole, setFilterRole] = useState<string>('')

  useEffect(() => {
    fetchLogs()
  }, [filterRole])

  const fetchLogs = async () => {
    try {
      const url = `/admin/pipeline-logs${filterRole ? `?modelRole=${filterRole}&limit=100` : '?limit=100'}`
      const res = await api.get(url)
      setLogs(res.data.logs ?? [])
      setSummary(res.data.summary)
    } catch (e) {
      console.error('Failed to fetch logs:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary badges */}
      <div className="grid sm:grid-cols-4 gap-3">
        {summary && [
          { label: 'Toplam', value: summary.total, color: 'var(--text-2)' },
          { label: 'Başarı', value: `${summary.successRate}%`, color: '#10b981' },
          { label: 'Escalation', value: summary.escalatedCount, color: '#ef4444' },
          { label: 'Avg Latency', value: `${summary.avgLatencyMs}ms`, color: 'var(--teal)' },
        ].map(stat => (
          <div key={stat.label} className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text-3)', fontSize: '0.875rem' }}>{stat.label}</div>
            <div style={{ color: stat.color, fontSize: '1.5rem', fontWeight: 'bold' }} className="mt-1">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Filtre & Tablo */}
      <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="mb-4">
          <label style={{ color: 'var(--text-2)', fontSize: '0.875rem' }} className="block mb-2">Rol Filtresi</label>
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--surface-modal-2)', color: 'var(--text-1)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <option value="">Tüm Roller</option>
            {Object.entries(MODEL_ROLE_LABELS).map(([role, label]) => (
              <option key={role} value={role}>{label}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: '2rem' }}>Yükleniyor...</div>
        ) : logs.length === 0 ? (
          <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: '2rem' }}>Kayıt bulunamadı</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ color: 'var(--text-2)', textAlign: 'left', padding: '0.5rem' }}>Tarih</th>
                  <th style={{ color: 'var(--text-2)', textAlign: 'left', padding: '0.5rem' }}>Rol</th>
                  <th style={{ color: 'var(--text-2)', textAlign: 'left', padding: '0.5rem' }}>Model</th>
                  <th style={{ color: 'var(--text-2)', textAlign: 'left', padding: '0.5rem' }}>Latency</th>
                  <th style={{ color: 'var(--text-2)', textAlign: 'left', padding: '0.5rem' }}>Sonuç</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ color: 'var(--text-2)', padding: '0.75rem 0.5rem' }}>
                      {new Date(log.createdAt).toLocaleString('tr')}
                    </td>
                    <td style={{ color: 'var(--text-2)', padding: '0.75rem 0.5rem' }}>
                      {MODEL_ROLE_LABELS[log.modelRole] || log.modelRole}
                    </td>
                    <td style={{ color: 'var(--text-3)', padding: '0.75rem 0.5rem', fontSize: '0.8rem' }}>
                      {log.modelUsed || '—'}
                    </td>
                    <td style={{ color: 'var(--text-2)', padding: '0.75rem 0.5rem' }}>
                      {log.latencyMs ? `${log.latencyMs}ms` : '—'}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <span
                        className="px-2 py-1 rounded text-xs"
                        style={{
                          background: log.success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                          color: log.success ? '#10b981' : '#ef4444',
                        }}
                      >
                        {log.success ? '✓ Başarı' : '✗ Hata'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function AiModelsTab({ isAdmin, showToast }: { isAdmin: boolean; showToast: (msg: string, ok?: boolean) => void }) {
  const [subTab, setSubTab] = useState<AiScope | 'vector'>('kibi')

  const AI_TABS: Array<{ id: AiScope | 'vector'; label: string; icon: typeof Brain }> = [
    { id: 'kibi',              label: 'KIBI AI',             icon: Brain    },
    { id: 'entity-free',       label: 'Free Tier',           icon: Zap      },
    { id: 'entity-basic',      label: 'Basic Tier',          icon: Zap      },
    { id: 'entity-premium',    label: 'Premium Tier',        icon: Zap      },
    { id: 'entity-enterprise', label: 'Enterprise Tier',     icon: Zap      },
    { id: 'vector',            label: 'Vektör Tabanı',       icon: Database },
  ]

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {AI_TABS.map(t => {
          const isActive = subTab === t.id
          const bg = isActive
            ? (t.id !== 'vector' && t.id !== 'kibi' ? SCOPE_COLORS[t.id as AiScope] : 'linear-gradient(135deg, var(--accent), var(--forest))')
            : undefined
          return (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={isActive
                ? { background: bg, color: '#fff', boxShadow: '0 4px 12px rgba(38,166,154,0.25)' }
                : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
              <t.icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {subTab !== 'vector' && (
        <AiProviderPanel
          key={subTab}
          scope={subTab as AiScope}
          baseEndpoint={`/admin/ai-providers/${subTab}`}
          isAdmin={isAdmin}
          showToast={showToast}
        />
      )}
      {subTab === 'vector' && (
        <PlatformVectorPanel isAdmin={isAdmin} showToast={showToast} />
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatusBadge({ isSet }: { isSet: boolean }) {
  return isSet
    ? <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(38,166,154,0.15)', color: 'var(--accent)' }}><CheckCircle size={10} /> Bağlı</span>
    : <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.10)', color: '#f87171' }}><AlertCircle size={10} /> Yapılandırılmadı</span>
}

function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? '••••••••'}
        className="w-full px-3 py-2 pr-9 rounded-lg text-sm outline-none"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
      />
      <button type="button" onClick={() => setShow(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }}>
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}

// ─── Add Connection Modal ─────────────────────────────────────────────────────
function AddConnectionModal({ providers, onSave, onClose }: {
  providers: Provider[]
  onSave: (conn: Omit<Connection, 'id' | 'createdAt'>) => Promise<void>
  onClose: () => void
}) {
  const [selectedType, setSelectedType] = useState(providers[0]?.type ?? '')
  const [name, setName]                 = useState('')
  const [creds, setCreds]               = useState<Record<string, string>>({})
  const [saving, setSaving]             = useState(false)

  const provider = providers.find(p => p.type === selectedType)

  const handleSave = async () => {
    if (!name.trim() || !provider) return
    setSaving(true)
    await onSave({ name: name.trim(), type: selectedType, credentials: creds })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md mx-4 rounded-2xl overflow-hidden" style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-bold" style={{ color: 'var(--text-1)' }}>Yeni Bağlantı Ekle</h3>
          <button onClick={onClose} style={{ color: 'var(--text-3)' }}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Provider selector */}
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-2)' }}>Sağlayıcı</label>
            <div className="grid grid-cols-2 gap-2">
              {providers.map(p => (
                <button key={p.type} onClick={() => setSelectedType(p.type)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-left transition-all"
                  style={selectedType === p.type
                    ? { background: 'linear-gradient(135deg, var(--accent), var(--forest))', color: '#fff' }
                    : { background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                  <span>{p.emoji}</span> {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Connection name */}
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-2)' }}>Bağlantı Adı</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder={`${provider?.label} Bağlantısı`}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
          </div>

          {/* Credential fields */}
          {provider?.fields.map(f => (
            <div key={f.key}>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-2)' }}>{f.label}</label>
              {f.type === 'select' ? (
                <select value={creds[f.key] ?? ''} onChange={e => setCreds(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}>
                  <option value="">Seçin...</option>
                  {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.isSecret ? (
                <SecretInput value={creds[f.key] ?? ''} onChange={v => setCreds(p => ({ ...p, [f.key]: v }))} placeholder={f.placeholder} />
              ) : (
                <input value={creds[f.key] ?? ''} onChange={e => setCreds(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
              )}
              {f.hint && <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>{f.hint}</p>}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm"
            style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
            İptal
          </button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}>
            <Save size={14} /> {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Comm Config Modal ────────────────────────────────────────────────────────
function CommConfigModal({ channel, existingData, onSave, onClose }: {
  channel: typeof COMM_CHANNELS[0]
  existingData: Record<string, string> | null
  onSave: (data: Record<string, string>) => Promise<void>
  onClose: () => void
}) {
  const [data, setData]     = useState<Record<string, string>>(existingData ?? {})
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave(data)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md mx-4 rounded-2xl overflow-hidden" style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <span>{channel.emoji}</span>
            <h3 className="font-bold" style={{ color: 'var(--text-1)' }}>{channel.label}</h3>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-3)' }}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {channel.fields.map(f => (
            <div key={f.key}>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-2)' }}>{f.label}</label>
              {f.type === 'select' ? (
                <select value={data[f.key] ?? ''} onChange={e => setData(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}>
                  <option value="">Seçin...</option>
                  {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.isSecret ? (
                <SecretInput value={data[f.key] ?? ''} onChange={v => setData(p => ({ ...p, [f.key]: v }))} placeholder={f.placeholder} />
              ) : (
                <input value={data[f.key] ?? ''} onChange={e => setData(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
              )}
              {f.hint && <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>{f.hint}</p>}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm"
            style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
            İptal
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-white disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${channel.color}, ${channel.color}cc)` }}>
            <Save size={14} /> {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Connection List Tab ──────────────────────────────────────────────────────
function ConnectionListTab({ category, providers, isAdmin, showToast }: {
  category: string
  providers: Provider[]
  isAdmin: boolean
  showToast: (msg: string, ok?: boolean) => void
}) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading]         = useState(true)
  const [showAdd, setShowAdd]         = useState(false)

  const load = useCallback(async () => {
    if (!isAdmin) { setLoading(false); return }
    try {
      const res = await api.get(`/admin/platform-connections/${category}`)
      setConnections(res.data.connections ?? [])
    } catch {
      showToast('Bağlantılar yüklenemedi', false)
    } finally {
      setLoading(false)
    }
  }, [category, isAdmin])

  useEffect(() => { load() }, [load])

  const handleAdd = async (conn: Omit<Connection, 'id' | 'createdAt'>) => {
    const newConn: Connection = { ...conn, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    const updated = [...connections, newConn]
    await api.put(`/admin/platform-connections/${category}`, { connections: updated })
    setConnections(updated)
    showToast('Bağlantı eklendi')
  }

  const handleDelete = async (id: string) => {
    const updated = connections.filter(c => c.id !== id)
    await api.put(`/admin/platform-connections/${category}`, { connections: updated })
    setConnections(updated)
    showToast('Bağlantı silindi')
  }

  const getCategoryLabel = () => {
    if (category === 'crm') return { title: 'CRM Entegrasyonları', sub: 'Ki Business CRM bağlantıları' }
    if (category === 'erp') return { title: 'ERP Entegrasyonları', sub: 'Ki Business ERP bağlantıları' }
    return { title: 'Muhasebe Entegrasyonları', sub: 'Ki Business muhasebe bağlantıları' }
  }

  const { title, sub } = getCategoryLabel()

  return (
    <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', backdropFilter: 'blur(20px)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}>
            <Database size={17} className="text-white" />
          </div>
          <div>
            <h2 className="font-bold" style={{ color: 'var(--text-1)' }}>{title}</h2>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>{sub}</p>
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}>
            <Plus size={15} /> Yeni Bağlantı Ekle
          </button>
        )}
      </div>

      {!isAdmin ? (
        <div className="text-center py-12" style={{ color: 'var(--text-3)' }}>
          <AlertCircle size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Bu bölümü görüntülemek için admin yetkisi gereklidir.</p>
        </div>
      ) : loading ? (
        <div className="text-center py-12" style={{ color: 'var(--text-3)' }}>Yükleniyor...</div>
      ) : connections.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">🔌</div>
          <p className="text-sm mb-4" style={{ color: 'var(--text-3)' }}>Henüz bağlantı yok.</p>
          <button onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}>
            <Plus size={14} /> İlk Bağlantıyı Ekle
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map(conn => {
            const provider = providers.find(p => p.type === conn.type)
            return (
              <div key={conn.id} className="flex items-center justify-between gap-4 p-4 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl">{provider?.emoji ?? '🔗'}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>{conn.name}</div>
                    <div className="text-xs" style={{ color: 'var(--text-3)' }}>{provider?.label ?? conn.type}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(38,166,154,0.15)', color: 'var(--accent)' }}>
                    <CheckCircle size={10} /> Bağlı
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                    {new Date(conn.createdAt).toLocaleDateString('tr-TR')}
                  </span>
                  <button onClick={() => handleDelete(conn.id)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && isAdmin && (
        <AddConnectionModal providers={providers} onSave={handleAdd} onClose={() => setShowAdd(false)} />
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PlatformSettings() {
  const { user } = useAuth()
  const isAdmin  = user?.role === 'admin'

  const [tab,         setTab]         = useState('crm')
  const [metrics,     setMetrics]     = useState<any>(null)
  const [loading,     setLoading]     = useState(true)
  const [toast,       setToast]       = useState<{ msg: string; ok: boolean } | null>(null)
  const [commConfigs, setCommConfigs] = useState<Record<string, Record<string, string> | null>>({})
  const [commLoading, setCommLoading] = useState(false)
  const [editComm,    setEditComm]    = useState<typeof COMM_CHANNELS[0] | null>(null)

  if (user?.role !== 'admin' && user?.role !== 'supervisor') {
    return <Navigate to="/app/dashboard" replace />
  }

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const metricsRes = await api.get('/admin/metrics').catch(() => null)
      if (metricsRes) setMetrics(metricsRes.data)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCommConfigs = useCallback(async () => {
    if (!isAdmin) return
    setCommLoading(true)
    const results: Record<string, Record<string, string> | null> = {}
    await Promise.all(COMM_CHANNELS.map(async ch => {
      try {
        const res = await api.get(`/admin/platform-comms/${ch.id}`)
        results[ch.id] = res.data.isSet ? res.data.config : null
      } catch {
        results[ch.id] = null
      }
    }))
    setCommConfigs(results)
    setCommLoading(false)
  }, [isAdmin])

  const saveCommConfig = async (channelId: string, data: Record<string, string>) => {
    await api.put(`/admin/platform-comms/${channelId}`, data)
    showToast('Kaydedildi')
    await loadCommConfigs()
  }

  const deleteCommConfig = async (channelId: string) => {
    await api.delete(`/admin/platform-comms/${channelId}`)
    showToast('Silindi')
    setCommConfigs(p => ({ ...p, [channelId]: null }))
  }

  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => { if (tab === 'comms') loadCommConfigs() }, [tab, loadCommConfigs])

  const card = (children: React.ReactNode, extra?: string) => (
    <div className={`rounded-2xl p-6 ${extra ?? ''}`} style={{ background: 'var(--surface)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
      {children}
    </div>
  )

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Platform Ayarları</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
            {isAdmin ? 'Tüm platform entegrasyonlarını yönetin' : 'Platform ayarlarını görüntülüyorsunuz (salt okunur)'}
          </p>
        </div>
        <button onClick={loadAll} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
          <RefreshCw size={14} /> Yenile
        </button>
      </div>

      {!isAdmin && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.20)', color: '#fbbf24' }}>
          <AlertCircle size={15} />
          Supervisor modunda görüntülüyorsunuz — düzenleme yetkisi yok
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200"
            style={tab === t.id
              ? { background: 'linear-gradient(135deg, var(--accent), var(--forest))', color: '#fff', boxShadow: '0 4px 12px rgba(38,166,154,0.25)' }
              : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-12" style={{ color: 'var(--text-3)' }}>Yükleniyor...</div>}

      {/* ── CRM Tab ── */}
      {!loading && tab === 'crm' && (
        <ConnectionListTab category="crm" providers={CRM_PROVIDERS} isAdmin={isAdmin} showToast={showToast} />
      )}

      {/* ── ERP Tab ── */}
      {!loading && tab === 'erp' && (
        <ConnectionListTab category="erp" providers={ERP_PROVIDERS} isAdmin={isAdmin} showToast={showToast} />
      )}

      {/* ── Muhasebe Tab ── */}
      {!loading && tab === 'accounting' && (
        <ConnectionListTab category="accounting" providers={ACCOUNTING_PROVIDERS} isAdmin={isAdmin} showToast={showToast} />
      )}

      {/* ── İletişim Tab ── */}
      {!loading && tab === 'comms' && (
        <div className="space-y-4">
          {commLoading && <div className="text-center py-8" style={{ color: 'var(--text-3)' }}>Yükleniyor...</div>}
          {!commLoading && COMM_CHANNELS.map(ch => {
            const cfg = commConfigs[ch.id]
            const isSet = cfg !== null && cfg !== undefined
            return (
              <div key={ch.id} className="rounded-2xl p-5" style={{ background: 'var(--surface)', backdropFilter: 'blur(20px)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: ch.color + '20', border: `1px solid ${ch.color}40` }}>
                      {ch.emoji}
                    </div>
                    <div>
                      <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>{ch.label}</h3>
                      <StatusBadge isSet={isSet} />
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditComm(ch)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-all"
                        style={{ background: isSet ? 'rgba(38,166,154,0.12)' : 'linear-gradient(135deg, var(--accent), var(--forest))', color: isSet ? 'var(--accent)' : '#fff', border: isSet ? '1px solid rgba(38,166,154,0.25)' : 'none' }}>
                        {isSet ? <><RefreshCw size={13} /> Güncelle</> : <><Plus size={13} /> Yapılandır</>}
                      </button>
                      {isSet && (
                        <button onClick={() => deleteCommConfig(ch.id)}
                          className="p-2 rounded-xl transition-colors"
                          style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {isSet && isAdmin && cfg && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {ch.fields.slice(0, 4).map(f => (
                      <div key={f.key} className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-3)' }}>{f.label}: </span>
                        <span style={{ color: 'var(--text-2)' }}>
                          {f.isSecret ? '••••••••' : (cfg[f.key] || '—')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Veritabanı Tab ── */}
      {!loading && tab === 'database' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: Server,    label: 'PostgreSQL', desc: 'Ana veritabanı',      stat: `${metrics?.metrics?.total_entities ?? 0} entity`, color: '#336791' },
            { icon: Wifi,      label: 'Redis',      desc: 'Session & cache',     stat: 'Bağlı', color: '#DC382D' },
            { icon: HardDrive, label: 'Qdrant',     desc: 'Vektör veritabanı',  stat: 'v1.9.2', color: '#FF6B35' },
          ].map(db => card(
            <div key={db.label}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: db.color + '20', border: `1px solid ${db.color}40` }}>
                  <db.icon size={18} style={{ color: db.color }} />
                </div>
                <div>
                  <div className="font-semibold" style={{ color: 'var(--text-1)' }}>{db.label}</div>
                  <div className="text-xs" style={{ color: 'var(--text-3)' }}>{db.desc}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-sm" style={{ color: 'var(--text-2)' }}>Bağlı — {db.stat}</span>
              </div>
            </div>,
            ''
          ))}
          {card(
            <div>
              <h3 className="font-semibold mb-4" style={{ color: 'var(--text-1)' }}>Platform İstatistikleri</h3>
              <div className="space-y-3">
                {[
                  { label: 'Toplam Entity',         value: metrics?.metrics?.total_entities ?? '—' },
                  { label: 'Ücretli Entity',         value: metrics?.paidEntities ?? '—' },
                  { label: 'Ücretsiz Entity',        value: metrics?.freeEntities ?? '—' },
                  { label: 'Açık Destek Talepleri',  value: metrics?.openTickets ?? '—' },
                  { label: 'CRM Bağlantıları',       value: metrics?.crmConnections ?? '—' },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between gap-2">
                    <span className="text-sm" style={{ color: 'var(--text-2)' }}>{r.label}</span>
                    <span className="font-bold text-sm" style={{ color: 'var(--accent)' }}>{String(r.value)}</span>
                  </div>
                ))}
              </div>
            </div>,
            'sm:col-span-2 lg:col-span-3'
          )}
        </div>
      )}

      {/* ── AI Modelleri Tab ── */}
      {!loading && tab === 'ai' && (
        <AiModelsTab isAdmin={isAdmin} showToast={showToast} />
      )}

      {/* ── AI Günlükleri Tab ── */}
      {!loading && tab === 'logs' && (
        <AiLogsTab />
      )}

      {/* Comm Config Modal */}
      {editComm && (
        <CommConfigModal
          channel={editComm}
          existingData={commConfigs[editComm.id] ?? null}
          onSave={data => saveCommConfig(editComm.id, data)}
          onClose={() => setEditComm(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-xl text-sm text-white shadow-xl z-50"
          style={{ background: toast.ok ? 'linear-gradient(135deg, var(--accent), var(--forest))' : '#ef4444' }}>
          {toast.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}

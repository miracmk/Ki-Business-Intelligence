import { useEffect, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import {
  Database, MessageSquare, BarChart3, Brain,
  Eye, EyeOff, Save, Trash2, RefreshCw, CheckCircle, AlertCircle,
  Server, Wifi, HardDrive, Zap, ChevronDown, ChevronRight, Plus, X,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../store/auth'

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

const MODEL_ROLE_LABELS: Record<string, string> = {
  conversation:      'Konuşma Modeli',
  db_search:         'DB Arama',
  qdrant_search:     'Vektör Arama',
  redis_search:      'Cache Arama',
  intent:            'Niyet Tespiti',
  support_intent:    'Destek Niyet',
  support_refine:    'Destek Geliştirme',
  support_resolver:  'Destek Çözüm',
  support_answering: 'Destek Yanıt',
}

const CONFIG_SCHEMA: Record<string, { label: string; category: string; isSecret: boolean; placeholder?: string }> = {
  openrouter_api_key: { label: 'OpenRouter API Key', category: 'ai', isSecret: true, placeholder: 'sk-or-v1-...' },
  openai_api_key:     { label: 'OpenAI API Key',     category: 'ai', isSecret: true, placeholder: 'sk-...' },
  anthropic_api_key:  { label: 'Anthropic API Key',  category: 'ai', isSecret: true, placeholder: 'sk-ant-...' },
  google_ai_api_key:  { label: 'Google AI API Key',  category: 'ai', isSecret: true, placeholder: 'AIza...' },
}

const TABS = [
  { id: 'crm',        label: 'CRM',          icon: Database      },
  { id: 'erp',        label: 'ERP',          icon: Server        },
  { id: 'accounting', label: 'Muhasebe',     icon: BarChart3     },
  { id: 'comms',      label: 'İletişim',     icon: MessageSquare },
  { id: 'database',   label: 'Veritabanı',   icon: HardDrive     },
  { id: 'ai',         label: 'AI Modelleri', icon: Brain         },
]

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

function ConfigField({ cfgKey, config, isAdmin, onSave, onDelete }: {
  cfgKey: string
  config: { label: string; isSecret: boolean; isSet: boolean; value: string }
  isAdmin: boolean
  onSave: (key: string, val: string) => Promise<void>
  onDelete: (key: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState('')
  const [saving, setSaving]   = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave(cfgKey, val)
    setSaving(false)
    setEditing(false)
    setVal('')
  }

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{config.label}</span>
            <StatusBadge isSet={config.isSet} />
          </div>
          <div className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-3)' }}>{cfgKey}</div>
        </div>
        {isAdmin && !editing && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => { setEditing(true); setVal('') }}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: 'rgba(38,166,154,0.12)', color: 'var(--accent)', border: '1px solid rgba(38,166,154,0.25)' }}>
              {config.isSet ? 'Güncelle' : 'Ayarla'}
            </button>
            {config.isSet && (
              <button onClick={() => onDelete(cfgKey)}
                className="text-xs px-2 py-1.5 rounded-lg transition-colors"
                style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}>
                <Trash2 size={12} />
              </button>
            )}
          </div>
        )}
      </div>
      {editing && isAdmin && (
        <div className="mt-3 flex gap-2">
          <div className="flex-1">
            {config.isSecret
              ? <SecretInput value={val} onChange={setVal} placeholder="Değeri girin..." />
              : <input type="text" value={val} onChange={e => setVal(e.target.value)} placeholder="Değeri girin..."
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--surface)', border: '1px solid var(--accent)', color: 'var(--text-1)' }} />
            }
          </div>
          <button onClick={handleSave} disabled={saving || !val}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}>
            <Save size={13} /> {saving ? '...' : 'Kaydet'}
          </button>
          <button onClick={() => { setEditing(false); setVal('') }}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
            İptal
          </button>
        </div>
      )}
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

  const [tab,            setTab]            = useState('crm')
  const [configs,        setConfigs]        = useState<Record<string, any>>({})
  const [metrics,        setMetrics]        = useState<any>(null)
  const [models,         setModels]         = useState<any[]>([])
  const [loading,        setLoading]        = useState(true)
  const [toast,          setToast]          = useState<{ msg: string; ok: boolean } | null>(null)
  const [modelPool,      setModelPool]      = useState<Array<{ id: string; name: string }>>([])
  const [poolLoading,    setPoolLoading]    = useState(false)
  const [roleEdits,      setRoleEdits]      = useState<Record<string, { primary: string; fb1: string; fb2: string }>>({})
  const [roleSaving,     setRoleSaving]     = useState<Record<string, boolean>>({})
  const [seedLoading,    setSeedLoading]    = useState(false)
  const [aiSectionOpen,  setAiSectionOpen]  = useState<Record<string, boolean>>({})
  const [commConfigs,    setCommConfigs]    = useState<Record<string, Record<string, string> | null>>({})
  const [commLoading,    setCommLoading]    = useState(false)
  const [editComm,       setEditComm]       = useState<typeof COMM_CHANNELS[0] | null>(null)

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
      const [cfgRes, metricsRes, modelsRes] = await Promise.allSettled([
        api.get('/admin/platform-settings'),
        api.get('/admin/metrics'),
        api.get('/admin/models'),
      ])
      if (cfgRes.status === 'fulfilled') {
        const map: Record<string, any> = {}
        for (const c of cfgRes.value.data.configs ?? []) map[c.key] = c
        setConfigs(map)
      }
      if (metricsRes.status === 'fulfilled') setMetrics(metricsRes.value.data)
      if (modelsRes.status === 'fulfilled') {
        const rows: any[] = modelsRes.value.data.models ?? []
        setModels(rows)
        const edits: Record<string, { primary: string; fb1: string; fb2: string }> = {}
        for (const m of rows) {
          edits[m.modelRole] = { primary: m.primaryModel ?? '', fb1: m.fallback1 ?? '', fb2: m.fallback2 ?? '' }
        }
        setRoleEdits(edits)
      }
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

  const fetchModelPool = useCallback(async (bust = false) => {
    setPoolLoading(true)
    try {
      if (bust) await api.post('/ai/openrouter-models/refresh').catch(() => {})
      const res = await api.get('/ai/openrouter-models')
      setModelPool(res.data.models ?? [])
    } catch {
      showToast('Model havuzu yüklenemedi', false)
    } finally {
      setPoolLoading(false)
    }
  }, [])

  const saveRoleConfig = async (role: string) => {
    const edit = roleEdits[role]
    if (!edit) return
    setRoleSaving(p => ({ ...p, [role]: true }))
    try {
      await api.put(`/admin/models/${role}`, { primaryModel: edit.primary || undefined, fallback1: edit.fb1 || undefined, fallback2: edit.fb2 || undefined })
      showToast(`${MODEL_ROLE_LABELS[role] ?? role} kaydedildi`)
      await loadAll()
    } catch {
      showToast('Kayıt başarısız', false)
    } finally {
      setRoleSaving(p => ({ ...p, [role]: false }))
    }
  }

  const seedDefaults = async () => {
    setSeedLoading(true)
    try {
      const res = await api.post('/admin/models/seed')
      showToast(`${res.data.seeded} varsayılan config yüklendi`)
      await loadAll()
    } catch {
      showToast('Yükleme başarısız', false)
    } finally {
      setSeedLoading(false)
    }
  }

  const handleSave = async (key: string, value: string) => {
    const schema = CONFIG_SCHEMA[key]
    if (!schema) return
    try {
      await api.put(`/admin/platform-settings/${key}`, { value, label: schema.label, category: schema.category, isSecret: schema.isSecret })
      showToast(`${schema.label} kaydedildi`)
      await loadAll()
    } catch {
      showToast('Kayıt başarısız', false)
    }
  }

  const handleDelete = async (key: string) => {
    try {
      await api.delete(`/admin/platform-settings/${key}`)
      showToast('Silindi')
      await loadAll()
    } catch {
      showToast('Silinemedi', false)
    }
  }

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
        <div className="space-y-6">
          {card(
            <>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}>
                  <Brain size={17} className="text-white" />
                </div>
                <div>
                  <h2 className="font-bold" style={{ color: 'var(--text-1)' }}>Provider API Anahtarları</h2>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>Model havuzunu genişletmek için ek provider anahtarları</p>
                </div>
              </div>
              <div className="space-y-2">
                {['openrouter_api_key', 'openai_api_key', 'anthropic_api_key', 'google_ai_api_key'].map(k => (
                  <ConfigField key={k} cfgKey={k}
                    config={{ label: CONFIG_SCHEMA[k].label, isSecret: CONFIG_SCHEMA[k].isSecret, isSet: configs[k]?.isSet ?? false, value: configs[k]?.value ?? '' }}
                    isAdmin={isAdmin} onSave={handleSave} onDelete={handleDelete} />
                ))}
              </div>
            </>
          )}

          {card(
            <>
              <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
                    <Zap size={17} className="text-white" />
                  </div>
                  <div>
                    <h2 className="font-bold" style={{ color: 'var(--text-1)' }}>OpenRouter Ücretsiz Model Havuzu</h2>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      {modelPool.length > 0 ? `${modelPool.length} ücretsiz model` : 'Model havuzu yüklenmedi'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => fetchModelPool(false)} disabled={poolLoading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-all disabled:opacity-50"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                    <RefreshCw size={12} className={poolLoading ? 'animate-spin' : ''} /> Getir
                  </button>
                  {isAdmin && (
                    <button onClick={() => fetchModelPool(true)} disabled={poolLoading}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-all disabled:opacity-50"
                      style={{ background: 'rgba(38,166,154,0.12)', color: 'var(--accent)', border: '1px solid rgba(38,166,154,0.25)' }}>
                      <RefreshCw size={12} /> Cache'i Temizle
                    </button>
                  )}
                </div>
              </div>
              {modelPool.length > 0 ? (
                <div className="max-h-48 overflow-y-auto rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  {modelPool.map(m => (
                    <div key={m.id} className="flex items-center gap-2 px-3 py-2 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                      <div className="min-w-0">
                        <div className="text-xs font-mono truncate" style={{ color: 'var(--text-1)' }}>{m.id}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>{m.name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-center py-6" style={{ color: 'var(--text-3)' }}>"Getir" butonuna basarak ücretsiz modelleri listeleyin.</p>
              )}
              <datalist id="model-pool-list">
                {modelPool.map(m => <option key={m.id} value={m.id} label={m.name} />)}
              </datalist>
            </>
          )}

          {card(
            <>
              <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}>
                    <Brain size={17} className="text-white" />
                  </div>
                  <div>
                    <h2 className="font-bold" style={{ color: 'var(--text-1)' }}>Rol Bazlı Model Atama</h2>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>Her AI rolü için primary ve fallback modellerini atayın</p>
                  </div>
                </div>
                {isAdmin && (
                  <button onClick={seedDefaults} disabled={seedLoading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all disabled:opacity-50"
                    style={{ background: 'rgba(38,166,154,0.12)', color: 'var(--accent)', border: '1px solid rgba(38,166,154,0.25)' }}>
                    <Zap size={12} /> {seedLoading ? 'Yükleniyor...' : 'Varsayılanları Yükle'}
                  </button>
                )}
              </div>
              {models.length === 0 && Object.keys(roleEdits).length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm mb-3" style={{ color: 'var(--text-3)' }}>Henüz model konfigürasyonu yok.</p>
                  {isAdmin && (
                    <button onClick={seedDefaults} disabled={seedLoading}
                      className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                      style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))', color: '#fff' }}>
                      {seedLoading ? 'Yükleniyor...' : 'Varsayılan Konfigürasyonları Yükle'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(MODEL_ROLE_LABELS).map(([role, label]) => {
                    const edit   = roleEdits[role] ?? { primary: '', fb1: '', fb2: '' }
                    const saved  = models.find((m: any) => m.modelRole === role)
                    const isOpen = aiSectionOpen[role] ?? false
                    return (
                      <div key={role} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                        <button onClick={() => setAiSectionOpen(p => ({ ...p, [role]: !p[role] }))}
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 transition-all"
                          style={{ background: 'var(--surface-2)' }}>
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{label}</span>
                            {saved?.primaryModel
                              ? <span className="text-xs font-mono truncate max-w-[180px]" style={{ color: 'var(--accent)' }}>{saved.primaryModel}</span>
                              : <span className="text-xs" style={{ color: 'var(--text-3)' }}>— seçilmedi —</span>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {saved && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>Kayıtlı</span>}
                            {isOpen ? <ChevronDown size={14} style={{ color: 'var(--text-3)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-3)' }} />}
                          </div>
                        </button>
                        {isOpen && isAdmin && (
                          <div className="px-4 pb-4 pt-3 space-y-3" style={{ background: 'var(--surface)' }}>
                            {[{ field: 'primary', label: 'Primary Model' }, { field: 'fb1', label: 'Fallback 1' }, { field: 'fb2', label: 'Fallback 2' }].map(({ field, label: fLabel }) => (
                              <div key={field}>
                                <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>{fLabel}</label>
                                <input list="model-pool-list"
                                  value={edit[field as keyof typeof edit]}
                                  onChange={e => setRoleEdits(p => ({ ...p, [role]: { ...edit, [field]: e.target.value } }))}
                                  placeholder={field === 'primary' ? 'model/id:free — zorunlu' : 'isteğe bağlı fallback'}
                                  className="w-full px-3 py-2 rounded-lg text-xs outline-none font-mono"
                                  style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }} />
                              </div>
                            ))}
                            <div className="flex justify-end">
                              <button onClick={() => saveRoleConfig(role)} disabled={roleSaving[role] || !edit.primary}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-50"
                                style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}>
                                <Save size={12} /> {roleSaving[role] ? 'Kaydediliyor...' : 'Kaydet'}
                              </button>
                            </div>
                          </div>
                        )}
                        {isOpen && !isAdmin && saved && (
                          <div className="px-4 pb-4 pt-2 space-y-1.5" style={{ background: 'var(--surface)' }}>
                            {[['Primary', saved.primaryModel], ['Fallback 1', saved.fallback1], ['Fallback 2', saved.fallback2]].filter(([, v]) => v).map(([l, v]) => (
                              <div key={l} className="flex items-center gap-2">
                                <span className="text-xs w-16 flex-shrink-0" style={{ color: 'var(--text-3)' }}>{l}</span>
                                <span className="text-xs font-mono" style={{ color: 'var(--text-1)' }}>{v}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
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

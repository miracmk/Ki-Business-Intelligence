import { useEffect, useRef, useState } from 'react'
import {
  Database, Brain, User, MessageSquare, CreditCard, Shield, Users,
  Plus, Trash2, Copy, QrCode, RefreshCw,
  AlertTriangle, CheckCircle, XCircle, X, Camera, Save,
  Mail, Phone, MapPin, Building2, ExternalLink, UserPlus, Wand2, Zap, History,
  Upload, FileText, LayoutGrid, Sparkles, FileUp, ListPlus, GitBranch, Navigation,
  ArrowUp, ArrowDown,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import { UniversalConnectorWizard } from '../components/UniversalConnectorWizard'
import { SearchableSelect } from '../components/SearchableSelect'
import { PhoneInput } from '../components/PhoneInput'
import { COUNTRIES, TR_PROVINCES, getTaxLabel } from '../lib/geoData'
import { AiProviderPanel, ENTITY_MODEL_ROLE_LABELS } from '../components/AiProviderPanel'

const VALID_TABS = new Set(['overview', 'account', 'company', 'ai', 'crm', 'accounting', 'channels', 'plan', 'security', 'navigation'])

// ─── Entity KB category taxonomy (YFZ 33) ──────────────────────────────────────

const ENTITY_KB_CATEGORIES = [
  { key: 'company_info',      label: 'Şirket Bilgisi' },
  { key: 'pricing',           label: 'Fiyatlandırma' },
  { key: 'product_info',      label: 'Ürün/Hizmet' },
  { key: 'faq',                label: 'Soru-Cevap' },
  { key: 'customer_feedback', label: 'Müşteri Geri Bildirimi' },
  { key: 'support_issue',     label: 'Destek Sorun' },
  { key: 'support_solution',  label: 'Destek Çözüm' },
  { key: 'policy',             label: 'Politika/Prosedür' },
  { key: 'other',              label: 'Diğer' },
]

// ─── Channel schemas (based on official API docs) ─────────────────────────────

interface ChannelField {
  key: string
  label: string
  type: 'text' | 'password' | 'select'
  help?: string
  options?: string[]
  placeholder?: string
}

interface ChannelSchema {
  label: string
  description: string
  emoji: string
  fields: ChannelField[]
}

const CHANNEL_SCHEMAS: Record<string, ChannelSchema> = {
  whatsapp: {
    label: 'WhatsApp Cloud API',
    description: 'Meta WhatsApp Business Platform (Cloud API)',
    emoji: '💬',
    fields: [
      { key: 'phone_number_id', label: 'Phone Number ID', type: 'text', help: 'WhatsApp Business Phone Number ID — Meta Business Suite → Business Settings → Phone Numbers' },
      { key: 'access_token', label: 'System User Access Token', type: 'password', help: 'Kalıcı sistem kullanıcı erişim token\'ı — Meta Business Suite → Business Settings → System Users' },
      { key: 'waba_id', label: 'WABA ID', type: 'text', help: 'WhatsApp Business Account ID — Meta Business Suite → Settings' },
      { key: 'app_id', label: 'Meta App ID', type: 'text', help: 'Meta for Developers → My Apps' },
      { key: 'app_secret', label: 'App Secret', type: 'password', help: 'Meta for Developers → App → Settings → Basic' },
      { key: 'verify_token', label: 'Webhook Verify Token', type: 'text', placeholder: 'ki_wa_verify_token', help: 'Webhook kurulumunda kullanılacak doğrulama değerinizi belirleyin' },
    ],
  },
  instagram: {
    label: 'Instagram Graph API',
    description: 'Meta Instagram Direct Messages entegrasyonu',
    emoji: '📸',
    fields: [
      { key: 'page_id', label: 'Facebook Page ID', type: 'text', help: 'Instagram\'a bağlı Facebook Sayfasının ID\'si — facebook.com/<page_slug>/about' },
      { key: 'access_token', label: 'Page Access Token', type: 'password', help: 'Uzun ömürlü sayfa erişim token\'ı — Meta for Developers → Graph API Explorer' },
      { key: 'ig_user_id', label: 'Instagram Business User ID', type: 'text', help: 'Instagram Business hesabının Graph API ID\'si' },
      { key: 'app_secret', label: 'App Secret', type: 'password', help: 'Meta for Developers → App → Settings → Basic' },
      { key: 'verify_token', label: 'Webhook Verify Token', type: 'text', placeholder: 'ki_ig_verify_token', help: 'Webhook kurulumunda kullanılacak doğrulama değeriniz' },
    ],
  },
  telegram: {
    label: 'Telegram Bot API',
    description: 'Telegram Bot entegrasyonu',
    emoji: '✈️',
    fields: [
      { key: 'bot_token', label: 'Bot Token', type: 'password', placeholder: '1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ', help: '@BotFather\'dan /newbot komutu ile alınan token' },
      { key: 'bot_username', label: 'Bot Username', type: 'text', placeholder: 'MyCompanyBot', help: 'Bot kullanıcı adı (@ işareti olmadan)' },
      { key: 'secret_token', label: 'Webhook Secret Token', type: 'password', help: 'Opsiyonel — Telegram webhook\'unun güvenliğini artırır (1-256 karakter alfanümerik)' },
    ],
  },
  email: {
    label: 'E-posta / SMTP',
    description: 'Giden e-posta SMTP konfigürasyonu',
    emoji: '📧',
    fields: [
      { key: 'host', label: 'SMTP Sunucusu', type: 'text', placeholder: 'smtp.gmail.com', help: 'Gmail: smtp.gmail.com | Outlook: smtp.office365.com | Yandex: smtp.yandex.com' },
      { key: 'port', label: 'Port', type: 'text', placeholder: '587', help: '465 → SSL | 587 → STARTTLS (önerilen) | 25 → Şifresiz' },
      { key: 'username', label: 'Kullanıcı Adı', type: 'text', help: 'Genellikle e-posta adresi' },
      { key: 'password', label: 'Şifre / Uygulama Şifresi', type: 'password', help: 'Gmail için: Hesap → Güvenlik → Uygulama Şifreleri' },
      { key: 'from_name', label: 'Gönderici Adı', type: 'text', placeholder: 'Ki Business Destek', help: 'Alıcıların göreceği isim' },
      { key: 'from_email', label: 'Gönderici E-posta', type: 'text', placeholder: 'destek@sirketi.com' },
      { key: 'encryption', label: 'Şifreleme', type: 'select', options: ['STARTTLS', 'SSL/TLS', 'Yok'], help: 'Port 587 → STARTTLS | Port 465 → SSL/TLS' },
    ],
  },
  voip: {
    label: 'VOIP / SIP',
    description: 'IP telefon ve çağrı merkezi entegrasyonu',
    emoji: '📞',
    fields: [
      { key: 'sip_server', label: 'SIP Sunucusu', type: 'text', placeholder: 'sip.provider.com', help: 'SIP/VOIP sağlayıcınızın sunucu adresi' },
      { key: 'sip_user', label: 'SIP Kullanıcı / Dahili', type: 'text', placeholder: '1001', help: 'SIP kullanıcı adı veya dahili numara' },
      { key: 'sip_password', label: 'SIP Şifre', type: 'password' },
      { key: 'sip_port', label: 'SIP Port', type: 'text', placeholder: '5060', help: '5060 (UDP/TCP) | 5061 (TLS)' },
      { key: 'transport', label: 'Transport Protokolü', type: 'select', options: ['UDP', 'TCP', 'TLS', 'WSS (WebRTC)'] },
      { key: 'call_api_provider', label: 'Bulut Çağrı API Sağlayıcı', type: 'select', options: ['Yok', 'Twilio', 'Vonage (Nexmo)', 'Plivo', 'Sinch', 'Amazon Connect'], help: 'Opsiyonel — REST API üzerinden çağrı başlatmak için' },
      { key: 'api_key', label: 'API Key / Account SID', type: 'text', help: 'Seçilen sağlayıcının API anahtarı' },
      { key: 'api_secret', label: 'API Secret / Auth Token', type: 'password' },
    ],
  },
  portal: {
    label: 'Portal Chat',
    description: 'Web sitenize gömülü AI chat widget',
    emoji: '💬',
    fields: [
      { key: 'widget_title', label: 'Widget Başlığı', type: 'text', placeholder: 'Destek Asistanı', help: 'Chat widget penceresinde görünen başlık' },
      { key: 'greeting', label: 'Karşılama Mesajı', type: 'text', placeholder: 'Merhaba! Size nasıl yardımcı olabilirim?', help: 'Ziyaretçiye gösterilecek ilk mesaj' },
      { key: 'primary_color', label: 'Ana Renk (HEX)', type: 'text', placeholder: '#6366f1', help: 'Widget buton ve header rengi' },
      { key: 'allowed_domains', label: 'İzin Verilen Domain\'ler', type: 'text', placeholder: 'example.com,shop.example.com', help: 'Widget\'ın çalışacağı domain\'ler (virgülle ayırın)' },
    ],
  },
}

// ─── Static data ──────────────────────────────────────────────────────────────

const CRM_GROUPS = [
  {
    group: 'CRM Sistemleri',
    types: [
      { value: 'zoho',        label: 'Zoho CRM' },
      { value: 'salesforce',  label: 'Salesforce' },
      { value: 'hubspot',     label: 'HubSpot' },
      { value: 'dynamics365', label: 'Microsoft Dynamics 365 CRM' },
      { value: 'pipedrive',   label: 'Pipedrive' },
      { value: 'freshsales',  label: 'Freshsales' },
      { value: 'monday',      label: 'Monday.com CRM' },
      { value: 'odoo',        label: 'Odoo CRM' },
      { value: 'bitrix24',    label: 'Bitrix24' },
      { value: 'sugarcrm',    label: 'SugarCRM' },
    ],
  },
  {
    group: 'ERP Sistemleri',
    types: [
      { value: 'sap',            label: 'SAP Business One / S/4HANA' },
      { value: 'oracle_netsuite', label: 'Oracle NetSuite' },
      { value: 'dynamics_bc',    label: 'MS Dynamics 365 Business Central' },
      { value: 'oracle_fusion',  label: 'Oracle Fusion Cloud ERP' },
      { value: 'odoo_erp',       label: 'Odoo ERP' },
      { value: 'erpnext',        label: 'ERPNext / Frappe' },
      { value: 'epicor',         label: 'Epicor Kinetic' },
      { value: 'infor',          label: 'Infor CloudSuite' },
      { value: 'sage_intacct',   label: 'Sage Intacct' },
      { value: 'acumatica',      label: 'Acumatica' },
    ],
  },
]

const ACCOUNTING_TYPES = [
  { value: 'quickbooks',       label: 'QuickBooks Online' },
  { value: 'xero',             label: 'Xero' },
  { value: 'zoho_books',       label: 'Zoho Books' },
  { value: 'wave',             label: 'Wave Accounting' },
  { value: 'freshbooks',       label: 'FreshBooks' },
  { value: 'sage_accounting',  label: 'Sage Business Cloud Accounting' },
  { value: 'dynamics_finance', label: 'MS Dynamics 365 Finance' },
  { value: 'iyzico',           label: 'Iyzico (TR)' },
  { value: 'parasut',          label: 'Paraşüt (TR)' },
]

function getWebhookInstructions(type: string): string {
  const map: Record<string, string> = {
    zoho:          'Zoho CRM → Kurulum → Otomasyon → Webhook → "Yeni Webhook" oluşturun',
    salesforce:    'Salesforce → Setup → Process Builder veya Outbound Messages ile kayıt yapın',
    hubspot:       'HubSpot → Ayarlar → Integrations → Private Apps → Webhooks sekmesi',
    dynamics365:   'Power Automate → Dataverse connector → Row added/modified/deleted trigger',
    pipedrive:     'Pipedrive → Tools & Integrations → Developer Hub → Webhooks → Add Webhook',
    freshsales:    'Freshsales → Admin → Automations → Webhooks bölümünden yeni webhook ekleyin',
    monday:        'Monday.com → Admin Center → API → Webhooks',
    odoo:          'Odoo → Teknik → Otomasyon → Automated Actions → HTTP Action türünü seçin',
    odoo_erp:      'Odoo → Teknik → Otomasyon → Automated Actions → HTTP Action türünü seçin',
    bitrix24:      'Bitrix24 → Developer Resources → Outbound Webhooks',
    sugarcrm:      'SugarCRM → Admin → Sugar Logic Hooks → Yeni HTTP Hook ekleyin',
    sap:           'SAP Event Mesh → Namespace → HTTP Subscriptions bölümünden kayıt yapın',
    oracle_netsuite: 'NetSuite → Setup → Company → SuiteScript → User Event Scripts',
    dynamics_bc:   'Business Central → Administration → API/Webhook Subscriptions',
    oracle_fusion: 'Oracle Integration Cloud → Integrations → Webhook endpoint',
    erpnext:       'ERPNext → Ayarlar → Webhook → Yeni Webhook (HMAC-SHA256 imzalı)',
    epicor:        'Epicor → System Setup → BAQ + REST Method bağlayın',
    infor:         'Infor ION API → Document Flows → Webhook endpoint tanımlayın',
    sage_intacct:  'Sage Intacct → Company → Platform Services → Webhook konfigürasyonu',
    acumatica:     'Acumatica → System → Integration → Push Notifications → Add Destination',
    quickbooks:    'QuickBooks Online → My Account → Manage Subscriptions → Webhooks',
    xero:          'Xero Developer → My Apps → Webhooks sekmesi',
    zoho_books:    'Zoho Books → Ayarlar → Otomasyon → Webhook → Yeni Webhook',
    wave:          'Wave → Settings → Developer → Webhooks',
    freshbooks:    'FreshBooks → Connect → Developer Portal → Webhooks',
    sage_accounting: 'Sage Accounting → Services → Developer → API → Webhook Config',
    dynamics_finance: 'Dynamics 365 Finance → System Administration → Business Events → Endpoints',
    iyzico:        'Iyzico Merchant Portal → Settings → Notification URL alanına yapıştırın',
    parasut:       'Paraşüt → Ayarlar → Uygulama → Webhooks → Yeni Webhook',
  }
  return map[type] ?? `${type} admin panelinden webhook URL'nizi kaydedin`
}

function crmTypeLabel(type: string): string {
  for (const g of CRM_GROUPS) {
    const found = g.types.find(t => t.value === type)
    if (found) return found.label
  }
  return type
}

function crmBadgeClass(type: string): string {
  const colors: Record<string, string> = {
    zoho:          'bg-orange-900/30 text-orange-400',
    salesforce:    'bg-blue-900/30 text-blue-400',
    hubspot:       'bg-orange-900/30 text-orange-300',
    dynamics365:   'bg-blue-900/30 text-blue-300',
    dynamics_bc:   'bg-blue-900/30 text-blue-300',
    oracle_netsuite: 'bg-purple-900/30 text-purple-400',
    oracle_fusion: 'bg-purple-900/30 text-purple-300',
    sap:           'bg-sky-900/30 text-sky-400',
    erpnext:       'bg-green-900/30 text-green-400',
    pipedrive:     'bg-green-900/30 text-green-300',
    freshsales:    'bg-teal-900/30 text-teal-400',
    monday:        'bg-pink-900/30 text-pink-400',
    bitrix24:      'bg-indigo-900/30 text-indigo-400',
    sugarcrm:      'bg-yellow-900/30 text-yellow-400',
    odoo:          'bg-red-900/30 text-red-400',
    odoo_erp:      'bg-red-900/30 text-red-400',
    epicor:        'bg-cyan-900/30 text-cyan-400',
    infor:         'bg-violet-900/30 text-violet-400',
    sage_intacct:  'bg-lime-900/30 text-lime-400',
    acumatica:     'bg-amber-900/30 text-amber-400',
  }
  return colors[type] ?? 'bg-gray-900/30 text-gray-400'
}

const inputCls = 'w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm'

// ─── Credential form components ───────────────────────────────────────────────

function CredentialForm({
  crmType,
  creds,
  onChange,
}: {
  crmType: string
  creds: Record<string, string>
  onChange: (c: Record<string, string>) => void
}) {
  const set = (key: string, val: string) => onChange({ ...creds, [key]: val })

  const f = (label: string, key: string, t: 'text' | 'password' = 'text', placeholder?: string) => (
    <div key={key}>
      <label className="text-gray-400 text-sm mb-1 block">{label}</label>
      <input
        type={t}
        value={creds[key] ?? ''}
        onChange={e => set(key, e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    </div>
  )

  const sel = (label: string, key: string, opts: { v: string; l: string }[]) => (
    <div key={key}>
      <label className="text-gray-400 text-sm mb-1 block">{label}</label>
      <select
        value={creds[key] ?? opts[0]?.v ?? ''}
        onChange={e => set(key, e.target.value)}
        className={inputCls}
      >
        {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  )

  const toggle = (key: string, a: { v: string; l: string }, b: { v: string; l: string }) => (
    <div key={`toggle_${key}`} className="flex gap-2">
      {[a, b].map(opt => (
        <button
          key={opt.v}
          type="button"
          onClick={() => set(key, opt.v)}
          className={`flex-1 py-1.5 rounded text-sm font-medium border transition-colors ${
            (creds[key] ?? a.v) === opt.v
              ? 'border-[#6366f1] bg-[#6366f1]/20 text-[#a5b4fc]'
              : 'border-[#2a2a2a] text-gray-400 hover:border-[#3a3a3a]'
          }`}
        >
          {opt.l}
        </button>
      ))}
    </div>
  )

  const mode = creds['authMode']

  switch (crmType) {
    case 'zoho':
      return <>
        {f('Client ID', 'clientId')}
        {f('Client Secret', 'clientSecret', 'password')}
        {f('Refresh Token', 'refreshToken', 'password')}
        {sel('Bölge', 'region', [
          { v: 'com',    l: 'ABD/Küresel (com)' },
          { v: 'eu',     l: 'Avrupa (eu)' },
          { v: 'in',     l: 'Hindistan (in)' },
          { v: 'com.au', l: 'Avustralya (com.au)' },
        ])}
      </>

    case 'salesforce':
      return <>
        {f('Instance URL', 'instanceUrl', 'text', 'https://mycompany.salesforce.com')}
        {f('Client ID', 'clientId')}
        {f('Client Secret', 'clientSecret', 'password')}
        {f('Refresh Token', 'refreshToken', 'password')}
      </>

    case 'hubspot':
      return <>
        {toggle('authMode', { v: 'private_app', l: 'Private App Token' }, { v: 'oauth', l: 'OAuth 2.0' })}
        {(mode ?? 'private_app') === 'private_app'
          ? f('Access Token', 'accessToken', 'password')
          : <>{f('Client ID', 'clientId')}{f('Client Secret', 'clientSecret', 'password')}{f('Refresh Token', 'refreshToken', 'password')}</>
        }
      </>

    case 'dynamics365':
      return <>
        {f('Tenant ID', 'tenantId')}
        {f('Client ID', 'clientId')}
        {f('Client Secret', 'clientSecret', 'password')}
        {f('Resource URL', 'resourceUrl', 'text', 'https://org.crm4.dynamics.com')}
      </>

    case 'pipedrive':
      return <>
        {toggle('authMode', { v: 'api_token', l: 'API Token' }, { v: 'oauth', l: 'OAuth 2.0' })}
        {(mode ?? 'api_token') === 'api_token'
          ? f('API Token', 'apiToken', 'password')
          : <>{f('Client ID', 'clientId')}{f('Client Secret', 'clientSecret', 'password')}{f('Refresh Token', 'refreshToken', 'password')}</>
        }
      </>

    case 'freshsales':
      return <>
        {f('Domain', 'domain', 'text', 'mycompany.freshsales.io')}
        {f('API Key', 'apiKey', 'password')}
      </>

    case 'monday':
      return <>{f('API Token', 'apiToken', 'password')}</>

    case 'odoo':
    case 'odoo_erp':
      return <>
        {f('Base URL', 'baseUrl', 'text', 'https://mycompany.odoo.com')}
        {f('Database', 'database')}
        {f('API Key', 'apiKey', 'password')}
      </>

    case 'bitrix24':
      return <>
        {toggle('authMode', { v: 'webhook_url', l: 'Webhook URL' }, { v: 'oauth', l: 'OAuth 2.0' })}
        {(mode ?? 'webhook_url') === 'webhook_url'
          ? f('Webhook URL', 'webhookUrl', 'text', 'https://mycompany.bitrix24.com/rest/1/abc...')
          : <>
              {f('Domain', 'domain', 'text', 'mycompany.bitrix24.com')}
              {f('Client ID', 'clientId')}
              {f('Client Secret', 'clientSecret', 'password')}
              {f('Refresh Token', 'refreshToken', 'password')}
            </>
        }
      </>

    case 'sugarcrm':
      return <>
        {f('Base URL', 'baseUrl', 'text', 'https://mycompany.sugarondemand.com')}
        {f('Client ID', 'clientId')}
        {f('Client Secret', 'clientSecret', 'password')}
        {f('Username', 'username')}
        {f('Password', 'password', 'password')}
      </>

    case 'sap':
      return <>
        {toggle('authMode', { v: 'basic', l: 'Basic Auth' }, { v: 'oauth', l: 'OAuth 2.0' })}
        {(mode ?? 'basic') === 'basic'
          ? <>
              {f('Server URL', 'serverUrl', 'text', 'https://myserver:50000')}
              {f('Username', 'username')}
              {f('Password', 'password', 'password')}
              {f('Company DB', 'companyDb')}
            </>
          : <>
              {f('Client ID', 'clientId')}
              {f('Client Secret', 'clientSecret', 'password')}
              {f('Token URL', 'tokenUrl')}
              {f('API Base URL', 'apiBase')}
            </>
        }
      </>

    case 'oracle_netsuite':
      return <>
        {f('Account ID', 'accountId', 'text', '1234567')}
        {f('Consumer Key', 'consumerKey')}
        {f('Consumer Secret', 'consumerSecret', 'password')}
        {f('Token ID', 'tokenId')}
        {f('Token Secret', 'tokenSecret', 'password')}
      </>

    case 'dynamics_bc':
      return <>
        {f('Tenant ID', 'tenantId')}
        {f('Client ID', 'clientId')}
        {f('Client Secret', 'clientSecret', 'password')}
        {f('Environment Name', 'environmentName', 'text', 'production')}
      </>

    case 'oracle_fusion':
      return <>
        {f('Client ID', 'clientId')}
        {f('Client Secret', 'clientSecret', 'password')}
        {f('Token URL', 'tokenUrl')}
        {f('Base URL', 'baseUrl', 'text', 'https://yourhost.oraclecloud.com')}
      </>

    case 'erpnext':
      return <>
        {f('Base URL', 'baseUrl', 'text', 'https://mycompany.erpnext.com')}
        {f('API Key', 'apiKey')}
        {f('API Secret', 'apiSecret', 'password')}
      </>

    case 'epicor':
      return <>
        {f('Base URL', 'baseUrl', 'text', 'https://myserver/epicor')}
        {f('Username', 'username')}
        {f('Password', 'password', 'password')}
        {f('Company', 'company', 'text', 'EPIC06')}
      </>

    case 'infor':
      return <>
        {f('Tenant ID', 'tenantId')}
        {f('Client ID', 'clientId')}
        {f('Client Secret', 'clientSecret', 'password')}
        {f('Environment', 'environment', 'text', 'PRD')}
      </>

    case 'sage_intacct':
      return <>
        {f('Sender ID', 'senderId')}
        {f('Sender Password', 'senderPassword', 'password')}
        {f('User ID', 'userId')}
        {f('User Password', 'userPassword', 'password')}
        {f('Company ID', 'companyId')}
      </>

    case 'acumatica':
      return <>
        {f('Base URL', 'baseUrl', 'text', 'https://mycompany.acumatica.com')}
        {f('Client ID', 'clientId')}
        {f('Client Secret', 'clientSecret', 'password')}
        {f('Username', 'username')}
        {f('Password', 'password', 'password')}
      </>

    default:
      return <div className="text-gray-500 text-sm">Bu entegrasyon için form tanımlanmadı. JSON girin:</div>
  }
}

function AccountingCredentialForm({
  accountingType,
  creds,
  onChange,
}: {
  accountingType: string
  creds: Record<string, string>
  onChange: (c: Record<string, string>) => void
}) {
  const set = (key: string, val: string) => onChange({ ...creds, [key]: val })

  const f = (label: string, key: string, t: 'text' | 'password' = 'text', placeholder?: string) => (
    <div key={key}>
      <label className="text-gray-400 text-sm mb-1 block">{label}</label>
      <input
        type={t}
        value={creds[key] ?? ''}
        onChange={e => set(key, e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    </div>
  )

  const sel = (label: string, key: string, opts: { v: string; l: string }[]) => (
    <div key={key}>
      <label className="text-gray-400 text-sm mb-1 block">{label}</label>
      <select
        value={creds[key] ?? opts[0]?.v ?? ''}
        onChange={e => set(key, e.target.value)}
        className={inputCls}
      >
        {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  )

  switch (accountingType) {
    case 'quickbooks':
      return <>
        {f('Client ID', 'clientId')}
        {f('Client Secret', 'clientSecret', 'password')}
        {f('Refresh Token', 'refreshToken', 'password')}
        {f('Realm ID (Company ID)', 'realmId')}
      </>

    case 'xero':
      return <>
        {f('Client ID', 'clientId')}
        {f('Client Secret', 'clientSecret', 'password')}
        {f('Refresh Token', 'refreshToken', 'password')}
        {f('Tenant ID', 'tenantId')}
      </>

    case 'zoho_books':
      return <>
        {f('Client ID', 'clientId')}
        {f('Client Secret', 'clientSecret', 'password')}
        {f('Refresh Token', 'refreshToken', 'password')}
        {f('Organization ID', 'organizationId')}
        {sel('Bölge', 'region', [
          { v: 'com',    l: 'ABD/Küresel (com)' },
          { v: 'eu',     l: 'Avrupa (eu)' },
          { v: 'in',     l: 'Hindistan (in)' },
          { v: 'com.au', l: 'Avustralya (com.au)' },
        ])}
      </>

    case 'wave':
      return <>{f('Access Token', 'accessToken', 'password')}</>

    case 'freshbooks':
      return <>
        {f('Client ID', 'clientId')}
        {f('Client Secret', 'clientSecret', 'password')}
        {f('Refresh Token', 'refreshToken', 'password')}
      </>

    case 'sage_accounting':
      return <>
        {f('Client ID', 'clientId')}
        {f('Client Secret', 'clientSecret', 'password')}
        {f('Refresh Token', 'refreshToken', 'password')}
        {f('Subscription Key', 'subscriptionKey')}
      </>

    case 'dynamics_finance':
      return <>
        {f('Tenant ID', 'tenantId')}
        {f('Client ID', 'clientId')}
        {f('Client Secret', 'clientSecret', 'password')}
        {f('Base URL', 'baseUrl', 'text', 'https://mycompany.operations.dynamics.com')}
      </>

    case 'iyzico':
      return <>
        {f('API Key', 'apiKey')}
        {f('Secret Key', 'secretKey', 'password')}
        {sel('Ortam', 'env', [
          { v: 'production', l: 'Canlı (api.iyzipay.com)' },
          { v: 'sandbox',    l: 'Test (sandbox-api.iyzipay.com)' },
        ])}
      </>

    case 'parasut':
      return <>
        {f('Client ID', 'clientId')}
        {f('Client Secret', 'clientSecret', 'password')}
        {f('Refresh Token', 'refreshToken', 'password')}
        {f('Company ID', 'companyId')}
      </>

    default:
      return <div className="text-gray-500 text-sm">Bu entegrasyon için form tanımlanmadı.</div>
  }
}

// ─── Test status badge ────────────────────────────────────────────────────────
type TestStatus = 'idle' | 'testing' | 'ok' | 'error'

function TestBadge({ status, error }: { status: TestStatus; error: string }) {
  if (status === 'idle') return null
  if (status === 'testing') return (
    <span className="flex items-center gap-1.5 text-gray-400 text-sm">
      <RefreshCw size={14} className="animate-spin" /> Test ediliyor…
    </span>
  )
  if (status === 'ok') return (
    <span className="flex items-center gap-1.5 px-2 py-1 bg-green-900/30 text-green-400 rounded text-sm">
      <CheckCircle size={14} /> Bağlantı Başarılı
    </span>
  )
  return (
    <span className="flex items-center gap-1.5 px-2 py-1 bg-red-900/30 text-red-400 rounded text-sm max-w-xs truncate" title={error}>
      <XCircle size={14} /> {error || 'Bağlantı Başarısız'}
    </span>
  )
}

// ─── Support Agent Panel ──────────────────────────────────────────────────────
function SupportAgentPanel() {
  const [agents, setAgents] = useState<any[]>([])
  const [form, setForm] = useState({
    channelPreference: 'email',
    waPhone: '', telegramChatId: '', notificationEmail: '', weight: 1,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.get('/support/agents').then(r => {
      setAgents(r.data.agents ?? [])
    }).catch(() => {})
  }, [])

  const register = async () => {
    setSaving(true)
    try {
      await api.post('/support/agents', form)
      const r = await api.get('/support/agents')
      setAgents(r.data.agents ?? [])
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { /* non-fatal */ } finally {
      setSaving(false)
    }
  }

  const updateWeight = async (agentId: string, weight: number) => {
    await api.put(`/support/agents/${agentId}/weight`, { weight }).catch(() => {})
    const r = await api.get('/support/agents')
    setAgents(r.data.agents ?? [])
  }

  return (
    <div className="p-5 rounded-2xl space-y-4" style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)' }}>
      <div>
        <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Destek Agent Ayarları</h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
          Harici kanallardan (WA/TG/IG/Email) gelen biletler round-robin ile agent'lara dağıtılır.
        </p>
      </div>

      {/* Registration form */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>Bildirim Kanalı Tercihi</label>
          <select value={form.channelPreference} onChange={e => setForm(f => ({ ...f, channelPreference: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: 'var(--surface-modal)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
            <option value="email">E-posta</option>
            <option value="telegram">Telegram</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
        {form.channelPreference === 'whatsapp' && (
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>WA Telefon (E.164)</label>
            <input value={form.waPhone} onChange={e => setForm(f => ({ ...f, waPhone: e.target.value }))}
              placeholder="+905551234567"
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={{ background: 'var(--surface-modal)', color: 'var(--text-1)', border: '1px solid var(--border)' }} />
          </div>
        )}
        {form.channelPreference === 'telegram' && (
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>Telegram Chat ID</label>
            <input value={form.telegramChatId} onChange={e => setForm(f => ({ ...f, telegramChatId: e.target.value }))}
              placeholder="123456789"
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={{ background: 'var(--surface-modal)', color: 'var(--text-1)', border: '1px solid var(--border)' }} />
          </div>
        )}
        {form.channelPreference === 'email' && (
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>Bildirim E-postası</label>
            <input type="email" value={form.notificationEmail} onChange={e => setForm(f => ({ ...f, notificationEmail: e.target.value }))}
              placeholder="agent@sirket.com"
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={{ background: 'var(--surface-modal)', color: 'var(--text-1)', border: '1px solid var(--border)' }} />
          </div>
        )}
        <div className="sm:col-span-2 flex justify-end">
          <button onClick={register} disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
            style={{ background: 'rgba(38,166,154,0.85)', color: '#fff' }}>
            {saved ? '✓ Kaydedildi' : saving ? 'Kaydediliyor…' : 'Destek Agent Olarak Kayıt / Güncelle'}
          </button>
        </div>
      </div>

      {/* Agent list */}
      {agents.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="px-4 py-2 text-xs font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
            AKTİF DESTEK AGENT'LARI ({agents.filter(a => a.isActive).length})
          </div>
          {agents.map((a: any) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{ background: 'rgba(38,166,154,0.15)', color: 'var(--accent)' }}>
                {(a.userName ?? a.userEmail ?? '?')[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{a.userName || a.userEmail}</p>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                  {a.channelPreference === 'telegram' ? `✈️ TG: ${a.telegramChatId || '—'}` :
                   a.channelPreference === 'whatsapp' ? `💬 WA: ${a.waPhone || '—'}` :
                   `📧 ${a.notificationEmail || a.userEmail || '—'}`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>Ağırlık</span>
                <select value={a.weight} onChange={e => updateWeight(a.id, Number(e.target.value))}
                  className="text-xs px-2 py-1 rounded-lg outline-none"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                  {[1,2,3,4,5,6,7,8,9,10].map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${a.isActive ? 'text-green-400' : 'text-gray-400'}`}
                  style={{ background: a.isActive ? 'rgba(34,197,94,0.1)' : 'var(--surface-2)' }}>
                  {a.isActive ? 'Aktif' : 'Pasif'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Settings() {
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [saveMsg, setSaveMsg] = useState<string>('')

  const [tenant, setTenant] = useState<any>(null)
  const [userRole, setUserRole] = useState<string>('')
  const [currentUserPerms, setCurrentUserPerms] = useState<Record<string, boolean>>({})
  const [accountSettings, setAccountSettings] = useState<{
    language: string; timezone: string; dateFormat: string; timeFormat: '24h' | '12h'
    businessHours: Record<string, { open: string; close: string; closed: boolean }>
  }>({
    language: 'tr', timezone: 'Europe/Istanbul', dateFormat: 'DD.MM.YYYY', timeFormat: '24h',
    businessHours: {},
  })
  const [crmConnections, setCrmConnections] = useState<any[]>([])
  const [accountingConnections, setAccountingConnections] = useState<any[]>([])

  // Profile state
  const [profile, setProfile] = useState({ name: '', email: '', phone: '', address: '', avatar: '' })
  const [companyName, setCompanyName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Channel state
  const [channelConfigs, setChannelConfigs] = useState<Record<string, any>>({})
  const [showChannelModal, setShowChannelModal] = useState(false)
  const [editingChannel, setEditingChannel] = useState<string | null>(null)
  const [channelForm, setChannelForm] = useState<Record<string, string>>({})
  const [savingChannel, setSavingChannel] = useState(false)

  // Email SMTP+IMAP dedicated state
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailConfig, setEmailConfig] = useState({
    fromName: '', fromEmail: '',
    smtpHost: '', smtpPort: '587', smtpSecure: false, smtpUser: '', smtpPassword: '',
    imapHost: '', imapPort: '993', imapSecure: true, imapUser: '', imapPassword: '',
    inboxFolder: 'INBOX', checkIntervalMinutes: 5, autoReply: false,
    hasSmtpPassword: false, hasImapPassword: false,
  })
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailTestStatus, setEmailTestStatus] = useState<Record<string, 'idle'|'testing'|'ok'|'error'>>({ smtp: 'idle', imap: 'idle' })
  const [emailTestMsg, setEmailTestMsg] = useState<Record<string, string>>({ smtp: '', imap: '' })

  // Team state
  const [teamMembers, setTeamMembers]   = useState<any[]>([])
  const [inviteEmail, setInviteEmail]   = useState('')
  const [inviteRole,  setInviteRole]    = useState('entity_sub')
  const [inviting,    setInviting]      = useState(false)
  const [inviteMsg,   setInviteMsg]     = useState('')

  // Vector docs
  const [vectorDocs,        setVectorDocs]        = useState<any[]>([])
  const [loadingVectorDocs, setLoadingVectorDocs] = useState(false)
  const [showAddDoc,        setShowAddDoc]        = useState(false)
  const [newDocTitle,       setNewDocTitle]       = useState('')
  const [newDocContent,     setNewDocContent]     = useState('')
  const [savingDoc,         setSavingDoc]         = useState(false)

  // KB documents (file upload, chunked + hash-diff indexed)
  const [kbDocs,        setKbDocs]        = useState<any[]>([])
  const [loadingKbDocs, setLoadingKbDocs] = useState(false)
  const [kbCategory,    setKbCategory]    = useState('company_info')
  const [kbFile,        setKbFile]        = useState<File | null>(null)
  const [uploadingKb,   setUploadingKb]   = useState(false)

  const [showCrmModal, setShowCrmModal] = useState(false)
  const [showCrmWizard, setShowCrmWizard] = useState(false)
  const [expandedConnId, setExpandedConnId] = useState<string | null>(null)
  const [connSyncHistory, setConnSyncHistory] = useState<Record<string, any[]>>({})
  const [connEntityData, setConnEntityData] = useState<Record<string, any>>({})
  const [showAccountingModal, setShowAccountingModal] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)
  const [qrData, setQrData] = useState<string>('')
  const [totpCode, setTotpCode] = useState('')

  // CRM form state
  const [newCrm, setNewCrm] = useState({ name: '', crmType: 'zoho', credentials: {} as Record<string, string> })
  const [crmTestStatus, setCrmTestStatus] = useState<TestStatus>('idle')
  const [crmTestError, setCrmTestError] = useState('')

  // Accounting form state
  const [newAccounting, setNewAccounting] = useState({ name: '', accountingType: 'quickbooks', credentials: {} as Record<string, string> })
  const [accTestStatus, setAccTestStatus] = useState<TestStatus>('idle')
  const [accTestError, setAccTestError] = useState('')

  // Webhook setup modal
  const [webhookSetup, setWebhookSetup] = useState<{ url: string; instructions: string; name: string; type: string } | null>(null)

  // CRM OAuth modal
  const [showOAuthModal, setShowOAuthModal]     = useState(false)
  const [oauthProvider, setOauthProvider]       = useState<'zoho'|'hubspot'|'salesforce'>('zoho')
  const [oauthForm, setOauthForm]               = useState({ name: '', clientId: '', clientSecret: '', region: 'com' })
  const [oauthLoading, setOauthLoading]         = useState(false)
  const [oauthMsg, setOauthMsg]                 = useState('')

  // Accounting OAuth modal
  const [showAccOAuthModal, setShowAccOAuthModal]   = useState(false)
  const [accOAuthProvider, setAccOAuthProvider]     = useState<'zoho_books'|'quickbooks'|'xero'>('zoho_books')
  const [accOAuthForm, setAccOAuthForm]             = useState({ name: '', clientId: '', clientSecret: '', region: 'com', organizationId: '' })
  const [accOAuthLoading, setAccOAuthLoading]       = useState(false)
  const [accOAuthMsg, setAccOAuthMsg]               = useState('')

  // DB connection modal
  const [showDbModal, setShowDbModal]           = useState(false)
  const [_dbTarget, setDbTarget]                = useState<'crm'|'accounting'>('crm')
  const [dbForm, setDbForm]                     = useState({ name: '', host: '', port: '5432', database: '', username: '', password: '', ssl: false })
  const [dbTesting, setDbTesting]               = useState(false)
  const [dbTestResult, setDbTestResult]         = useState<{ ok: boolean; isReadOnly?: boolean; tables?: string[]; error?: string } | null>(null)
  const [dbSaving, setDbSaving]                 = useState(false)

  const [planUsage, setPlanUsage]               = useState<any>(null)
  const [allPlans, setAllPlans]                 = useState<any[]>([])
  const [planLoading, setPlanLoading]           = useState(false)

  const [webhookTestStatus, setWebhookTestStatus] = useState<Record<string, 'idle'|'testing'|'ok'|'error'>>({})
  const [msgTemplates, setMsgTemplates]           = useState<Record<string, string>>({})

  // Business profile state
  const [businessProfile, setBusinessProfile] = useState({
    sector: '', employee_count: '', annual_revenue: '', address: '', country: '',
    city: '', postal_code: '',
    tax_number: '', registration_number: '', founded_date: '', logo_url: '', fiscal_year_start: '',
  })
  const [savingBp, setSavingBp] = useState(false)

  // Channel identifiers state
  const [channelIds, setChannelIds] = useState({
    whatsapp_phones: [] as string[], instagram_handles: [] as string[],
    telegram_ids: [] as string[], email_domains: [] as string[],
  })
  const [savingChannelIds, setSavingChannelIds] = useState(false)
  const [channelIdInput, setChannelIdInput] = useState({ whatsapp_phones: '', instagram_handles: '', telegram_ids: '', email_domains: '' })

  const showSuccess = (msg: string) => { setSaveMsg(msg); setTimeout(() => setSaveMsg(''), 3000) }

  const loadData = async () => {
    try {
      setLoading(true)
      const [tenantRes, crmRes, accountingRes, permsRes] = await Promise.all([
        api.get('/tenants/me'),
        api.get('/crm/connections'),
        api.get('/accounting/connections'),
        api.get('/tenants/me/permissions').catch(() => ({ data: { permissions: {} } })),
      ])
      setTenant(tenantRes.data)
      setUserRole(tenantRes.data.role ?? '')
      setCurrentUserPerms(permsRes.data.permissions ?? {})
      setAccountSettings({
        language: tenantRes.data.tenant?.settings?.language ?? 'tr',
        timezone: tenantRes.data.tenant?.settings?.timezone ?? 'Europe/Istanbul',
        dateFormat: tenantRes.data.tenant?.settings?.dateFormat ?? 'DD.MM.YYYY',
        timeFormat: tenantRes.data.tenant?.settings?.timeFormat ?? '24h',
        businessHours: tenantRes.data.tenant?.settings?.businessHours ?? {},
      })
      setProfile({
        name:    tenantRes.data.profile?.name    ?? '',
        email:   tenantRes.data.profile?.email   ?? '',
        phone:   tenantRes.data.profile?.phone   ?? '',
        address: tenantRes.data.profile?.address ?? '',
        avatar:  tenantRes.data.profile?.avatar  ?? '',
      })
      setCompanyName(tenantRes.data.tenant?.name ?? '')
      setCrmConnections(crmRes.data.connections ?? [])
      setAccountingConnections(accountingRes.data.connections ?? [])
    } catch (e: any) {
      setError(e.response?.data?.error || 'Veriler yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  const loadBusinessProfile = async () => {
    try {
      const [bpRes, chRes] = await Promise.all([
        api.get('/tenants/me/business-profile'),
        api.get('/tenants/me/channel-ids'),
      ])
      const bp = bpRes.data.profile ?? {}
      setBusinessProfile(prev => ({ ...prev, ...bp }))
      const ch = chRes.data.channelIds ?? {}
      setChannelIds({
        whatsapp_phones:   ch.whatsapp_phones   ?? [],
        instagram_handles: ch.instagram_handles ?? [],
        telegram_ids:      ch.telegram_ids      ?? [],
        email_domains:     ch.email_domains     ?? [],
      })
    } catch { /* non-fatal */ }
  }

  const loadChannelConfigs = async () => {
    const channels = ['whatsapp', 'instagram', 'telegram', 'email', 'voip']
    const results: Record<string, any> = {}
    await Promise.all(channels.map(async ch => {
      try {
        const r = await api.get(`/tenants/channels/${ch}`)
        if (r.data.config) results[ch] = r.data.config
      } catch { /* ignore */ }
    }))
    setChannelConfigs(results)
  }

  const loadVectorDocs = async () => {
    setLoadingVectorDocs(true)
    try {
      const res = await api.get('/tenants/vector-docs')
      setVectorDocs(res.data.docs ?? [])
    } catch { /* ignore */ } finally {
      setLoadingVectorDocs(false)
    }
  }

  const saveVectorDoc = async () => {
    if (!newDocTitle.trim() || !newDocContent.trim()) return
    setSavingDoc(true)
    try {
      await api.post('/tenants/vector-docs', { title: newDocTitle.trim(), content: newDocContent.trim() })
      showSuccess('Doküman eklendi ve vektöre indexlendi')
      setNewDocTitle('')
      setNewDocContent('')
      setShowAddDoc(false)
      await loadVectorDocs()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Kaydedilemedi')
    } finally {
      setSavingDoc(false)
    }
  }

  const deleteVectorDoc = async (id: string) => {
    try {
      await api.delete(`/tenants/vector-docs/${id}`)
      showSuccess('Doküman silindi')
      await loadVectorDocs()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Silinemedi')
    }
  }

  const loadKbDocuments = async () => {
    setLoadingKbDocs(true)
    try {
      const res = await api.get('/tenants/kb-documents')
      setKbDocs(res.data.docs ?? [])
    } catch { /* ignore */ } finally {
      setLoadingKbDocs(false)
    }
  }

  const uploadKbDocument = async () => {
    if (!kbFile) return
    setUploadingKb(true)
    try {
      const formData = new FormData()
      formData.append('category', kbCategory)
      formData.append('file', kbFile)
      const res = await api.post('/tenants/kb-documents', formData)
      showSuccess(`Doküman indexlendi — ${res.data.added ?? 0} yeni, ${res.data.unchanged ?? 0} değişmeyen, ${res.data.removed ?? 0} kaldırılan chunk`)
      setKbFile(null)
      await loadKbDocuments()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Doküman yüklenemedi')
    } finally {
      setUploadingKb(false)
    }
  }

  const deleteKbDocument = async (id: string) => {
    try {
      await api.delete(`/tenants/kb-documents/${id}`)
      showSuccess('Doküman silindi')
      await loadKbDocuments()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Silinemedi')
    }
  }

  useEffect(() => {
    loadData()
    // Handle OAuth callback redirect
    const params = new URLSearchParams(window.location.search)
    const tabParam = params.get('tab')
    if (tabParam && VALID_TABS.has(tabParam)) setActiveTab(tabParam)
    if (params.get('oauth_success')) {
      const provider = params.get('provider') ?? 'OAuth'
      showSuccess(`${provider} bağlantısı başarıyla eklendi!`)
      window.history.replaceState({}, '', `/app/settings?tab=${tabParam ?? 'crm'}`)
    }
    if (params.get('oauth_error')) {
      setError(`OAuth hatası: ${params.get('oauth_error')}`)
      window.history.replaceState({}, '', `/app/settings?tab=${tabParam ?? 'crm'}`)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'ai') {
      loadVectorDocs()
      loadKbDocuments()
      if (!planUsage) {
        api.get('/tenants/plan').then(r => setPlanUsage(r.data)).catch(() => {})
      }
    }
    if (activeTab === 'company') {
      loadBusinessProfile()
      api.get('/tenants/me/members').then(r => setTeamMembers(r.data.members ?? [])).catch(() => {})
    }
    if (activeTab === 'channels') {
      loadChannelConfigs()
      api.get('/tenants/me').then(r => {
        const tpl = r.data.tenant?.settings?.messageTemplates ?? {}
        setMsgTemplates(tpl)
      }).catch(() => {})
    }
    if (activeTab === 'plan') {
      setPlanLoading(true)
      Promise.all([
        api.get('/tenants/plan').catch(() => ({ data: null })),
        api.get('/tenants/plans').catch(() => ({ data: [] })),
      ]).then(([usageRes, plansRes]) => {
        setPlanUsage(usageRes.data)
        setAllPlans(Array.isArray(plansRes.data) ? plansRes.data : [])
      }).finally(() => setPlanLoading(false))
    }
    if (activeTab === 'navigation') loadNavCatalog()
  }, [activeTab])

  const saveAccountSettings = async () => {
    try {
      await api.put('/tenants/me/settings', accountSettings)
      showSuccess('Bölgesel ayarlar kaydedildi.')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Kaydedilemedi')
    }
  }

  const DAYS: { key: string; label: string }[] = [
    { key: 'mon', label: 'Pazartesi' }, { key: 'tue', label: 'Salı' }, { key: 'wed', label: 'Çarşamba' },
    { key: 'thu', label: 'Perşembe' }, { key: 'fri', label: 'Cuma' }, { key: 'sat', label: 'Cumartesi' }, { key: 'sun', label: 'Pazar' },
  ]
  const setBusinessHour = (day: string, patch: Partial<{ open: string; close: string; closed: boolean }>) => {
    const current = accountSettings.businessHours[day] ?? { open: '09:00', close: '18:00', closed: false }
    setAccountSettings({ ...accountSettings, businessHours: { ...accountSettings.businessHours, [day]: { ...current, ...patch } } })
  }

  // ── Navigasyon tab — admin UI over GET/PUT /nav-config (FAZ: KiBI WebApp redesign) ──
  interface NavAdminItem {
    key: string; group: string; label: string; icon: string; kind: string
    defaultRoles: string[] | null; position: number; isVisible: boolean; allowedRoles: string[] | null
  }
  const ENTITY_ROLES = [
    { key: 'entity_main', label: 'Yönetici' },
    { key: 'entity_supervisor', label: 'Denetçi' },
    { key: 'entity_sub', label: 'Alt Kullanıcı' },
  ]
  const [navGroupsAdmin, setNavGroupsAdmin] = useState<{ key: string; label: string }[]>([])
  const [navItems, setNavItems] = useState<NavAdminItem[]>([])
  const [navLoading, setNavLoading] = useState(false)

  const loadNavCatalog = async () => {
    setNavLoading(true)
    try {
      const r = await api.get('/nav-config/catalog')
      setNavGroupsAdmin(r.data.groups ?? [])
      setNavItems([...(r.data.items ?? [])].sort((a, b) => a.position - b.position))
    } catch (e: any) {
      setError(e.response?.data?.error || 'Navigasyon ayarları yüklenemedi')
    }
    setNavLoading(false)
  }

  const persistNavItems = async (items: NavAdminItem[]) => {
    try {
      await api.put('/nav-config', { items: items.map(i => ({ itemKey: i.key, position: i.position, isVisible: i.isVisible, allowedRoles: i.allowedRoles })) })
    } catch (e: any) {
      setError(e.response?.data?.error || 'Navigasyon ayarı kaydedilemedi')
    }
  }

  const toggleNavVisible = (key: string) => {
    const next = navItems.map(i => i.key === key ? { ...i, isVisible: !i.isVisible } : i)
    setNavItems(next)
    persistNavItems(next)
  }

  const toggleNavRole = (key: string, role: string) => {
    const next = navItems.map(i => {
      if (i.key !== key) return i
      const current = i.allowedRoles ?? ENTITY_ROLES.map(r => r.key)
      const updated = current.includes(role) ? current.filter(r => r !== role) : [...current, role]
      return { ...i, allowedRoles: updated }
    })
    setNavItems(next)
    persistNavItems(next)
  }

  const moveNavItem = (groupKey: string, index: number, direction: -1 | 1) => {
    const groupItems = navItems.filter(i => i.group === groupKey)
    const target = index + direction
    if (target < 0 || target >= groupItems.length) return
    const a = groupItems[index], b = groupItems[target]
    const next = navItems.map(i => i.key === a.key ? { ...i, position: b.position } : i.key === b.key ? { ...i, position: a.position } : i)
    setNavItems(next)
    persistNavItems(next)
  }

  const saveProfile = async () => {
    setSavingProfile(true)
    try {
      await api.put('/tenants/me/profile', { name: profile.name, phone: profile.phone, address: profile.address, avatar: profile.avatar })
      showSuccess('Profil kaydedildi.')
      loadData()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Profil kaydedilemedi')
    } finally {
      setSavingProfile(false)
    }
  }

  const saveCompanyName = async () => {
    try {
      await api.put('/tenants/me/company', { name: companyName })
      showSuccess('Şirket adı güncellendi.')
      loadData()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Şirket adı değiştirilemedi')
    }
  }

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return
    setInviting(true); setInviteMsg('')
    try {
      const r = await api.post('/tenants/me/invites', { email: inviteEmail.trim(), role: inviteRole })
      setInviteMsg(r.data.added ? 'Kullanıcı eklendi.' : 'Davet gönderildi.')
      setInviteEmail('')
      api.get('/tenants/me/members').then(r2 => setTeamMembers(r2.data.members ?? [])).catch(() => {})
    } catch (e: any) {
      setInviteMsg(e.response?.data?.error || 'Davet gönderilemedi')
    } finally {
      setInviting(false)
      setTimeout(() => setInviteMsg(''), 3000)
    }
  }

  const startOAuth = async () => {
    if (!oauthForm.name || !oauthForm.clientId || !oauthForm.clientSecret) {
      setOauthMsg('Tüm alanlar zorunlu'); return
    }
    setOauthLoading(true); setOauthMsg('')
    try {
      const r = await api.post('/crm/oauth/start', {
        provider: oauthProvider,
        name: oauthForm.name,
        clientId: oauthForm.clientId,
        clientSecret: oauthForm.clientSecret,
        ...(oauthProvider === 'zoho' ? { region: oauthForm.region } : {}),
      })
      const popup = window.open(r.data.authUrl, 'oauth_popup', 'width=600,height=700,scrollbars=yes')
      if (!popup) { setOauthMsg("Popup engellendi. Lutfen popup'lara izin verin."); return }
      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer)
          loadData()
          setShowOAuthModal(false)
          setOauthLoading(false)
        }
      }, 500)
    } catch (e: any) {
      setOauthMsg(e.response?.data?.error || 'OAuth başlatılamadı')
      setOauthLoading(false)
    }
  }

  const startAccOAuth = async () => {
    if (!accOAuthForm.name || !accOAuthForm.clientId || !accOAuthForm.clientSecret) {
      setAccOAuthMsg('Tüm alanlar zorunlu'); return
    }
    setAccOAuthLoading(true); setAccOAuthMsg('')
    try {
      const r = await api.post('/accounting/oauth/start', {
        provider: accOAuthProvider,
        name: accOAuthForm.name,
        clientId: accOAuthForm.clientId,
        clientSecret: accOAuthForm.clientSecret,
        ...(accOAuthProvider === 'zoho_books' ? { region: accOAuthForm.region, organizationId: accOAuthForm.organizationId } : {}),
      })
      const popup = window.open(r.data.authUrl, 'acc_oauth_popup', 'width=600,height=700,scrollbars=yes')
      if (!popup) { setAccOAuthMsg("Popup engellendi. Lütfen popup'lara izin verin."); setAccOAuthLoading(false); return }
      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer)
          loadData()
          setShowAccOAuthModal(false)
          setAccOAuthLoading(false)
        }
      }, 500)
    } catch (e: any) {
      setAccOAuthMsg(e.response?.data?.error || 'OAuth başlatılamadı')
      setAccOAuthLoading(false)
    }
  }

  const testDbConnection = async () => {
    setDbTesting(true); setDbTestResult(null)
    try {
      const r = await api.post('/crm/db-test', {
        host: dbForm.host, port: Number(dbForm.port),
        database: dbForm.database, username: dbForm.username,
        password: dbForm.password, ssl: dbForm.ssl,
      })
      setDbTestResult(r.data)
    } catch (e: any) {
      setDbTestResult({ ok: false, error: e.response?.data?.error || 'Bağlantı başarısız' })
    } finally {
      setDbTesting(false)
    }
  }

  const saveDbConnection = async () => {
    if (!dbForm.name || !dbForm.host || !dbForm.database || !dbForm.username) {
      setDbTestResult({ ok: false, error: 'Ad, host, database ve kullanıcı zorunlu' }); return
    }
    setDbSaving(true)
    try {
      await api.post('/crm/db-connect', {
        name: dbForm.name, host: dbForm.host, port: Number(dbForm.port),
        database: dbForm.database, username: dbForm.username,
        password: dbForm.password, ssl: dbForm.ssl,
      })
      setShowDbModal(false)
      setDbForm({ name: '', host: '', port: '5432', database: '', username: '', password: '', ssl: false })
      setDbTestResult(null)
      loadData()
      showSuccess('Veritabanı bağlantısı eklendi.')
    } catch (e: any) {
      setDbTestResult({ ok: false, error: e.response?.data?.error || 'Kaydedilemedi' })
    } finally {
      setDbSaving(false)
    }
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 1024 * 1024) { setError('Fotoğraf 1MB\'dan küçük olmalıdır.'); return }
    const reader = new FileReader()
    reader.onload = ev => setProfile(p => ({ ...p, avatar: ev.target?.result as string }))
    reader.readAsDataURL(file)
  }

  const openChannelModal = async (channelKey: string) => {
    if (channelKey === 'email') {
      // Load dedicated email config
      try {
        const r = await api.get('/tenants/email-config')
        const c = r.data.config
        if (c) {
          setEmailConfig({
            fromName: c.fromName ?? '', fromEmail: c.fromEmail ?? '',
            smtpHost: c.smtp?.host ?? '', smtpPort: String(c.smtp?.port ?? '587'),
            smtpSecure: c.smtp?.secure ?? false, smtpUser: c.smtp?.user ?? '',
            smtpPassword: '', hasSmtpPassword: c.smtp?.hasPassword ?? false,
            imapHost: c.imap?.host ?? '', imapPort: String(c.imap?.port ?? '993'),
            imapSecure: c.imap?.secure ?? true, imapUser: c.imap?.user ?? '',
            imapPassword: '', hasImapPassword: c.imap?.hasPassword ?? false,
            inboxFolder: c.imap?.inboxFolder ?? 'INBOX',
            checkIntervalMinutes: c.imap?.checkIntervalMinutes ?? 5,
            autoReply: c.imap?.autoReply ?? false,
          })
        }
      } catch { /* use defaults */ }
      setEmailTestStatus({ smtp: 'idle', imap: 'idle' })
      setEmailTestMsg({ smtp: '', imap: '' })
      setShowEmailModal(true)
      return
    }
    setEditingChannel(channelKey)
    setChannelForm(channelConfigs[channelKey] ?? {})
    setShowChannelModal(true)
  }

  const testSmtp = async () => {
    setEmailTestStatus(s => ({ ...s, smtp: 'testing' }))
    try {
      await api.post('/tenants/channels/email/test-smtp', {
        host: emailConfig.smtpHost, port: Number(emailConfig.smtpPort),
        secure: emailConfig.smtpSecure, user: emailConfig.smtpUser,
        password: emailConfig.smtpPassword,
      })
      setEmailTestStatus(s => ({ ...s, smtp: 'ok' }))
      setEmailTestMsg(s => ({ ...s, smtp: 'Bağlantı başarılı ✓' }))
    } catch (e: any) {
      setEmailTestStatus(s => ({ ...s, smtp: 'error' }))
      setEmailTestMsg(s => ({ ...s, smtp: e.response?.data?.error ?? 'Bağlantı hatası' }))
    }
  }

  const testImap = async () => {
    setEmailTestStatus(s => ({ ...s, imap: 'testing' }))
    try {
      const r = await api.post('/tenants/channels/email/test-imap', {
        host: emailConfig.imapHost, port: Number(emailConfig.imapPort),
        secure: emailConfig.imapSecure, user: emailConfig.imapUser,
        password: emailConfig.imapPassword,
      })
      setEmailTestStatus(s => ({ ...s, imap: 'ok' }))
      setEmailTestMsg(s => ({ ...s, imap: `Bağlantı başarılı ✓ (${r.data.folders?.slice(0,3).join(', ')})` }))
    } catch (e: any) {
      setEmailTestStatus(s => ({ ...s, imap: 'error' }))
      setEmailTestMsg(s => ({ ...s, imap: e.response?.data?.error ?? 'Bağlantı hatası' }))
    }
  }

  const saveEmailConfig = async () => {
    setSavingEmail(true)
    try {
      await api.put('/tenants/email-config', {
        fromName: emailConfig.fromName, fromEmail: emailConfig.fromEmail,
        smtp: {
          host: emailConfig.smtpHost, port: Number(emailConfig.smtpPort),
          secure: emailConfig.smtpSecure, user: emailConfig.smtpUser,
          ...(emailConfig.smtpPassword ? { password: emailConfig.smtpPassword } : {}),
        },
        imap: {
          host: emailConfig.imapHost, port: Number(emailConfig.imapPort),
          secure: emailConfig.imapSecure, user: emailConfig.imapUser,
          ...(emailConfig.imapPassword ? { password: emailConfig.imapPassword } : {}),
          inboxFolder: emailConfig.inboxFolder,
          checkIntervalMinutes: emailConfig.checkIntervalMinutes,
          autoReply: emailConfig.autoReply,
        },
      })
      setShowEmailModal(false)
      showSuccess('E-posta konfigürasyonu kaydedildi.')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Kaydedilemedi')
    } finally {
      setSavingEmail(false)
    }
  }

  const saveChannelConfig = async () => {
    if (!editingChannel) return
    setSavingChannel(true)
    try {
      await api.put(`/tenants/channels/${editingChannel}`, channelForm)
      setChannelConfigs(prev => ({ ...prev, [editingChannel]: channelForm }))
      setShowChannelModal(false)
      showSuccess(`${CHANNEL_SCHEMAS[editingChannel]?.label} konfigürasyonu kaydedildi.`)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Kaydedilemedi')
    } finally {
      setSavingChannel(false)
    }
  }

  const deleteChannelConfig = async (channelKey: string) => {
    if (!confirm('Bu kanalın konfigürasyonunu silmek istediğinizden emin misiniz?')) return
    try {
      await api.delete(`/tenants/channels/${channelKey}`)
      setChannelConfigs(prev => { const next = { ...prev }; delete next[channelKey]; return next })
      showSuccess('Kanal konfigürasyonu silindi.')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Silinemedi')
    }
  }

  const testCrm = async () => {
    setCrmTestStatus('testing')
    setCrmTestError('')
    try {
      const res = await api.post('/crm/connections/test', {
        crmType: newCrm.crmType,
        credentials: newCrm.credentials,
      })
      if (res.data.ok) {
        setCrmTestStatus('ok')
      } else {
        setCrmTestStatus('error')
        setCrmTestError(res.data.error ?? 'Bağlantı testi başarısız')
      }
    } catch (e: any) {
      setCrmTestStatus('error')
      setCrmTestError(e.response?.data?.error || 'Bağlantı testi başarısız')
    }
  }

  const addCrm = async () => {
    try {
      const res = await api.post('/crm/connections', { ...newCrm })
      setShowCrmModal(false)
      setNewCrm({ name: '', crmType: 'zoho', credentials: {} })
      setCrmTestStatus('idle')
      setCrmTestError('')
      if (res.data.webhookSetupUrl) {
        setWebhookSetup({
          url:          res.data.webhookSetupUrl,
          instructions: res.data.webhookInstructions ?? getWebhookInstructions(newCrm.crmType),
          name:         newCrm.name,
          type:         newCrm.crmType,
        })
      }
      loadData()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Bağlantı eklenemedi')
    }
  }

  const deleteCrm = async (id: string) => {
    if (confirm('Silmek istediğinizden emin misiniz?')) {
      try {
        await api.delete(`/crm/connections/${id}`)
        loadData()
      } catch (e: any) {
        setError(e.response?.data?.error || 'Silinemedi')
      }
    }
  }

  const metadataSync = async (id: string) => {
    try {
      await api.post(`/crm/connections/${id}/sync/metadata`)
      alert('Metadata sync başlatıldı!')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Sync başlatılamadı')
    }
  }

  const testAccounting = async () => {
    setAccTestStatus('testing')
    setAccTestError('')
    try {
      const res = await api.post('/accounting/connections/test', {
        accountingType: newAccounting.accountingType,
        credentials:    newAccounting.credentials,
      })
      if (res.data.ok) {
        setAccTestStatus('ok')
      } else {
        setAccTestStatus('error')
        setAccTestError(res.data.error ?? 'Bağlantı testi başarısız')
      }
    } catch (e: any) {
      setAccTestStatus('error')
      setAccTestError(e.response?.data?.error || 'Bağlantı testi başarısız')
    }
  }

  const addAccounting = async () => {
    try {
      const res = await api.post('/accounting/connections', { ...newAccounting })
      setShowAccountingModal(false)
      setNewAccounting({ name: '', accountingType: 'quickbooks', credentials: {} })
      setAccTestStatus('idle')
      setAccTestError('')
      if (res.data.webhookSetupUrl) {
        setWebhookSetup({
          url:          res.data.webhookSetupUrl,
          instructions: res.data.webhookInstructions ?? getWebhookInstructions(newAccounting.accountingType),
          name:         newAccounting.name,
          type:         newAccounting.accountingType,
        })
      }
      loadData()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Bağlantı eklenemedi')
    }
  }

  const deleteAccounting = async (id: string) => {
    if (confirm('Silmek istediğinizden emin misiniz?')) {
      try {
        await api.delete(`/accounting/connections/${id}`)
        loadData()
      } catch (e: any) {
        setError(e.response?.data?.error || 'Silinemedi')
      }
    }
  }

  const setupTotp = async () => {
    try {
      const res = await api.post('/auth/totp/setup')
      setQrData(res.data.qrCode)
      setShowQrModal(true)
    } catch (e: any) {
      setError(e.response?.data?.error || 'TOTP kurulamadı')
    }
  }

  const confirmTotp = async () => {
    try {
      await api.post('/auth/totp/confirm', { code: totpCode })
      setShowQrModal(false)
      loadData()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Doğrulama kodu hatalı')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Kopyalandı!')
  }

  const isAuthorizedSupervisor = userRole === 'entity_supervisor' && currentUserPerms.manageCompanyProfile === true
  const canManageCompanyProfile = userRole === 'entity_main' || isAuthorizedSupervisor || userRole === 'admin' || userRole === 'supervisor'

  const tabs = [
    { id: 'overview',   label: 'Genel Bakış',        icon: LayoutGrid },
    { id: 'account',    label: 'Hesap',             icon: User },
    { id: 'company',    label: 'Şirket Profili',    icon: Building2 },
    { id: 'ai',         label: 'AI Modeli',          icon: Brain },
    { id: 'crm',        label: 'CRM / ERP',          icon: Database },
    { id: 'accounting', label: 'Muhasebe',           icon: CreditCard },
    { id: 'channels',   label: 'Kanallar',           icon: MessageSquare },
    { id: 'plan',       label: 'Plan & Kullanım',    icon: Zap },
    { id: 'security',   label: '2FA & Güvenlik',     icon: Shield },
    { id: 'navigation', label: 'Navigasyon',         icon: Navigation },
  ]

  const OVERVIEW_CATEGORIES: { icon: any; title: string; items: { label: string; tab?: string; to?: string }[] }[] = [
    { icon: User, title: 'Hesap & Ekip', items: [
      { label: 'Hesap Bilgileri', tab: 'account' },
      { label: 'Şirket Profili & Marka', tab: 'company' },
      { label: 'Ekip Üyeleri & Davetler', tab: 'company' },
      { label: '2FA & Güvenlik', tab: 'security' },
    ] },
    { icon: Sparkles, title: 'AI & Zeka', items: [
      { label: 'AI Modeli', tab: 'ai' },
      { label: 'KIBI AI', to: '/app/chat' },
      { label: 'Entity AI', to: '/app/entity-ai' },
      { label: 'AI Onayları', to: '/app/ai-actions' },
    ] },
    { icon: Database, title: 'Entegrasyonlar', items: [
      { label: 'CRM / ERP Bağlayıcıları', tab: 'crm' },
      { label: 'Muhasebe Bağlayıcıları', tab: 'accounting' },
      { label: 'İletişim Kanalları', tab: 'channels' },
    ] },
    { icon: FileUp, title: 'Veri Yönetimi', items: [
      { label: 'İçe Aktarma', to: '/app/import' },
      { label: 'Sektörel Şablonlar', to: '/app/onboarding' },
      { label: 'Dosyalar', to: '/app/files' },
    ] },
    { icon: ListPlus, title: 'Özelleştirme', items: [
      { label: 'Alan Yöneticisi (Custom Fields)', to: '/app/field-manager' },
      { label: 'Navigasyon Düzeni', tab: 'navigation' },
    ] },
    { icon: GitBranch, title: 'Otomasyon', items: [
      { label: 'Blueprint (İş Akışları)', to: '/app/blueprint' },
      { label: 'Fonksiyonlar', to: '/app/functions' },
    ] },
    { icon: Zap, title: 'Plan & Faturalama', items: [
      { label: 'Plan & Kullanım', tab: 'plan' },
      { label: 'Ki Wallet', to: '/app/wallet' },
    ] },
  ]

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-8 bg-[#111111] rounded w-64 mb-6 animate-pulse"></div>
        <div className="h-32 bg-[#111111] rounded animate-pulse"></div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-8">Ayarlar</h1>

      {saveMsg && (
        <div className="mb-4 p-3 bg-green-900/30 border border-green-800 rounded-lg text-green-400 flex items-center gap-2">
          <CheckCircle size={16} /> {saveMsg}
        </div>
      )}
      {error && (
        <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-200"><X size={16} /></button>
        </div>
      )}

      <div className="flex gap-2 mb-6 border-b border-[#2a2a2a]">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-[#6366f1] text-[#6366f1]'
                : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Overview tab — category grid linking to every entity-level setting, whether it's
          a tab in this page or a dedicated route elsewhere (Field Manager, Functions,
          Blueprint, Import, Onboarding, AI chat surfaces, Ki Wallet). ── */}
      {activeTab === 'overview' && (
        <div className="space-y-2">
          <p className="text-sm mb-4" style={{ color: 'var(--text-3)' }}>
            Bu işletmeye ait tüm ayarlar — AI yapılandırması, içe/dışa aktarım, entegrasyonlar,
            özel alanlar, otomasyon ve ekip yönetimi tek bir yerden.
          </p>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {OVERVIEW_CATEGORIES.map((cat, i) => (
              <div key={i} className="rounded-2xl p-5"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(38,166,154,0.12)' }}>
                    <cat.icon size={17} style={{ color: 'var(--accent)' }} />
                  </div>
                  <span className="font-heading font-bold text-sm" style={{ color: 'var(--text-1)' }}>{cat.title}</span>
                </div>
                <div className="space-y-1">
                  {cat.items.map((item, j) => item.to ? (
                    <Link key={j} to={item.to} className="block text-sm py-1.5" style={{ color: 'var(--accent)' }}>
                      {item.label}
                    </Link>
                  ) : (
                    <button key={j} onClick={() => setActiveTab(item.tab!)}
                      className="block w-full text-left text-sm py-1.5" style={{ color: 'var(--accent)' }}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Account tab ── */}
      {activeTab === 'account' && (
        <div className="space-y-6">
          {/* Profile card */}
          <div className="p-6 bg-[#111111] rounded-xl border border-[#2a2a2a]">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2"><User size={18} /> Profil Bilgileri</h3>
            <div className="flex items-start gap-6 mb-6">
              {/* Avatar */}
              <div className="flex-shrink-0 text-center">
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden cursor-pointer border-2 border-dashed border-[#3a3a3a] hover:border-[#6366f1] transition-colors relative"
                  onClick={() => avatarInputRef.current?.click()}
                  style={!profile.avatar ? { background: 'linear-gradient(135deg, var(--accent), var(--forest))' } : {}}
                >
                  {profile.avatar
                    ? <img src={profile.avatar} alt="Avatar" className="w-full h-full object-cover" />
                    : <span className="text-white text-2xl font-bold">{(profile.name || 'U').charAt(0).toUpperCase()}</span>
                  }
                  <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                    <Camera size={18} className="text-white" />
                  </div>
                </div>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                <p className="text-gray-600 text-[10px] mt-1.5">Maks 1MB</p>
              </div>
              {/* Role + status */}
              <div className="flex-1 pt-1">
                <p className="text-gray-500 text-xs mb-2">Rol</p>
                <div className="flex flex-wrap gap-2">
                  {userRole === 'admin'              && <span className="px-3 py-1 bg-red-900/30 text-red-400 rounded-full text-sm font-medium">Sistem Yöneticisi</span>}
                  {userRole === 'supervisor'          && <span className="px-3 py-1 bg-orange-900/30 text-orange-400 rounded-full text-sm font-medium">Platform Denetçisi</span>}
                  {userRole === 'entity_main'         && <span className="px-3 py-1 bg-teal-900/30 text-teal-400 rounded-full text-sm font-medium">Entity Ana Yetkili</span>}
                  {userRole === 'entity_supervisor'   && <span className="px-3 py-1 bg-blue-900/30 text-blue-400 rounded-full text-sm font-medium">Entity Denetçisi</span>}
                  {userRole === 'entity_sub'          && <span className="px-3 py-1 bg-gray-900/30 text-gray-400 rounded-full text-sm font-medium">Entity Kullanıcısı</span>}
                  {!userRole                         && <span className="px-3 py-1 bg-gray-900/30 text-gray-400 rounded-full text-sm font-medium">Bilinmiyor</span>}
                </div>
                {(userRole === 'entity_supervisor' || userRole === 'entity_sub') && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-green-400 text-xs">Yetkilendirilmiş — Aktif</span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
              <div>
                <label className="text-gray-400 text-sm mb-1 block flex items-center gap-1.5"><User size={11} /> Ad Soyad</label>
                <input value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm" placeholder="Adınız Soyadınız" />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block flex items-center gap-1.5"><Mail size={11} /> E-posta</label>
                <input value={profile.email} disabled
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-gray-500 text-sm cursor-not-allowed" />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block flex items-center gap-1.5"><Phone size={11} /> Telefon</label>
                <PhoneInput value={profile.phone} onChange={phone => setProfile(p => ({ ...p, phone }))} />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block flex items-center gap-1.5"><MapPin size={11} /> Adres</label>
                <input value={profile.address} onChange={e => setProfile(p => ({ ...p, address: e.target.value }))}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm" placeholder="Adresiniz" />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-5">
              <button onClick={saveProfile} disabled={savingProfile}
                className="flex items-center gap-2 px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm disabled:opacity-50">
                <Save size={14} /> {savingProfile ? 'Kaydediliyor...' : 'Profili Kaydet'}
              </button>
            </div>
          </div>

          {/* Company card — show when tenant exists */}
          {tenant?.tenant && (
            <div className="p-6 bg-[#111111] rounded-xl border border-[#2a2a2a]">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Building2 size={18} /> Şirket Bilgileri</h3>
              <div className="max-w-md space-y-4">
                <div>
                  <label className="text-gray-400 text-sm mb-1 block">Şirket Adı</label>
                  {(userRole === 'entity_main' || userRole === 'admin') ? (
                    <div className="flex gap-2">
                      <input value={companyName} onChange={e => setCompanyName(e.target.value)}
                        className="flex-1 px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm" />
                      <button onClick={saveCompanyName}
                        className="px-3 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm">Kaydet</button>
                    </div>
                  ) : (
                    <input value={companyName} disabled
                      className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-gray-500 text-sm cursor-not-allowed" />
                  )}
                  {userRole === 'entity_main' && (
                    <p className="text-gray-600 text-xs mt-1">Entity AI asistan adı otomatik güncellenir.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Language & timezone */}
          <div className="p-6 bg-[#111111] rounded-xl border border-[#2a2a2a]">
            <h3 className="text-lg font-semibold text-white mb-4">Dil & Zaman Dilimi</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Dil</label>
                <select value={accountSettings.language} onChange={e => setAccountSettings({ ...accountSettings, language: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm">
                  <option value="tr">Türkçe</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Zaman Dilimi</label>
                <select value={accountSettings.timezone} onChange={e => setAccountSettings({ ...accountSettings, timezone: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm">
                  <option value="Europe/Istanbul">Europe/Istanbul (UTC+3)</option>
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York (UTC-5)</option>
                  <option value="Europe/London">Europe/London (UTC+0)</option>
                  <option value="Asia/Dubai">Asia/Dubai (UTC+4)</option>
                  <option value="Europe/Berlin">Europe/Berlin (UTC+1)</option>
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Tarih Biçimi</label>
                <select value={accountSettings.dateFormat} onChange={e => setAccountSettings({ ...accountSettings, dateFormat: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm">
                  <option value="DD.MM.YYYY">31.12.2026</option>
                  <option value="MM/DD/YYYY">12/31/2026</option>
                  <option value="YYYY-MM-DD">2026-12-31</option>
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Saat Biçimi</label>
                <select value={accountSettings.timeFormat} onChange={e => setAccountSettings({ ...accountSettings, timeFormat: e.target.value as '24h' | '12h' })}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm">
                  <option value="24h">24 saat (18:00)</option>
                  <option value="12h">12 saat (6:00 PM)</option>
                </select>
              </div>
            </div>
            <button onClick={saveAccountSettings} className="mt-4 px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm">Kaydet</button>
          </div>

          {/* Business hours */}
          <div className="p-6 bg-[#111111] rounded-xl border border-[#2a2a2a]">
            <h3 className="text-lg font-semibold text-white mb-1">Çalışma Saatleri</h3>
            <p className="text-gray-500 text-xs mb-4">Portal/AI yanıtlarında "şu an açık mıyız" gibi sorular için kullanılır.</p>
            <div className="space-y-2 max-w-2xl">
              {DAYS.map(d => {
                const h = accountSettings.businessHours[d.key] ?? { open: '09:00', close: '18:00', closed: true }
                return (
                  <div key={d.key} className="flex items-center gap-3">
                    <span className="text-gray-300 text-sm w-24 flex-shrink-0">{d.label}</span>
                    <label className="flex items-center gap-1.5 text-xs text-gray-400">
                      <input type="checkbox" checked={!h.closed} onChange={e => setBusinessHour(d.key, { closed: !e.target.checked })} />
                      Açık
                    </label>
                    <input type="time" value={h.open} disabled={h.closed} onChange={e => setBusinessHour(d.key, { open: e.target.value })}
                      className="px-2 py-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm disabled:opacity-40" />
                    <span className="text-gray-500 text-xs">—</span>
                    <input type="time" value={h.close} disabled={h.closed} onChange={e => setBusinessHour(d.key, { close: e.target.value })}
                      className="px-2 py-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm disabled:opacity-40" />
                  </div>
                )
              })}
            </div>
            <button onClick={saveAccountSettings} className="mt-4 px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm">Kaydet</button>
          </div>
        </div>
      )}

      {/* ── Company Profile tab ── */}
      {activeTab === 'company' && (
        <div className="space-y-6">
          {/* Business profile card */}
          <div className="p-6 bg-[#111111] rounded-xl border border-[#2a2a2a]">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2"><Building2 size={18} /> Şirket Profili</h3>
            <p className="text-sm text-gray-400 mb-6">Bu bilgiler Entity AI ve KIBI AI tarafından konuşma başında şirketinizi tanımak için kullanılır.</p>
            {!canManageCompanyProfile && (
              <div className="mb-4 px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.20)', color: '#fbbf24' }}>
                Bu bölümü sadece Entity Ana Yetkilisi veya yetkilendirilmiş bir Süpervizör düzenleyebilir. Bilgiler salt okunur gösteriliyor.
              </div>
            )}
            <fieldset disabled={!canManageCompanyProfile} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: 'sector',              label: 'Sektör',                    placeholder: 'Yazılım / Teknoloji' },
                { key: 'employee_count',       label: 'Çalışan Sayısı',            placeholder: '50' },
                { key: 'annual_revenue',       label: 'Son Yıl Cirosu',            placeholder: '5.000.000 TL' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="text-gray-400 text-sm mb-1 block">{label}</label>
                  <input
                    className={inputCls}
                    value={(businessProfile as any)[key]}
                    placeholder={placeholder}
                    onChange={e => setBusinessProfile(prev => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}

              <div>
                <label className="text-gray-400 text-sm mb-1 block">Kuruluş Ülkesi</label>
                <SearchableSelect
                  disabled={!canManageCompanyProfile}
                  options={COUNTRIES.map(c => ({ value: c.code, label: c.name }))}
                  value={businessProfile.country}
                  onChange={code => setBusinessProfile(prev => ({ ...prev, country: code }))}
                  placeholder="Ülke seçiniz"
                />
              </div>

              {(() => { const taxLabel = getTaxLabel(businessProfile.country); return (
                <div>
                  <label className="text-gray-400 text-sm mb-1 block">{taxLabel.label}</label>
                  <input
                    className={inputCls}
                    value={businessProfile.tax_number}
                    placeholder={taxLabel.placeholder}
                    onChange={e => setBusinessProfile(prev => ({ ...prev, tax_number: e.target.value }))}
                  />
                </div>
              ) })()}

              {[
                { key: 'registration_number',  label: 'Ticaret Sicil No',          placeholder: 'TR-12345' },
                { key: 'founded_date',         label: 'Kuruluş Tarihi',            placeholder: '2015-03-01' },
                { key: 'fiscal_year_start',    label: 'Mali Yıl Başlangıcı',       placeholder: 'Ocak' },
                { key: 'logo_url',             label: 'Logo URL',                  placeholder: 'https://...' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="text-gray-400 text-sm mb-1 block">{label}</label>
                  <input
                    className={inputCls}
                    value={(businessProfile as any)[key]}
                    placeholder={placeholder}
                    onChange={e => setBusinessProfile(prev => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}

              <div className="md:col-span-2">
                <label className="text-gray-400 text-sm mb-1 block">Adres</label>
                <input
                  className={inputCls}
                  value={businessProfile.address}
                  placeholder="Örn: Levent Mahallesi, Büyükdere Caddesi No:1"
                  onChange={e => setBusinessProfile(prev => ({ ...prev, address: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-1 block">Şehir / İl</label>
                {businessProfile.country === 'TR' ? (
                  <SearchableSelect
                    disabled={!canManageCompanyProfile}
                    options={TR_PROVINCES.map(p => ({ value: p, label: p }))}
                    value={businessProfile.city}
                    onChange={city => setBusinessProfile(prev => ({ ...prev, city }))}
                    placeholder="İl seçiniz"
                  />
                ) : (
                  <input
                    className={inputCls}
                    value={businessProfile.city}
                    placeholder="Şehir"
                    onChange={e => setBusinessProfile(prev => ({ ...prev, city: e.target.value }))}
                  />
                )}
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-1 block">Posta Kodu</label>
                <input
                  className={inputCls}
                  value={businessProfile.postal_code}
                  placeholder="34000"
                  onChange={e => setBusinessProfile(prev => ({ ...prev, postal_code: e.target.value }))}
                />
              </div>
            </fieldset>
            {canManageCompanyProfile && (
            <button
              onClick={async () => {
                setSavingBp(true)
                try {
                  await api.put('/tenants/me/business-profile', businessProfile)
                  showSuccess('Şirket profili kaydedildi.')
                } catch (e: any) {
                  setError(e.response?.data?.error || 'Kaydedilemedi')
                } finally { setSavingBp(false) }
              }}
              disabled={savingBp}
              className="mt-6 px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
            >
              <Save size={14} />{savingBp ? 'Kaydediliyor...' : 'Profili Kaydet'}
            </button>
            )}
          </div>

          {/* Channel identifiers card */}
          <div className="p-6 bg-[#111111] rounded-xl border border-[#2a2a2a]">
            <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2"><MessageSquare size={18} /> Kanal Tanımlayıcıları</h3>
            <p className="text-sm text-gray-400 mb-6">WhatsApp, Instagram, Telegram veya e-posta üzerinden gelen mesajlar bu tanımlayıcılarla eşleştirilir. AI, hangi şirketten geldiğini otomatik anlar.</p>
            <fieldset disabled={!canManageCompanyProfile}>
            {([
              { field: 'whatsapp_phones',   label: 'WhatsApp Telefon Numaraları', placeholder: '+905551234567' },
              { field: 'instagram_handles', label: 'Instagram Hesapları',          placeholder: '@sirketiniz' },
              { field: 'telegram_ids',      label: 'Telegram Bot/Kanal ID',        placeholder: '@sirketbot' },
              { field: 'email_domains',     label: 'E-posta Domainleri',           placeholder: 'sirketiniz.com' },
            ] as const).map(({ field, label, placeholder }) => (
              <div key={field} className="mb-5">
                <label className="text-gray-400 text-sm mb-2 block">{label}</label>
                <div className="flex gap-2 mb-2">
                  <input
                    className={`flex-1 ${inputCls}`}
                    value={channelIdInput[field]}
                    placeholder={placeholder}
                    onChange={e => setChannelIdInput(prev => ({ ...prev, [field]: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && channelIdInput[field].trim()) {
                        setChannelIds(prev => ({ ...prev, [field]: [...prev[field], channelIdInput[field].trim()] }))
                        setChannelIdInput(prev => ({ ...prev, [field]: '' }))
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (channelIdInput[field].trim()) {
                        setChannelIds(prev => ({ ...prev, [field]: [...prev[field], channelIdInput[field].trim()] }))
                        setChannelIdInput(prev => ({ ...prev, [field]: '' }))
                      }
                    }}
                    className="px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-gray-300 hover:border-[#6366f1] text-sm"
                  ><Plus size={14} /></button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {channelIds[field].map((val, i) => (
                    <span key={i} className="flex items-center gap-1 px-3 py-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-full text-sm text-gray-300">
                      {val}
                      <button onClick={() => setChannelIds(prev => ({ ...prev, [field]: prev[field].filter((_, idx) => idx !== i) }))} className="text-gray-500 hover:text-red-400 ml-1"><X size={12} /></button>
                    </span>
                  ))}
                  {channelIds[field].length === 0 && <span className="text-xs text-gray-600 italic">Henüz eklenmedi</span>}
                </div>
              </div>
            ))}
            </fieldset>
            {canManageCompanyProfile && (
            <button
              onClick={async () => {
                setSavingChannelIds(true)
                try {
                  await api.put('/tenants/me/channel-ids', channelIds)
                  showSuccess('Kanal tanımlayıcıları kaydedildi.')
                } catch (e: any) {
                  setError(e.response?.data?.error || 'Kaydedilemedi')
                } finally { setSavingChannelIds(false) }
              }}
              disabled={savingChannelIds}
              className="px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
            >
              <Save size={14} />{savingChannelIds ? 'Kaydediliyor...' : 'Tanımlayıcıları Kaydet'}
            </button>
            )}
          </div>

          {/* ── Ekip (Team) — Şirket Profili altında, sadece yetkili kullanıcılara görünür ── */}
          {canManageCompanyProfile && (
            <>
              {/* Invite form */}
              <div className="p-5 rounded-2xl" style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)' }}>
                <h3 className="font-semibold text-sm mb-4 flex items-center gap-2" style={{ color: 'var(--text-1)' }}><Users size={16} /> Ekip Üyesi Davet Et</h3>
                <div className="flex gap-3 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
                    <input
                      type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                      placeholder="e-posta adresi"
                      className="w-full pl-8 pr-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}
                      onKeyDown={e => e.key === 'Enter' && sendInvite()}
                    />
                  </div>
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                    className="px-3 py-2 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}>
                    <option value="entity_sub">Standart Kullanıcı</option>
                    <option value="entity_supervisor">Süpervizör</option>
                    <option value="entity_main">Yönetici</option>
                  </select>
                  <button onClick={sendInvite} disabled={inviting || !inviteEmail.trim()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40 transition-all"
                    style={{ background: 'rgba(45,138,107,0.85)', color: '#fff' }}>
                    <UserPlus size={14} />
                    {inviting ? 'Gönderiliyor…' : 'Davet Et'}
                  </button>
                </div>
                {inviteMsg && (
                  <p className="text-xs mt-2" style={{ color: inviteMsg.includes('gönderildi') || inviteMsg.includes('eklendi') ? 'var(--forest)' : '#f87171' }}>
                    {inviteMsg}
                  </p>
                )}
              </div>

              {/* Members list */}
              <div className="p-5 rounded-2xl" style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)' }}>
                <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-1)' }}>
                  Ekip Üyeleri ({teamMembers.length})
                </h3>
                {teamMembers.length === 0 ? (
                  <p className="text-sm text-center py-6" style={{ color: 'var(--text-3)' }}>Henüz ekip üyesi yok</p>
                ) : (
                  <div className="space-y-2">
                    {teamMembers.map((m: any) => {
                      const isSubUser = m.role === 'entity_sub'
                      const isSupervisor = m.role === 'entity_supervisor'
                      const canManage = userRole === 'entity_main' || userRole === 'admin' || userRole === 'supervisor'
                      const hasCrmPerm = m.permissions?.viewCrmStructure === true
                      const hasCompanyProfilePerm = m.permissions?.manageCompanyProfile === true

                      const toggleCrmPerm = async () => {
                        try {
                          await api.put(`/crm/users/${m.userId ?? m.id}/structure-permission`, { allow: !hasCrmPerm })
                          api.get('/tenants/me/members').then(r => setTeamMembers(r.data.members ?? [])).catch(() => {})
                        } catch { /* non-fatal */ }
                      }

                      const toggleCompanyProfilePerm = async () => {
                        try {
                          await api.put(`/tenants/users/${m.userId ?? m.id}/company-profile-permission`, { allow: !hasCompanyProfilePerm })
                          api.get('/tenants/me/members').then(r => setTeamMembers(r.data.members ?? [])).catch(() => {})
                        } catch { /* non-fatal */ }
                      }

                      return (
                        <div key={m.userId ?? m.id} className="px-4 py-3 rounded-xl"
                          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
                                style={{ background: 'rgba(45,138,107,0.15)', color: 'var(--forest)' }}>
                                {(m.name ?? m.email ?? '?')[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{m.name || m.email}</p>
                                {m.name && <p className="text-xs" style={{ color: 'var(--text-3)' }}>{m.email}</p>}
                              </div>
                            </div>
                            <span className="px-2 py-1 rounded-lg text-xs capitalize"
                              style={{ background: 'var(--surface-modal)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                              {m.role?.replace('entity_', '') ?? 'üye'}
                            </span>
                          </div>
                          {/* CRM yapısı yetki toggle — sadece entity_sub için */}
                          {isSubUser && canManage && (
                            <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                              <span className="text-xs" style={{ color: 'var(--text-3)' }}>CRM Yapısı Görme Yetkisi</span>
                              <button
                                onClick={toggleCrmPerm}
                                className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                                style={{ background: hasCrmPerm ? 'var(--accent)' : 'var(--surface-3)', border: '1px solid var(--border)' }}>
                                <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                                  style={{ transform: `translateX(${hasCrmPerm ? '18px' : '2px'})` }} />
                              </button>
                            </div>
                          )}
                          {/* Şirket Profili & Ekip yönetimi yetki toggle — sadece entity_supervisor için, sadece entity_main/admin atayabilir */}
                          {isSupervisor && (userRole === 'entity_main' || userRole === 'admin' || userRole === 'supervisor') && (
                            <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                              <span className="text-xs" style={{ color: 'var(--text-3)' }}>Şirket Profili & Ekip Yönetimi Yetkisi</span>
                              <button
                                onClick={toggleCompanyProfilePerm}
                                className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                                style={{ background: hasCompanyProfilePerm ? 'var(--accent)' : 'var(--surface-3)', border: '1px solid var(--border)' }}>
                                <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                                  style={{ transform: `translateX(${hasCompanyProfilePerm ? '18px' : '2px'})` }} />
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Support Agent Settings */}
              <SupportAgentPanel />
            </>
          )}
        </div>
      )}

      {/* ── AI tab ── */}
      {activeTab === 'ai' && (
        <div className="space-y-5">
          {/* Admin notice */}
          {(userRole === 'admin' || userRole === 'supervisor') && !tenant?.tenant && (
            <div className="p-4 rounded-xl flex items-start gap-3" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}>
              <Brain size={18} className="mt-0.5 flex-shrink-0" style={{ color: '#818cf8' }} />
              <div>
                <p className="font-medium text-sm mb-0.5" style={{ color: '#a5b4fc' }}>Platform AI Ayarları</p>
                <p className="text-sm" style={{ color: '#6366f1' }}>Admin kullanıcılar için AI yapılandırması Platform Ayarları üzerinden yapılır.</p>
                <Link to="/app/admin/settings" className="mt-1.5 inline-flex items-center gap-1 text-sm hover:opacity-80" style={{ color: '#818cf8' }}>
                  Platform Ayarlarına Git <ExternalLink size={11} />
                </Link>
              </div>
            </div>
          )}

          {/* ── AI Sağlayıcıları & Rol Modelleri ── */}
          {planUsage && planUsage.planName !== 'custom_models' && (
            <div className="p-4 rounded-xl flex items-start gap-3" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.20)' }}>
              <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" style={{ color: '#fbbf24' }} />
              <div>
                <p className="text-sm" style={{ color: '#fbbf24' }}>
                  API anahtarı girişleri ve model seçiciler sadece <strong>Custom Model</strong> paketinde aktiftir.
                </p>
                <button onClick={() => setActiveTab('plan')} className="mt-1.5 inline-flex items-center gap-1 text-sm hover:opacity-80" style={{ color: '#fbbf24' }}>
                  Plan & Kullanım'a Git <ExternalLink size={11} />
                </button>
              </div>
            </div>
          )}

          <AiProviderPanel
            scope="entity"
            baseEndpoint="/tenants/ai-providers"
            modelsPath="/tenants/ai-providers/all-models"
            roleLabels={ENTITY_MODEL_ROLE_LABELS}
            isAdmin={canManageCompanyProfile}
            disabled={!!planUsage && planUsage.planName !== 'custom_models'}
            hideConfigSections={!!planUsage && planUsage.planName !== 'custom_models'}
            showToast={(msg, ok = true) => ok ? showSuccess(msg) : setError(msg)}
          />

          {/* ── Vector Docs (Entity Knowledge Base) ── */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h3 className="font-bold" style={{ color: 'var(--text-1)' }}>Vektör Tabanı</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Şirket dokümanlarınızı yükleyin — AI arama sırasında anlamsal olarak eşleştirilir</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={loadVectorDocs} disabled={loadingVectorDocs}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: 'var(--surface-modal-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                  <RefreshCw size={12} className={loadingVectorDocs ? 'animate-spin' : ''} /> Yenile
                </button>
                <button onClick={() => setShowAddDoc(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white"
                  style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}>
                  <Plus size={12} /> Doküman Ekle
                </button>
              </div>
            </div>

            {showAddDoc && (
              <div className="mb-4 p-4 rounded-xl space-y-3" style={{ background: 'var(--surface-modal-2)', border: '1px solid var(--border)' }}>
                <input type="text" value={newDocTitle} onChange={e => setNewDocTitle(e.target.value)}
                  placeholder="Doküman başlığı..."
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--surface-modal)', border: '1px solid var(--accent)', color: 'var(--text-1)' }} />
                <textarea value={newDocContent} onChange={e => setNewDocContent(e.target.value)}
                  placeholder="İçerik (ürün bilgisi, politika, SSS, prosedür...)&#10;Ne kadar detaylı olursa AI o kadar iyi arama yapar."
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
                  style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setShowAddDoc(false); setNewDocTitle(''); setNewDocContent('') }}
                    className="px-4 py-2 rounded-lg text-xs"
                    style={{ background: 'var(--surface-modal)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                    İptal
                  </button>
                  <button onClick={saveVectorDoc} disabled={savingDoc || !newDocTitle.trim() || !newDocContent.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-white disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}>
                    <Save size={12} /> {savingDoc ? 'Kaydediliyor...' : 'Kaydet & Vektörle'}
                  </button>
                </div>
              </div>
            )}

            {loadingVectorDocs
              ? <div className="text-center py-6 text-sm" style={{ color: 'var(--text-3)' }}>Yükleniyor...</div>
              : vectorDocs.length === 0
                ? <div className="text-center py-8" style={{ color: 'var(--text-3)' }}>
                    <Database size={28} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Henüz doküman eklenmedi</p>
                    <p className="text-xs mt-1 opacity-70">Ürün açıklamaları, politikalar, SSS gibi içerikleri ekleyin</p>
                  </div>
                : <div className="space-y-2">
                    {vectorDocs.map((doc: any) => (
                      <div key={doc.id} className="flex items-start justify-between gap-3 p-3 rounded-xl"
                        style={{ background: 'var(--surface-modal-2)', border: '1px solid var(--border)' }}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{doc.title}</span>
                            {doc.isIndexed
                              ? <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(38,166,154,0.12)', color: 'var(--accent)' }}>
                                  <CheckCircle size={9} /> İndexlendi
                                </span>
                              : <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,0.10)', color: '#fbbf24' }}>Bekliyor</span>
                            }
                          </div>
                          <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-3)' }}>{doc.content}</p>
                        </div>
                        <button onClick={() => deleteVectorDoc(doc.id)}
                          className="p-1.5 rounded-lg flex-shrink-0"
                          style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
            }

            {/* ── File upload (chunked + hash-diff indexed) ── */}
            <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div>
                  <h4 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Dosya Yükle</h4>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>PDF, DOCX, XLSX, CSV, HTML, TXT — kategori seçip yükleyin, otomatik parçalanıp indexlenir</p>
                </div>
                <button onClick={loadKbDocuments} disabled={loadingKbDocs}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: 'var(--surface-modal-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                  <RefreshCw size={12} className={loadingKbDocs ? 'animate-spin' : ''} /> Yenile
                </button>
              </div>

              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <select value={kbCategory} onChange={e => setKbCategory(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--surface-modal-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}>
                  {ENTITY_KB_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm cursor-pointer"
                  style={{ background: 'var(--surface-modal-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                  <FileText size={14} />
                  {kbFile ? kbFile.name : 'Dosya seç...'}
                  <input type="file" className="hidden" accept=".pdf,.docx,.xlsx,.xls,.csv,.html,.htm,.txt,.md"
                    onChange={e => setKbFile(e.target.files?.[0] ?? null)} />
                </label>
                <button onClick={uploadKbDocument} disabled={!kbFile || uploadingKb}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-white disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}>
                  <Upload size={12} /> {uploadingKb ? 'Yükleniyor...' : 'Yükle & Indexle'}
                </button>
              </div>

              {loadingKbDocs
                ? <div className="text-center py-4 text-sm" style={{ color: 'var(--text-3)' }}>Yükleniyor...</div>
                : kbDocs.length === 0
                  ? <p className="text-xs text-center py-4 opacity-70" style={{ color: 'var(--text-3)' }}>Henüz dosya yüklenmedi</p>
                  : <div className="space-y-2">
                      {kbDocs.map((doc: any) => (
                        <div key={doc.id} className="flex items-center justify-between gap-3 p-3 rounded-xl"
                          style={{ background: 'var(--surface-modal-2)', border: '1px solid var(--border)' }}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{doc.originalFileName ?? doc.title}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.10)', color: '#818cf8' }}>
                                {ENTITY_KB_CATEGORIES.find(c => c.key === doc.category)?.label ?? doc.category}
                              </span>
                              {doc.status === 'active'
                                ? <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(38,166,154,0.12)', color: 'var(--accent)' }}>
                                    <CheckCircle size={9} /> İndexlendi
                                  </span>
                                : doc.status === 'failed'
                                  ? <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.10)', color: '#f87171' }}>
                                      <XCircle size={9} /> Hata
                                    </span>
                                  : <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,0.10)', color: '#fbbf24' }}>İşleniyor</span>
                              }
                            </div>
                          </div>
                          <button onClick={() => deleteKbDocument(doc.id)}
                            className="p-1.5 rounded-lg flex-shrink-0"
                            style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
              }
            </div>
          </div>
        </div>
      )}

      {/* ── CRM / ERP tab ── */}
      {activeTab === 'crm' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-lg font-semibold text-white">CRM / ERP Bağlantıları</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setShowCrmWizard(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all font-medium"
                style={{ background: 'rgba(38,166,154,0.15)', color: 'var(--accent)', border: '1px solid rgba(38,166,154,0.3)' }}>
                <Wand2 size={14} /> Sihirbaz ile Bağla
              </button>
              <button onClick={() => { setShowOAuthModal(true); setOauthMsg('') }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
                style={{ background: 'rgba(45,138,107,0.12)', color: 'var(--forest)', border: '1px solid rgba(45,138,107,0.25)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
                OAuth ile Bağla
              </button>
              <button onClick={() => { setDbTarget('crm'); setShowDbModal(true); setDbTestResult(null) }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
                style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' }}>
                <Database size={14} /> DB ile Bağla
              </button>
              <button onClick={() => setShowCrmModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm">
                <Plus size={14} /> API Key ile Ekle
              </button>
            </div>
          </div>

          {crmConnections.length === 0 ? (
            <div className="p-8 bg-[#111111] rounded-xl border border-[#2a2a2a] text-center">
              <p className="text-gray-500">Henüz CRM / ERP bağlantısı yok. Sihirbaz ile kolayca ekleyin.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {crmConnections.map((conn: any) => {
                const isExpanded = expandedConnId === conn.id
                const history = connSyncHistory[conn.id] ?? []
                const entityData = connEntityData[conn.id]

                const loadExpanded = async () => {
                  if (!isExpanded) {
                    setExpandedConnId(conn.id)
                    try {
                      const [hRes, eRes] = await Promise.all([
                        api.get(`/crm/connections/${conn.id}/sync-history`).catch(() => ({ data: { jobs: [] } })),
                        api.get(`/crm/connections/${conn.id}/entity-tables`).catch(() => ({ data: { tables: [] } })),
                      ])
                      setConnSyncHistory(p => ({ ...p, [conn.id]: hRes.data.jobs ?? [] }))
                      setConnEntityData(p => ({ ...p, [conn.id]: eRes.data }))
                    } catch { /* ignore */ }
                  } else {
                    setExpandedConnId(null)
                  }
                }

                return (
                  <div key={conn.id} className="bg-[#111111] rounded-xl border border-[#2a2a2a] overflow-hidden">
                    {/* Header row */}
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="min-w-0">
                          <p className="text-white font-medium truncate">{conn.name}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-xs ${crmBadgeClass(conn.crmType)}`}>{crmTypeLabel(conn.crmType)}</span>
                            {conn.connectorConfig && (
                              <span className="px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(38,166,154,0.15)', color: 'var(--accent)' }}>✓ Konnektör v{conn.connectorConfig.version}</span>
                            )}
                            <div className="flex items-center gap-1">
                              <div className={`w-2 h-2 rounded-full ${conn.syncStatus === 'done' ? 'bg-green-500' : conn.syncStatus === 'running' ? 'bg-yellow-500' : conn.syncStatus === 'error' ? 'bg-red-500' : 'bg-gray-500'}`} />
                              <span className="text-gray-400 text-xs">{conn.syncStatus || 'idle'}</span>
                            </div>
                            {conn.lastSyncAt && <span className="text-gray-500 text-xs">{new Date(conn.lastSyncAt).toLocaleDateString('tr-TR')}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => api.post(`/crm/connections/${conn.id}/generate-connector`).then(() => loadData()).catch(console.error)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs" style={{ background: 'rgba(45,138,107,0.12)', color: 'var(--forest)', border: '1px solid rgba(45,138,107,0.2)' }}>
                          <Zap size={12} /> {conn.connectorConfig ? 'Konnektörü Yenile' : 'Konnektör Oluştur'}
                        </button>
                        <button onClick={() => metadataSync(conn.id)} className="px-2.5 py-1.5 bg-[#222] hover:bg-[#2a2a2a] text-gray-300 rounded text-xs">
                          Yapıyı Yenile
                        </button>
                        <button onClick={loadExpanded} className="px-2.5 py-1.5 bg-[#222] hover:bg-[#2a2a2a] text-gray-300 rounded text-xs flex items-center gap-1">
                          <History size={12} /> {isExpanded ? 'Kapat' : 'Detay'}
                        </button>
                        <button onClick={() => deleteCrm(conn.id)} className="p-1.5 text-red-400 hover:bg-red-900/20 rounded">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-[#2a2a2a] p-4 space-y-4">
                        {/* Entity data preview */}
                        {entityData && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 mb-2">
                              Entity Veritabanı
                              {entityData.schema && <span className="ml-2 font-mono opacity-50">{entityData.schema}</span>}
                            </p>
                            {(entityData.tables ?? []).length === 0
                              ? <p className="text-xs" style={{ color: 'var(--text-3)' }}>Henüz tablo yok — "Onayla ve Kaydet" ile ETL başlatın</p>
                              : (
                                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                                  {(entityData.tables as Array<{ name: string; count: number }>).map(tbl => (
                                    <div key={tbl.name} className="p-3 rounded-lg text-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                                      <p className="text-lg font-bold" style={{ color: 'var(--accent)' }}>{tbl.count.toLocaleString('tr-TR')}</p>
                                      <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-3)', wordBreak: 'break-all' }}>{tbl.name}</p>
                                    </div>
                                  ))}
                                </div>
                              )
                            }
                          </div>
                        )}

                        {/* Connector mappings */}
                        {conn.connectorConfig?.mappings?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 mb-2">Eşleştirme Tablosu ({conn.connectorConfig.mappings.filter((m: any) => m.targetTable).length} modül)</p>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead><tr style={{ background: 'var(--surface-2)' }}><th className="px-3 py-2 text-left text-gray-400">Kaynak</th><th className="px-3 py-2 text-left text-gray-400">Hedef Tablo</th><th className="px-3 py-2 text-left text-gray-400">Alan Sayısı</th></tr></thead>
                                <tbody>
                                  {conn.connectorConfig.mappings.slice(0, 8).map((m: any, i: number) => (
                                    <tr key={i} className="border-t border-[#2a2a2a]">
                                      <td className="px-3 py-1.5 font-mono text-gray-300">{m.sourceModule}</td>
                                      <td className="px-3 py-1.5" style={{ color: m.targetTable ? 'var(--accent)' : 'var(--text-3)' }}>{m.targetTable ?? '— eşleşme yok —'}</td>
                                      <td className="px-3 py-1.5 text-gray-500">{m.fields?.length ?? 0}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Sync history */}
                        {history.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 mb-2">Son Sync'ler</p>
                            <div className="space-y-1.5">
                              {history.slice(0, 5).map((job: any) => (
                                <div key={job.id} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--surface-2)' }}>
                                  <div className={`w-2 h-2 rounded-full shrink-0 ${job.status === 'done' ? 'bg-green-500' : job.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                                  <span className="text-gray-400">{job.moduleApiName}</span>
                                  <span className="text-gray-500">{job.recordsCount ? `${job.recordsCount} kayıt` : ''}</span>
                                  <span className="ml-auto text-gray-500">{job.createdAt ? new Date(job.createdAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : ''}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Accounting tab ── */}
      {activeTab === 'accounting' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-lg font-semibold text-white">Muhasebe Bağlantıları</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => { setShowAccOAuthModal(true); setAccOAuthMsg('') }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
                style={{ background: 'rgba(45,138,107,0.12)', color: 'var(--forest)', border: '1px solid rgba(45,138,107,0.25)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
                OAuth ile Bağla
              </button>
              <button onClick={() => { setDbTarget('accounting'); setShowDbModal(true); setDbTestResult(null) }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
                style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' }}>
                <Database size={14} />
                DB ile Bağla
              </button>
              <button onClick={() => setShowAccountingModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm">
                <Plus size={14} />
                API Key ile Ekle
              </button>
            </div>
          </div>

          {accountingConnections.length === 0 ? (
            <div className="p-8 bg-[#111111] rounded-xl border border-[#2a2a2a] text-center">
              <p className="text-gray-500">Henüz muhasebe bağlantısı yok</p>
            </div>
          ) : (
            <div className="space-y-3">
              {accountingConnections.map(conn => (
                <div key={conn.id} className="p-4 bg-[#111111] rounded-xl border border-[#2a2a2a] flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">{conn.name}</p>
                    <p className="text-gray-500 text-sm">
                      {ACCOUNTING_TYPES.find(t => t.value === conn.accountingType)?.label ?? conn.accountingType}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteAccounting(conn.id)}
                    className="p-2 text-red-400 hover:bg-red-900/20 rounded"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Channels tab ── */}
      {activeTab === 'channels' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">İletişim Kanalları</h3>
            <p className="text-gray-500 text-sm">API belgelerine göre yapılandırılmış entegrasyonlar</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(CHANNEL_SCHEMAS).map(([key, schema]) => {
              const isConfigured = !!channelConfigs[key]
              return (
                <div key={key} className="p-5 bg-[#111111] rounded-xl border border-[#2a2a2a]">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl leading-none">{schema.emoji}</span>
                      <div>
                        <h4 className="text-white font-medium text-sm">{schema.label}</h4>
                        <p className="text-gray-500 text-xs mt-0.5">{schema.description}</p>
                      </div>
                    </div>
                    {isConfigured
                      ? <span className="flex items-center gap-1 px-2 py-0.5 bg-green-900/30 text-green-400 rounded text-xs flex-shrink-0"><CheckCircle size={10} /> Aktif</span>
                      : <span className="px-2 py-0.5 bg-gray-900/30 text-gray-500 rounded text-xs flex-shrink-0">Yapılandırılmadı</span>
                    }
                  </div>

                  {isConfigured && (
                    <p className="text-gray-600 text-xs mb-3">{schema.fields.length} alan yapılandırıldı</p>
                  )}

                  <div className="flex gap-2 mb-3">
                    <button onClick={() => openChannelModal(key)}
                      className="flex-1 px-3 py-1.5 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm">
                      {isConfigured ? 'Düzenle' : 'Yapılandır'}
                    </button>
                    {isConfigured && (
                      <button
                        onClick={async () => {
                          setWebhookTestStatus(s => ({ ...s, [key]: 'testing' }))
                          try {
                            await api.post(`/channels/${key}/test`)
                            setWebhookTestStatus(s => ({ ...s, [key]: 'ok' }))
                            setTimeout(() => setWebhookTestStatus(s => ({ ...s, [key]: 'idle' })), 3000)
                          } catch {
                            setWebhookTestStatus(s => ({ ...s, [key]: 'error' }))
                            setTimeout(() => setWebhookTestStatus(s => ({ ...s, [key]: 'idle' })), 3000)
                          }
                        }}
                        disabled={webhookTestStatus[key] === 'testing'}
                        className="px-3 py-1.5 bg-[#222] hover:bg-[#2a2a2a] text-gray-400 rounded-lg text-xs disabled:opacity-50"
                        title="Webhook Test Et">
                        {webhookTestStatus[key] === 'testing' ? '...' :
                         webhookTestStatus[key] === 'ok' ? '✓' :
                         webhookTestStatus[key] === 'error' ? '✗' : 'Test'}
                      </button>
                    )}
                    {isConfigured && (
                      <button onClick={() => deleteChannelConfig(key)}
                        className="px-3 py-1.5 bg-[#222] hover:bg-red-900/20 text-gray-400 hover:text-red-400 rounded-lg text-sm transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  <div className="p-2 bg-[#0a0a0a] rounded-lg">
                    <p className="text-gray-600 text-[10px] mb-1">Webhook URL</p>
                    <div className="flex items-center gap-1">
                      <code className="flex-1 text-[10px] text-gray-500 truncate">{window.location.origin}/webhooks/{key}</code>
                      <button onClick={() => copyToClipboard(`${window.location.origin}/webhooks/${key}`)}
                        className="text-gray-600 hover:text-gray-400 flex-shrink-0 p-0.5">
                        <Copy size={10} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Message templates */}
          <div className="p-5 bg-[#111111] rounded-xl border border-[#2a2a2a]">
            <h4 className="text-white font-medium text-sm mb-4">Mesaj Şablonları</h4>
            <div className="space-y-3">
              {[
                { key: 'greeting', label: 'Karşılama' },
                { key: 'away', label: 'Dışarıda / Kapalı' },
                { key: 'escalation', label: 'İnsan Temsilciye Aktarım' },
                { key: 'resolved', label: 'Çözüldü' },
              ].map(t => (
                <div key={t.key}>
                  <label className="text-gray-400 text-xs mb-1 block">{t.label}</label>
                  <input
                    value={msgTemplates[t.key] ?? ''}
                    onChange={e => setMsgTemplates(m => ({ ...m, [t.key]: e.target.value }))}
                    placeholder={`${t.label} mesajı...`}
                    className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-gray-300 text-sm outline-none focus:border-[#6366f1]"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={async () => {
                  try {
                    await api.put('/tenants/me/settings', { messageTemplates: msgTemplates })
                    showSuccess('Mesaj şablonları kaydedildi.')
                  } catch (e: any) {
                    setError(e.response?.data?.error || 'Kaydedilemedi')
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm">
                <Save size={14} /> Şablonları Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Plan & Usage tab ── */}
      {activeTab === 'plan' && (
        <div className="space-y-6">
          {planLoading ? (
            <div className="p-8 text-center" style={{ color: 'var(--text-3)' }}>Yükleniyor...</div>
          ) : planUsage ? (
            <>
              {/* Current plan header */}
              <div className="p-6 rounded-2xl" style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-lg" style={{ color: 'var(--text-1)' }}>Mevcut Plan</h3>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>Bu ay kullanımınız</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-sm font-semibold"
                    style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }}>
                    {planUsage.plan?.displayName ?? planUsage.planName}
                  </span>
                </div>

                {/* Usage bars */}
                <div className="space-y-4">
                  {[
                    { label: 'Aylık Mesaj', key: 'monthlyMessages', unit: 'mesaj' },
                    { label: 'Kullanıcı', key: 'users', unit: 'kullanıcı' },
                    { label: 'Bağlantı', key: 'connections', unit: 'bağlantı' },
                    { label: 'Depolama', key: 'storageMb', unit: 'MB' },
                  ].map(({ label, key, unit }) => {
                    const u = planUsage.usage?.[key]
                    if (!u) return null
                    const pct = u.pct ?? 0
                    const barColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#6366f1'
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm" style={{ color: 'var(--text-2)' }}>{label}</span>
                          <span className="text-xs" style={{ color: pct >= 90 ? '#ef4444' : 'var(--text-3)' }}>
                            {u.used} / {u.limit == null ? 'Sınırsız' : u.limit} {unit}{u.limit == null ? '' : ` (${pct}%)`}
                          </span>
                        </div>
                        <div className="w-full rounded-full h-2" style={{ background: 'var(--surface-2)' }}>
                          <div className="h-2 rounded-full transition-all"
                            style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Limit warnings */}
                {planUsage.limitsHit?.length > 0 && (
                  <div className="mt-4 p-3 rounded-xl flex items-start gap-2"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" style={{ color: '#ef4444' }} />
                    <div className="text-sm" style={{ color: '#f87171' }}>
                      {planUsage.limitsHit.map((msg: string) => <p key={msg}>{msg}</p>)}
                    </div>
                  </div>
                )}

                {/* Plan features */}
                <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>Plan Özellikleri</p>
                  <div className="grid grid-cols-2 gap-2 text-sm" style={{ color: 'var(--text-2)' }}>
                    <div className="flex items-center gap-2">
                      <CheckCircle size={14} style={{ color: '#22c55e' }} />
                      <span>AI Modeller: <strong style={{ color: 'var(--text-1)' }}>{planUsage.plan?.aiModels}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle size={14} style={{ color: '#22c55e' }} />
                      <span>Destek SLA: <strong style={{ color: 'var(--text-1)' }}>{planUsage.plan?.supportSla}</strong></span>
                    </div>
                    {planUsage.plan?.channels?.map((ch: string) => (
                      <div key={ch} className="flex items-center gap-2">
                        <CheckCircle size={14} style={{ color: '#22c55e' }} />
                        <span className="capitalize">{ch}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Plan comparison */}
              {allPlans.length > 0 && (
                <div className="p-6 rounded-2xl" style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)' }}>
                  <h3 className="font-semibold mb-4" style={{ color: 'var(--text-1)' }}>Plan Karşılaştırması</h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {allPlans.map((p: any) => {
                      const isCurrent = p.name === planUsage.planName
                      return (
                        <div key={p.name} className="p-4 rounded-xl"
                          style={{
                            background: isCurrent ? 'rgba(99,102,241,0.1)' : 'var(--surface-2)',
                            border: isCurrent ? '1px solid rgba(99,102,241,0.4)' : '1px solid var(--border)',
                          }}>
                          <p className="font-semibold text-sm mb-1" style={{ color: isCurrent ? '#818cf8' : 'var(--text-1)' }}>
                            {p.displayName}
                            {isCurrent && <span className="ml-1 text-xs">(Aktif)</span>}
                          </p>
                          <p className="text-xs mb-2" style={{ color: 'var(--text-3)' }}>
                            {p.monthlyMessages == null ? 'Sınırsız' : p.monthlyMessages.toLocaleString()} mesaj/ay
                          </p>
                          <p className="text-xs" style={{ color: 'var(--text-3)' }}>{p.maxUsers === 999 ? 'Sınırsız' : p.maxUsers} kullanıcı</p>
                          <p className="text-xs" style={{ color: 'var(--text-3)' }}>{p.maxConnections === 999 ? 'Sınırsız' : p.maxConnections} bağlantı</p>
                          {!isCurrent && (
                            <button className="mt-3 w-full py-1.5 rounded-lg text-xs font-medium"
                              style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }}
                              onClick={() => alert('Plan yükseltme için destek ile iletişime geçin.')}>
                              Yükselt
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-8 text-center rounded-2xl" style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
              Plan bilgisi yüklenemedi.
            </div>
          )}
        </div>
      )}

      {/* ── Security tab ── */}
      {activeTab === 'security' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">2FA & Güvenlik</h3>
          <div className="space-y-4">
            <div className="p-6 bg-[#111111] rounded-xl border border-[#2a2a2a] flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h4 className="text-white font-medium">Authenticator (TOTP)</h4>
                  <span className={`px-2 py-0.5 rounded text-xs ${tenant?.totpSecret ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'}`}>
                    {tenant?.totpSecret ? 'Aktif' : 'Kurulmadı'}
                  </span>
                </div>
                <p className="text-gray-500 text-sm">Google Authenticator, Authy gibi uygulamalar</p>
              </div>
              {!tenant?.totpSecret && (
                <button onClick={setupTotp} className="flex items-center gap-2 px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm">
                  <QrCode size={16} />
                  Authenticator Kur
                </button>
              )}
            </div>
            <div className="p-6 bg-[#111111] rounded-xl border border-[#2a2a2a]">
              <div className="flex items-center gap-3 mb-1">
                <h4 className="text-white font-medium">WhatsApp OTP</h4>
                <span className={`px-2 py-0.5 rounded text-xs ${tenant?.phone ? 'bg-green-900/30 text-green-400' : 'bg-gray-900/30 text-gray-400'}`}>
                  {tenant?.phone ? 'Aktif' : 'Telefon numarası eklenmemiş'}
                </span>
              </div>
              <p className="text-gray-500 text-sm">WhatsApp üzerinden doğrulama kodu al</p>
            </div>
            <div className="p-6 bg-[#111111] rounded-xl border border-[#2a2a2a]">
              <div className="flex items-center gap-3 mb-1">
                <h4 className="text-white font-medium">E-posta OTP</h4>
                <span className="px-2 py-0.5 bg-green-900/30 text-green-400 rounded text-xs">Aktif</span>
              </div>
              <p className="text-gray-500 text-sm">E-posta üzerinden doğrulama kodu al (fallback)</p>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MODALS
          ════════════════════════════════════════════════════════════════════ */}

      {/* ── OAuth modal ── */}
      {showOAuthModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl flex flex-col"
            style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>OAuth ile CRM Bağla</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Zoho, HubSpot veya Salesforce hesabınızı bağlayın</p>
              </div>
              <button onClick={() => setShowOAuthModal(false)} style={{ color: 'var(--text-3)' }}><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Provider seçimi */}
              <div className="flex gap-2">
                {(['zoho', 'hubspot', 'salesforce'] as const).map(p => (
                  <button key={p} onClick={() => setOauthProvider(p)}
                    className="flex-1 py-2 rounded-xl text-xs font-medium capitalize transition-all"
                    style={oauthProvider === p
                      ? { background: 'rgba(45,138,107,0.85)', color: '#fff' }
                      : { background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
              {/* Form */}
              {[
                { key: 'name', label: 'Bağlantı Adı', placeholder: 'Ör: Şirket Zoho CRM' },
                { key: 'clientId', label: 'Client ID', placeholder: 'OAuth Client ID' },
                { key: 'clientSecret', label: 'Client Secret', placeholder: 'OAuth Client Secret' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>{f.label}</label>
                  <input value={(oauthForm as any)[f.key]}
                    onChange={e => setOauthForm(o => ({ ...o, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }} />
                </div>
              ))}
              {oauthProvider === 'zoho' && (
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Bölge</label>
                  <select value={oauthForm.region} onChange={e => setOauthForm(o => ({ ...o, region: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}>
                    {[['com','Global (com)'],['eu','Avrupa (eu)'],['in','Hindistan (in)'],['com.au','Avustralya (com.au)'],['jp','Japonya (jp)']].map(([v,l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
              )}
              <p className="text-xs p-3 rounded-xl" style={{ background: 'rgba(251,191,36,0.07)', color: '#fbbf24' }}>
                Yetkilendirme popup'ı açılacak. Popup'ı tamamladıktan sonra bağlantı otomatik eklenir.
              </p>
              {oauthMsg && <p className="text-xs text-red-400">{oauthMsg}</p>}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setShowOAuthModal(false)}
                className="px-4 py-2 rounded-xl text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
                İptal
              </button>
              <button onClick={startOAuth} disabled={oauthLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
                style={{ background: 'rgba(45,138,107,0.85)', color: '#fff' }}>
                {oauthLoading ? 'Bağlanıyor...' : 'Yetkilendir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Accounting OAuth modal ── */}
      {showAccOAuthModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl flex flex-col"
            style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>OAuth ile Muhasebe Bağla</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Zoho Books, QuickBooks veya Xero hesabınızı bağlayın</p>
              </div>
              <button onClick={() => setShowAccOAuthModal(false)} style={{ color: 'var(--text-3)' }}><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-2">
                {(['zoho_books', 'quickbooks', 'xero'] as const).map(p => (
                  <button key={p} onClick={() => setAccOAuthProvider(p)}
                    className="flex-1 py-2 rounded-xl text-xs font-medium transition-all"
                    style={accOAuthProvider === p
                      ? { background: 'rgba(45,138,107,0.85)', color: '#fff' }
                      : { background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                    {p === 'zoho_books' ? 'Zoho Books' : p === 'quickbooks' ? 'QuickBooks' : 'Xero'}
                  </button>
                ))}
              </div>
              {[
                { key: 'name', label: 'Bağlantı Adı', placeholder: 'Ör: Şirket Muhasebe' },
                { key: 'clientId', label: 'Client ID', placeholder: 'OAuth Client ID' },
                { key: 'clientSecret', label: 'Client Secret', placeholder: 'OAuth Client Secret' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>{f.label}</label>
                  <input value={(accOAuthForm as any)[f.key]}
                    onChange={e => setAccOAuthForm(o => ({ ...o, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }} />
                </div>
              ))}
              {accOAuthProvider === 'zoho_books' && (
                <>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Organization ID</label>
                    <input value={accOAuthForm.organizationId}
                      onChange={e => setAccOAuthForm(o => ({ ...o, organizationId: e.target.value }))}
                      placeholder="Zoho Books Organization ID"
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Bölge</label>
                    <select value={accOAuthForm.region} onChange={e => setAccOAuthForm(o => ({ ...o, region: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}>
                      {[['com','Global (com)'],['eu','Avrupa (eu)'],['in','Hindistan (in)'],['com.au','Avustralya (com.au)']].map(([v,l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <p className="text-xs p-3 rounded-xl" style={{ background: 'rgba(251,191,36,0.07)', color: '#fbbf24' }}>
                Yetkilendirme popup'ı açılacak. Popup'ı tamamladıktan sonra bağlantı otomatik eklenir.
              </p>
              {accOAuthMsg && <p className="text-xs text-red-400">{accOAuthMsg}</p>}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setShowAccOAuthModal(false)}
                className="px-4 py-2 rounded-xl text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
                İptal
              </button>
              <button onClick={startAccOAuth} disabled={accOAuthLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
                style={{ background: 'rgba(45,138,107,0.85)', color: '#fff' }}>
                {accOAuthLoading ? 'Bağlanıyor...' : 'Yetkilendir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DB connection modal ── */}
      {showDbModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl flex flex-col max-h-[90vh]"
            style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>PostgreSQL DB Bağla</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Sadece okuma yetkisi olan bir kullanıcı kullanın</p>
              </div>
              <button onClick={() => setShowDbModal(false)} style={{ color: 'var(--text-3)' }}><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto">
              {[
                { key: 'name',     label: 'Bağlantı Adı', placeholder: 'Ör: Şirket Veritabanı', full: true },
                { key: 'host',     label: 'Host',          placeholder: 'ki-postgres veya IP', full: true },
                { key: 'database', label: 'Veritabanı',    placeholder: 'kibusiness', full: false },
                { key: 'port',     label: 'Port',          placeholder: '5432',       full: false },
                { key: 'username', label: 'Kullanıcı',     placeholder: 'kibi_bi_user', full: false },
                { key: 'password', label: 'Şifre',         placeholder: '••••••••',   full: false },
              ].map(f => (
                <div key={f.key} className={f.full ? '' : 'inline-block w-[calc(50%-6px)] ' + (f.key === 'database' || f.key === 'username' ? 'mr-3' : '')}>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>{f.label}</label>
                  <input
                    type={f.key === 'password' ? 'password' : 'text'}
                    value={(dbForm as any)[f.key]}
                    onChange={e => setDbForm(d => ({ ...d, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}
                  />
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <input type="checkbox" id="db-ssl" checked={dbForm.ssl}
                  onChange={e => setDbForm(d => ({ ...d, ssl: e.target.checked }))} className="rounded" />
                <label htmlFor="db-ssl" className="text-xs" style={{ color: 'var(--text-2)' }}>SSL kullan</label>
              </div>
              {/* Test sonucu */}
              {dbTestResult && (
                <div className={`p-3 rounded-xl text-xs`}
                  style={{ background: dbTestResult.ok ? 'rgba(45,138,107,0.08)' : 'rgba(239,68,68,0.08)', color: dbTestResult.ok ? 'var(--forest)' : '#f87171' }}>
                  {dbTestResult.ok ? (
                    <>
                      <p className="font-medium">✓ Bağlantı başarılı</p>
                      <p className="mt-1">Salt okunur: {dbTestResult.isReadOnly ? '✓ Evet' : '⚠ Hayır (yazma yetkisi var!)'}</p>
                      {dbTestResult.tables && <p className="mt-1">{dbTestResult.tables.length} tablo bulundu: {dbTestResult.tables.slice(0,5).join(', ')}{dbTestResult.tables.length > 5 ? '...' : ''}</p>}
                    </>
                  ) : (
                    <p>✗ {dbTestResult.error}</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setShowDbModal(false)}
                className="px-4 py-2 rounded-xl text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
                İptal
              </button>
              <button onClick={testDbConnection} disabled={dbTesting}
                className="px-4 py-2 rounded-xl text-sm disabled:opacity-50"
                style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                {dbTesting ? 'Test ediliyor...' : 'Bağlantıyı Test Et'}
              </button>
              <button onClick={saveDbConnection} disabled={dbSaving || !dbTestResult?.ok}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
                style={{ background: 'rgba(45,138,107,0.85)', color: '#fff' }}>
                {dbSaving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CRM / ERP add modal ── */}
      {showCrmModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#111111] rounded-xl border border-[#2a2a2a] w-full max-w-[560px] max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-[#2a2a2a]">
              <h3 className="text-lg font-semibold text-white">Yeni CRM / ERP Bağlantısı</h3>
              <button
                onClick={() => { setShowCrmModal(false); setCrmTestStatus('idle'); setCrmTestError('') }}
                className="text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-4 flex-1">
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Bağlantı Adı</label>
                <input
                  placeholder="örn: Şirket Zoho CRM"
                  value={newCrm.name}
                  onChange={e => setNewCrm({ ...newCrm, name: e.target.value })}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-1 block">Sistem Türü</label>
                <select
                  value={newCrm.crmType}
                  onChange={e => {
                    setNewCrm({ ...newCrm, crmType: e.target.value, credentials: {} })
                    setCrmTestStatus('idle')
                    setCrmTestError('')
                  }}
                  className={inputCls}
                >
                  {CRM_GROUPS.map(g => (
                    <optgroup key={g.group} label={g.group}>
                      {g.types.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="pt-1 space-y-4">
                <CredentialForm
                  crmType={newCrm.crmType}
                  creds={newCrm.credentials}
                  onChange={credentials => setNewCrm({ ...newCrm, credentials })}
                />
              </div>
            </div>

            <div className="p-6 border-t border-[#2a2a2a] space-y-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={testCrm}
                  disabled={crmTestStatus === 'testing'}
                  className="px-4 py-2 bg-[#222] hover:bg-[#2a2a2a] text-gray-300 rounded-lg text-sm disabled:opacity-50"
                >
                  Bağlantıyı Test Et
                </button>
                <TestBadge status={crmTestStatus} error={crmTestError} />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => { setShowCrmModal(false); setCrmTestStatus('idle'); setCrmTestError('') }}
                  className="px-4 py-2 bg-[#222] text-gray-300 rounded-lg text-sm"
                >
                  İptal
                </button>
                <button
                  onClick={addCrm}
                  disabled={crmTestStatus !== 'ok'}
                  className="px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Accounting add modal ── */}
      {showAccountingModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#111111] rounded-xl border border-[#2a2a2a] w-full max-w-[560px] max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-[#2a2a2a]">
              <h3 className="text-lg font-semibold text-white">Yeni Muhasebe Bağlantısı</h3>
              <button
                onClick={() => { setShowAccountingModal(false); setAccTestStatus('idle'); setAccTestError('') }}
                className="text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-4 flex-1">
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Bağlantı Adı</label>
                <input
                  placeholder="örn: Şirket QuickBooks"
                  value={newAccounting.name}
                  onChange={e => setNewAccounting({ ...newAccounting, name: e.target.value })}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-1 block">Yazılım</label>
                <select
                  value={newAccounting.accountingType}
                  onChange={e => {
                    setNewAccounting({ ...newAccounting, accountingType: e.target.value, credentials: {} })
                    setAccTestStatus('idle')
                    setAccTestError('')
                  }}
                  className={inputCls}
                >
                  {ACCOUNTING_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="pt-1 space-y-4">
                <AccountingCredentialForm
                  accountingType={newAccounting.accountingType}
                  creds={newAccounting.credentials}
                  onChange={credentials => setNewAccounting({ ...newAccounting, credentials })}
                />
              </div>
            </div>

            <div className="p-6 border-t border-[#2a2a2a] space-y-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={testAccounting}
                  disabled={accTestStatus === 'testing'}
                  className="px-4 py-2 bg-[#222] hover:bg-[#2a2a2a] text-gray-300 rounded-lg text-sm disabled:opacity-50"
                >
                  Bağlantıyı Test Et
                </button>
                <TestBadge status={accTestStatus} error={accTestError} />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => { setShowAccountingModal(false); setAccTestStatus('idle'); setAccTestError('') }}
                  className="px-4 py-2 bg-[#222] text-gray-300 rounded-lg text-sm"
                >
                  İptal
                </button>
                <button
                  onClick={addAccounting}
                  disabled={accTestStatus !== 'ok'}
                  className="px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Webhook setup modal ── */}
      {webhookSetup && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#111111] rounded-xl border border-[#2a2a2a] w-full max-w-[520px]">
            <div className="flex items-center justify-between p-6 border-b border-[#2a2a2a]">
              <div>
                <h3 className="text-lg font-semibold text-white">Webhook Kurulumu</h3>
                <p className="text-gray-500 text-sm mt-0.5">{webhookSetup.name} başarıyla eklendi</p>
              </div>
              <button onClick={() => setWebhookSetup(null)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-gray-300 text-sm">
                <strong>{crmTypeLabel(webhookSetup.type)}</strong> üzerinden anlık bildirim almak için aşağıdaki URL'yi ilgili sistemin webhook ayarlarına kaydedin:
              </p>

              <div>
                <label className="text-gray-400 text-xs mb-1 block">Webhook URL</label>
                <div className="flex gap-2">
                  <input
                    value={webhookSetup.url}
                    readOnly
                    className="flex-1 px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-gray-300 text-sm font-mono"
                  />
                  <button
                    onClick={() => copyToClipboard(webhookSetup.url)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#222] hover:bg-[#2a2a2a] text-gray-300 rounded-lg text-sm"
                  >
                    <Copy size={14} />
                    Kopyala
                  </button>
                </div>
              </div>

              <div className="p-3 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg">
                <p className="text-xs text-gray-500 mb-1 font-medium">Nereye kayıt yapılır?</p>
                <p className="text-sm text-gray-300">{webhookSetup.instructions}</p>
              </div>

              <p className="text-gray-500 text-xs">Bu adımı atlayabilirsiniz — webhook sonradan da eklenebilir.</p>
            </div>

            <div className="flex justify-end p-6 border-t border-[#2a2a2a]">
              <button
                onClick={() => setWebhookSetup(null)}
                className="px-5 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm"
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Channel config modal ── */}
      {showChannelModal && editingChannel && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-[#2a2a2a]">
              <div className="flex items-center gap-3">
                <span className="text-xl leading-none">{CHANNEL_SCHEMAS[editingChannel]?.emoji}</span>
                <div>
                  <h3 className="text-white font-semibold text-sm">{CHANNEL_SCHEMAS[editingChannel]?.label}</h3>
                  <p className="text-gray-500 text-xs">{CHANNEL_SCHEMAS[editingChannel]?.description}</p>
                </div>
              </div>
              <button onClick={() => setShowChannelModal(false)} className="text-gray-400 hover:text-white"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {CHANNEL_SCHEMAS[editingChannel]?.fields.map(field => (
                <div key={field.key}>
                  <label className="text-gray-400 text-sm mb-1.5 block">{field.label}</label>
                  {field.type === 'select' ? (
                    <select value={channelForm[field.key] ?? field.options?.[0] ?? ''}
                      onChange={e => setChannelForm(f => ({ ...f, [field.key]: e.target.value }))}
                      className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm">
                      {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : field.type === 'password' ? (
                    <div className="relative">
                      <input type="password" value={channelForm[field.key] ?? ''}
                        placeholder={field.placeholder}
                        onChange={e => setChannelForm(f => ({ ...f, [field.key]: e.target.value }))}
                        className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm" />
                    </div>
                  ) : (
                    <input type="text" value={channelForm[field.key] ?? ''}
                      placeholder={field.placeholder}
                      onChange={e => setChannelForm(f => ({ ...f, [field.key]: e.target.value }))}
                      className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm" />
                  )}
                  {field.help && <p className="text-gray-600 text-xs mt-1">{field.help}</p>}
                </div>
              ))}

              <div className="p-3 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg">
                <p className="text-gray-500 text-xs mb-1 font-medium">Webhook URL — bu adresi sağlayıcınıza girin:</p>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 text-[11px] text-gray-400 break-all">{window.location.origin}/webhooks/{editingChannel}</code>
                  <button onClick={() => copyToClipboard(`${window.location.origin}/webhooks/${editingChannel}`)}
                    className="text-gray-500 hover:text-gray-300 flex-shrink-0"><Copy size={12} /></button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-[#2a2a2a]">
              <button onClick={() => setShowChannelModal(false)} className="px-4 py-2 bg-[#222] text-gray-300 rounded-lg text-sm">İptal</button>
              <button onClick={saveChannelConfig} disabled={savingChannel}
                className="flex items-center gap-2 px-5 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm disabled:opacity-50">
                <Save size={14} /> {savingChannel ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Email SMTP+IMAP modal ── */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-[#2a2a2a]">
              <div className="flex items-center gap-3">
                <span className="text-xl">📧</span>
                <div>
                  <h3 className="text-white font-semibold text-sm">E-posta Konfigürasyonu</h3>
                  <p className="text-gray-500 text-xs">SMTP (gönderici) ve IMAP (alıcı) ayarları</p>
                </div>
              </div>
              <button onClick={() => setShowEmailModal(false)} className="text-gray-400 hover:text-white"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Gönderici info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Gönderici Adı</label>
                  <input value={emailConfig.fromName} onChange={e => setEmailConfig(c => ({ ...c, fromName: e.target.value }))}
                    placeholder="Ki Business Destek" className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Gönderici E-posta</label>
                  <input value={emailConfig.fromEmail} onChange={e => setEmailConfig(c => ({ ...c, fromEmail: e.target.value }))}
                    placeholder="destek@sirketi.com" className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none" />
                </div>
              </div>

              {/* SMTP section */}
              <div>
                <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">📤 Gönderici (SMTP)</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">SMTP Sunucusu</label>
                    <input value={emailConfig.smtpHost} onChange={e => setEmailConfig(c => ({ ...c, smtpHost: e.target.value }))}
                      placeholder="smtp.gmail.com" className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Port</label>
                    <input value={emailConfig.smtpPort} onChange={e => setEmailConfig(c => ({ ...c, smtpPort: e.target.value }))}
                      placeholder="587" className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Kullanıcı Adı</label>
                    <input value={emailConfig.smtpUser} onChange={e => setEmailConfig(c => ({ ...c, smtpUser: e.target.value }))}
                      placeholder="user@gmail.com" className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Şifre</label>
                    <input type="password" value={emailConfig.smtpPassword} onChange={e => setEmailConfig(c => ({ ...c, smtpPassword: e.target.value }))}
                      placeholder={emailConfig.hasSmtpPassword ? 'Kayıtlı şifre mevcut' : 'Şifre girin'}
                      className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none" />
                  </div>
                </div>
                <label className="flex items-center gap-2 mt-2 text-xs text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={emailConfig.smtpSecure} onChange={e => setEmailConfig(c => ({ ...c, smtpSecure: e.target.checked }))} className="accent-teal-500" />
                  SSL/TLS (port 465)
                </label>
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={testSmtp} disabled={emailTestStatus.smtp === 'testing'}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 transition-all"
                    style={{ background: 'rgba(38,166,154,0.12)', color: '#26a69a', border: '1px solid rgba(38,166,154,0.25)' }}>
                    {emailTestStatus.smtp === 'testing' ? 'Test ediliyor...' : 'SMTP Test Et'}
                  </button>
                  {emailTestMsg.smtp && (
                    <span className={`text-xs ${emailTestStatus.smtp === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{emailTestMsg.smtp}</span>
                  )}
                </div>
              </div>

              {/* IMAP section */}
              <div>
                <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">📥 Alıcı (IMAP)</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">IMAP Sunucusu</label>
                    <input value={emailConfig.imapHost} onChange={e => setEmailConfig(c => ({ ...c, imapHost: e.target.value }))}
                      placeholder="imap.gmail.com" className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Port</label>
                    <input value={emailConfig.imapPort} onChange={e => setEmailConfig(c => ({ ...c, imapPort: e.target.value }))}
                      placeholder="993" className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Kullanıcı Adı</label>
                    <input value={emailConfig.imapUser} onChange={e => setEmailConfig(c => ({ ...c, imapUser: e.target.value }))}
                      placeholder="user@gmail.com" className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Şifre</label>
                    <input type="password" value={emailConfig.imapPassword} onChange={e => setEmailConfig(c => ({ ...c, imapPassword: e.target.value }))}
                      placeholder={emailConfig.hasImapPassword ? 'Kayıtlı şifre mevcut' : 'Şifre girin'}
                      className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Inbox Klasörü</label>
                    <input value={emailConfig.inboxFolder} onChange={e => setEmailConfig(c => ({ ...c, inboxFolder: e.target.value }))}
                      placeholder="INBOX" className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Kontrol Sıklığı (dakika)</label>
                    <input type="number" value={emailConfig.checkIntervalMinutes}
                      onChange={e => setEmailConfig(c => ({ ...c, checkIntervalMinutes: Number(e.target.value) }))}
                      min={1} max={60} className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none" />
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                    <input type="checkbox" checked={emailConfig.imapSecure} onChange={e => setEmailConfig(c => ({ ...c, imapSecure: e.target.checked }))} className="accent-teal-500" />
                    SSL/TLS (port 993)
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                    <input type="checkbox" checked={emailConfig.autoReply} onChange={e => setEmailConfig(c => ({ ...c, autoReply: e.target.checked }))} className="accent-teal-500" />
                    Otomatik AI yanıtı
                  </label>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={testImap} disabled={emailTestStatus.imap === 'testing'}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 transition-all"
                    style={{ background: 'rgba(38,166,154,0.12)', color: '#26a69a', border: '1px solid rgba(38,166,154,0.25)' }}>
                    {emailTestStatus.imap === 'testing' ? 'Test ediliyor...' : 'IMAP Test Et'}
                  </button>
                  {emailTestMsg.imap && (
                    <span className={`text-xs ${emailTestStatus.imap === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{emailTestMsg.imap}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-[#2a2a2a]">
              <button onClick={() => setShowEmailModal(false)} className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white">İptal</button>
              <button onClick={saveEmailConfig} disabled={savingEmail}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))', color: '#fff' }}>
                <Save size={14} />{savingEmail ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Navigasyon tab — visibility/order/role overrides over GET /nav-config ── */}
      {activeTab === 'navigation' && (
        <div className="space-y-6">
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>
            Sol menüdeki maddelerin sırasını, görünürlüğünü ve hangi rollerin görebileceğini
            buradan düzenleyin. Değişiklikler anında kaydedilir.
          </p>
          {navLoading && <p className="text-sm" style={{ color: 'var(--text-3)' }}>Yükleniyor...</p>}
          {!navLoading && navGroupsAdmin.map(group => {
            const items = navItems.filter(i => i.group === group.key)
            if (items.length === 0) return null
            return (
              <div key={group.key} className="rounded-2xl p-5"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                <h3 className="font-heading font-bold text-sm mb-3" style={{ color: 'var(--text-1)' }}>{group.label}</h3>
                <div className="space-y-1.5">
                  {items.map((item, idx) => {
                    const platformLocked = !!item.defaultRoles
                    return (
                      <div key={item.key} className="flex items-center gap-3 py-2 px-1 rounded-lg"
                        style={{ borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div className="flex flex-col">
                          <button onClick={() => moveNavItem(group.key, idx, -1)} disabled={idx === 0}
                            className="disabled:opacity-20" style={{ color: 'var(--text-3)' }}><ArrowUp size={11} /></button>
                          <button onClick={() => moveNavItem(group.key, idx, 1)} disabled={idx === items.length - 1}
                            className="disabled:opacity-20" style={{ color: 'var(--text-3)' }}><ArrowDown size={11} /></button>
                        </div>
                        <span className="text-sm flex-1" style={{ color: 'var(--text-1)' }}>
                          {item.label}
                          {item.kind === 'placeholder' && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface-3)', color: 'var(--text-3)' }}>Yakında</span>
                          )}
                        </span>
                        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-2)' }}>
                          <input type="checkbox" checked={item.isVisible} onChange={() => toggleNavVisible(item.key)} />
                          Görünür
                        </label>
                        {platformLocked ? (
                          <span className="text-xs" style={{ color: 'var(--text-3)' }}>Platform tarafından kısıtlı</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            {ENTITY_ROLES.map(r => {
                              const checked = item.allowedRoles == null || item.allowedRoles.includes(r.key)
                              return (
                                <label key={r.key} className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
                                  <input type="checkbox" checked={checked} onChange={() => toggleNavRole(item.key, r.key)} />
                                  {r.label}
                                </label>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── TOTP QR modal ── */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-[#111111] rounded-xl border border-[#2a2a2a] p-6 w-80">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Authenticator Kur</h3>
              <button onClick={() => setShowQrModal(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="flex justify-center mb-4">
              {qrData && <img src={qrData} alt="QR Kod" className="w-48 h-48" />}
            </div>
            <input
              type="text"
              maxLength={6}
              placeholder="6 haneli kod"
              value={totpCode}
              onChange={e => setTotpCode(e.target.value)}
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm text-center tracking-widest"
            />
            <button
              onClick={confirmTotp}
              className="w-full mt-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg"
            >
              Onayla
            </button>
          </div>
        </div>
      )}
      {/* Universal Connector Wizard */}
      {showCrmWizard && (
        <UniversalConnectorWizard
          onClose={() => { setShowCrmWizard(false); loadData() }}
          onDone={() => { setShowCrmWizard(false); loadData() }}
        />
      )}
    </div>
  )
}

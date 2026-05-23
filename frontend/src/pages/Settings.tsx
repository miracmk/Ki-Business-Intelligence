import { useEffect, useRef, useState } from 'react'
import {
  Database, Brain, User, MessageSquare, CreditCard, Shield,
  Plus, Trash2, Copy, Eye, EyeOff, QrCode, RefreshCw,
  AlertTriangle, CheckCircle, XCircle, X, Camera, Save,
  Mail, Phone, MapPin, Building2, ExternalLink,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../lib/api'

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
}

// ─── Static data ──────────────────────────────────────────────────────────────

interface OpenRouterModel {
  id: string
  name: string
  contextLength: number
}

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

// ─── Main component ───────────────────────────────────────────────────────────
export default function Settings() {
  const [activeTab, setActiveTab] = useState('account')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [saveMsg, setSaveMsg] = useState<string>('')

  const [tenant, setTenant] = useState<any>(null)
  const [userRole, setUserRole] = useState<string>('')
  const [accountSettings, setAccountSettings] = useState({ language: 'tr', timezone: 'Europe/Istanbul' })
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

  // AI config — tri-model architecture (analysis / vector / conversation)
  const [aiConfig, setAiConfig] = useState({
    provider: 'openrouter',
    apiKey: '',
    analysisModel: 'nvidia/llama-3.1-nemotron-70b-instruct:free',
    analysisF1: 'google/gemini-2.0-flash-exp:free',
    analysisF2: 'meta-llama/llama-3.3-70b-instruct:free',
    vectorModel: 'nvidia/llama-3.1-nemotron-70b-instruct:free',
    vectorF1: 'google/gemini-2.0-flash-exp:free',
    vectorF2: 'meta-llama/llama-3.3-70b-instruct:free',
    conversationModel: 'meta-llama/llama-3.3-70b-instruct:free',
    conversationFallback: 'google/gemini-2.0-flash-exp:free',
    conversationF2: '',
  })
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>([])
  const [loadingModels, setLoadingModels] = useState(false)

  const [showApiKey, setShowApiKey] = useState(false)
  const [showCrmModal, setShowCrmModal] = useState(false)
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

  const showSuccess = (msg: string) => { setSaveMsg(msg); setTimeout(() => setSaveMsg(''), 3000) }

  const loadData = async () => {
    try {
      setLoading(true)
      const [tenantRes, crmRes, accountingRes] = await Promise.all([
        api.get('/tenants/me'),
        api.get('/crm/connections'),
        api.get('/accounting/connections'),
      ])
      setTenant(tenantRes.data)
      setUserRole(tenantRes.data.role ?? '')
      setAccountSettings({
        language: tenantRes.data.tenant?.settings?.language ?? 'tr',
        timezone: tenantRes.data.tenant?.settings?.timezone ?? 'Europe/Istanbul',
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

  const loadAiConfig = async () => {
    try {
      const res = await api.get('/ai/config')
      const c = res.data.config
      setAiConfig(prev => ({
        ...prev,
        provider: c.provider ?? 'openrouter',
        analysisModel: c.analysisModel ?? prev.analysisModel,
        analysisF1: c.analysisFallbacks?.[0] ?? prev.analysisF1,
        analysisF2: c.analysisFallbacks?.[1] ?? prev.analysisF2,
        vectorModel: c.vectorModel ?? prev.vectorModel,
        vectorF1: c.vectorFallbacks?.[0] ?? prev.vectorF1,
        vectorF2: c.vectorFallbacks?.[1] ?? prev.vectorF2,
        conversationModel: c.conversationModel ?? prev.conversationModel,
        conversationFallback: c.conversationFallback ?? prev.conversationFallback,
        conversationF2: c.conversationF2 ?? prev.conversationF2,
      }))
    } catch { /* keep defaults */ }
  }

  const loadOpenRouterModels = async () => {
    try {
      setLoadingModels(true)
      const res = await api.get('/ai/openrouter-models')
      setOpenRouterModels(res.data.models ?? [])
    } catch { /* keep empty */ } finally {
      setLoadingModels(false)
    }
  }

  const refreshModels = async () => {
    try {
      setLoadingModels(true)
      await api.post('/ai/openrouter-models/refresh')
      const res = await api.get('/ai/openrouter-models')
      setOpenRouterModels(res.data.models ?? [])
    } catch (e: any) {
      setError(e.response?.data?.error || 'Modeller yenilenemedi')
    } finally {
      setLoadingModels(false)
    }
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (activeTab === 'ai') {
      loadAiConfig()
      loadOpenRouterModels()
    }
    if (activeTab === 'channels') {
      loadChannelConfigs()
    }
  }, [activeTab])

  const saveAccountSettings = async () => {
    try {
      await api.put('/tenants/me/settings', accountSettings)
      showSuccess('Dil ve zaman dilimi kaydedildi.')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Kaydedilemedi')
    }
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

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 1024 * 1024) { setError('Fotoğraf 1MB\'dan küçük olmalıdır.'); return }
    const reader = new FileReader()
    reader.onload = ev => setProfile(p => ({ ...p, avatar: ev.target?.result as string }))
    reader.readAsDataURL(file)
  }

  const openChannelModal = (channelKey: string) => {
    setEditingChannel(channelKey)
    setChannelForm(channelConfigs[channelKey] ?? {})
    setShowChannelModal(true)
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

  const saveAiConfig = async () => {
    try {
      await api.put('/tenants/ai-config', {
        provider: aiConfig.provider,
        ...(aiConfig.apiKey ? { apiKey: aiConfig.apiKey } : {}),
        analysisModel: aiConfig.analysisModel,
        analysisFallbacks: [aiConfig.analysisF1, aiConfig.analysisF2].filter(Boolean),
        vectorModel: aiConfig.vectorModel,
        vectorFallbacks: [aiConfig.vectorF1, aiConfig.vectorF2].filter(Boolean),
        conversationModel: aiConfig.conversationModel,
        conversationFallback: aiConfig.conversationFallback,
        conversationF2: aiConfig.conversationF2 || undefined,
      })
      showSuccess('AI ayarları kaydedildi.')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Kaydedilemedi')
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

  const modelInList = (modelId: string) => {
    if (!openRouterModels.length) return true
    return openRouterModels.some(m => m.id === modelId)
  }

  const ModelSelect = ({
    value,
    onChange,
    label,
  }: {
    value: string
    onChange: (v: string) => void
    label: string
  }) => {
    const inList = modelInList(value)
    return (
      <div>
        <div className="flex items-center gap-2 mb-1">
          <label className="text-gray-400 text-sm">{label}</label>
          {!inList && value && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-900/30 text-amber-400 rounded text-xs">
              <AlertTriangle size={10} />
              Free listesinden çıkarıldı
            </span>
          )}
        </div>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm"
        >
          {value && !openRouterModels.some(m => m.id === value) && (
            <option value={value}>{value} ⚠</option>
          )}
          {openRouterModels.map(m => (
            <option key={m.id} value={m.id}>
              {m.name || m.id} — {m.contextLength > 0 ? `${Math.round(m.contextLength / 1000)}k ctx` : '?'}
            </option>
          ))}
        </select>
      </div>
    )
  }

  const tabs = [
    { id: 'account',    label: 'Hesap',           icon: User },
    { id: 'ai',         label: 'AI Modeli',        icon: Brain },
    { id: 'crm',        label: 'CRM / ERP',        icon: Database },
    { id: 'accounting', label: 'Muhasebe',         icon: CreditCard },
    { id: 'channels',   label: 'Kanallar',         icon: MessageSquare },
    { id: 'security',   label: '2FA & Güvenlik',   icon: Shield },
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
                <input value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm" placeholder="+90 555 000 0000" />
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
            </div>
            <button onClick={saveAccountSettings} className="mt-4 px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm">Kaydet</button>
          </div>
        </div>
      )}

      {/* ── AI tab ── */}
      {activeTab === 'ai' && (
        <div className="space-y-6">
          {/* Admin notice */}
          {(userRole === 'admin' || userRole === 'supervisor') && !tenant?.tenant && (
            <div className="p-5 bg-blue-900/20 border border-blue-800/40 rounded-xl flex items-start gap-3">
              <Brain size={20} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-blue-300 font-medium text-sm mb-1">Platform AI Ayarları</p>
                <p className="text-blue-400/70 text-sm">Admin kullanıcılar için entity AI yapılandırması Platform Ayarları üzerinden yapılır.</p>
                <Link to="/app/admin/settings" className="mt-2 inline-flex items-center gap-1 text-blue-400 text-sm hover:text-blue-300">
                  Platform Ayarlarına Git <ExternalLink size={12} />
                </Link>
              </div>
            </div>
          )}
          <div className="p-6 bg-[#111111] rounded-xl border border-[#2a2a2a]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Entity AI Modeli Ayarları</h3>
              <button
                onClick={refreshModels}
                disabled={loadingModels}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#222] hover:bg-[#2a2a2a] text-gray-300 rounded-lg text-sm disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={14} className={loadingModels ? 'animate-spin' : ''} />
                Modelleri Yenile
              </button>
            </div>

            <div className="space-y-4 max-w-md mb-8">
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Sağlayıcı</label>
                <select
                  value={aiConfig.provider}
                  onChange={e => setAiConfig({ ...aiConfig, provider: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm"
                >
                  <option value="openrouter">OpenRouter (Önerilen — Ücretsiz modeller)</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google</option>
                  <option value="mistral">Mistral</option>
                  <option value="groq">Groq</option>
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">API Anahtarı</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={aiConfig.apiKey}
                    onChange={e => setAiConfig({ ...aiConfig, apiKey: e.target.value })}
                    placeholder="Boş bırakırsanız platform ücretsiz key kullanılır"
                    className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {loadingModels && (
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-6">
                <RefreshCw size={14} className="animate-spin" />
                Modeller yükleniyor...
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* DB Analysis */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-[#2a2a2a]">
                  <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }}></div>
                  <h4 className="text-white font-medium text-sm">DB Analiz</h4>
                </div>
                <span className="text-gray-500 text-xs block -mt-2">SQL · Yapısal sorgulama</span>
                <ModelSelect label="Birincil" value={aiConfig.analysisModel} onChange={v => setAiConfig({ ...aiConfig, analysisModel: v })} />
                <ModelSelect label="Yedek 1"  value={aiConfig.analysisF1}    onChange={v => setAiConfig({ ...aiConfig, analysisF1: v })} />
                <ModelSelect label="Yedek 2"  value={aiConfig.analysisF2}    onChange={v => setAiConfig({ ...aiConfig, analysisF2: v })} />
              </div>
              {/* Vector Analysis */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-[#2a2a2a]">
                  <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                  <h4 className="text-white font-medium text-sm">Vektör Analiz</h4>
                </div>
                <span className="text-gray-500 text-xs block -mt-2">Qdrant · Semantik arama</span>
                <ModelSelect label="Birincil" value={aiConfig.vectorModel} onChange={v => setAiConfig({ ...aiConfig, vectorModel: v })} />
                <ModelSelect label="Yedek 1"  value={aiConfig.vectorF1}   onChange={v => setAiConfig({ ...aiConfig, vectorF1: v })} />
                <ModelSelect label="Yedek 2"  value={aiConfig.vectorF2}   onChange={v => setAiConfig({ ...aiConfig, vectorF2: v })} />
              </div>
              {/* Conversation */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-[#2a2a2a]">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <h4 className="text-white font-medium text-sm">Konuşma</h4>
                </div>
                <span className="text-gray-500 text-xs block -mt-2">Müşteri yanıtları · Doğal dil</span>
                <ModelSelect label="Birincil" value={aiConfig.conversationModel}    onChange={v => setAiConfig({ ...aiConfig, conversationModel: v })} />
                <ModelSelect label="Yedek 1"  value={aiConfig.conversationFallback} onChange={v => setAiConfig({ ...aiConfig, conversationFallback: v })} />
                <ModelSelect label="Yedek 2"  value={aiConfig.conversationF2}       onChange={v => setAiConfig({ ...aiConfig, conversationF2: v })} />
              </div>
            </div>

            {openRouterModels.length > 0 && (() => {
              const staleModels = [
                aiConfig.analysisModel, aiConfig.analysisF1, aiConfig.analysisF2,
                aiConfig.vectorModel, aiConfig.vectorF1, aiConfig.vectorF2,
                aiConfig.conversationModel, aiConfig.conversationFallback, aiConfig.conversationF2,
              ].filter(m => m && !modelInList(m))
              if (!staleModels.length) return null
              return (
                <div className="mt-6 p-4 bg-amber-900/20 border border-amber-800/50 rounded-lg flex items-start gap-3">
                  <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-amber-300 text-sm font-medium mb-1">Bazı modeller artık ücretsiz listesinde yok</p>
                    <p className="text-amber-400/80 text-xs">{staleModels.join(' · ')}</p>
                    <p className="text-amber-400/60 text-xs mt-1">Bu modeller hata verebilir. Aktif listeden yeni model seçin.</p>
                  </div>
                </div>
              )
            })()}

            <div className="flex justify-end mt-6">
              <button onClick={saveAiConfig} className="px-5 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm font-medium transition-colors">
                Kaydet
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { name: 'Base', price: '$1.000/ay', features: ['1.500 entity garantisi', 'Özel eğitilmiş model', 'E-posta destek'] },
              { name: 'Pro', price: '$3.000/ay', features: ['Sınırsız entity', 'Öncelikli destek', 'Özel fine-tuning'] },
              { name: 'Enterprise', price: 'Özel fiyat', features: ['SLA garantisi', 'Dedicated instance', '7/24 destek'] },
            ].map((plan, i) => (
              <div key={i} className="p-6 bg-[#111111] rounded-xl border border-[#2a2a2a]">
                <h4 className="text-lg font-semibold text-white mb-2">{plan.name}</h4>
                <p className="text-2xl font-bold text-[#6366f1] mb-4">{plan.price}</p>
                <ul className="space-y-2 mb-6">
                  {plan.features.map((f, j) => (
                    <li key={j} className="text-gray-400 text-sm flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-[#6366f1] rounded-full"></div>
                      {f}
                    </li>
                  ))}
                </ul>
                <a href="mailto:sales@kibusiness.co" className="block w-full py-2 text-center border border-[#6366f1] text-[#6366f1] rounded-lg text-sm hover:bg-[#6366f1]/10">
                  İletişime Geç
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CRM / ERP tab ── */}
      {activeTab === 'crm' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">CRM / ERP Bağlantıları</h3>
            <button
              onClick={() => setShowCrmModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm"
            >
              <Plus size={16} />
              Yeni Bağlantı Ekle
            </button>
          </div>

          {crmConnections.length === 0 ? (
            <div className="p-8 bg-[#111111] rounded-xl border border-[#2a2a2a] text-center">
              <p className="text-gray-500">Henüz CRM / ERP bağlantısı yok</p>
            </div>
          ) : (
            <div className="space-y-3">
              {crmConnections.map(conn => (
                <div key={conn.id} className="p-4 bg-[#111111] rounded-xl border border-[#2a2a2a] flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-white font-medium">{conn.name}</p>
                      <span className={`px-2 py-0.5 rounded text-xs ${crmBadgeClass(conn.crmType)}`}>
                        {crmTypeLabel(conn.crmType)}
                      </span>
                    </div>
                    <div className="text-gray-500 text-sm">
                      {conn.lastSyncAt ? `Son sync: ${new Date(conn.lastSyncAt).toLocaleDateString('tr-TR')}` : 'Henüz sync yok'}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        conn.syncStatus === 'done'    ? 'bg-green-500'  :
                        conn.syncStatus === 'running' ? 'bg-yellow-500' :
                        conn.syncStatus === 'error'   ? 'bg-red-500'    : 'bg-gray-500'
                      }`}></div>
                      <span className="text-gray-400 text-xs">{conn.syncStatus || 'idle'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => metadataSync(conn.id)}
                      className="px-3 py-1.5 bg-[#222] hover:bg-[#2a2a2a] text-gray-300 rounded text-sm"
                    >
                      Metadata Sync
                    </button>
                    <button
                      onClick={() => deleteCrm(conn.id)}
                      className="p-2 text-red-400 hover:bg-red-900/20 rounded"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Accounting tab ── */}
      {activeTab === 'accounting' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Muhasebe Bağlantıları</h3>
            <button
              onClick={() => setShowAccountingModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm"
            >
              <Plus size={16} />
              Yeni Ekle
            </button>
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
    </div>
  )
}

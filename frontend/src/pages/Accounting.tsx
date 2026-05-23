import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import {
  Plus, Trash2, Edit2, X, RefreshCw, Send, FileText,
  TrendingUp, CreditCard, Check, AlertCircle,
  ArrowUpRight, ArrowDownRight, Link2,
} from 'lucide-react'
import api from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Contact { id: string; name: string; contactType: string; email?: string; phone?: string; taxNumber?: string; balance?: number }
interface Invoice { id: string; invoiceNumber: string; invoiceType: string; contactId?: string; issueDate?: string; dueDate?: string; total?: number; status?: string; paidAmount?: number }
interface Payment { id: string; paymentType: string; amount: number; currencyCode?: string; paymentMethod?: string; status?: string; reference?: string }
interface Expense { id: string; expenseDate?: string; category?: string; description?: string; amount?: number; status?: string }
interface PayIntegration { id: string; provider: string; name: string; isActive: boolean }
interface BankIntegration { id: string; provider: string; bankName: string; country: string; isActive: boolean }
interface AccConn { id: string; name: string; accountingType: string; isActive: boolean; lastSyncAt?: string }

// ── Constants ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview', label: 'Özet' },
  { id: 'invoices', label: 'Faturalar' },
  { id: 'payments', label: 'Ödemeler' },
  { id: 'contacts', label: 'Kişiler' },
  { id: 'expenses', label: 'Giderler' },
  { id: 'reports', label: 'Raporlar' },
  { id: 'integrations', label: 'Entegrasyonlar' },
]

const PAYMENT_PROVIDERS = [
  { id: 'stripe', label: 'Stripe' },
  { id: 'paypal', label: 'PayPal' },
  { id: 'iyzico', label: 'Iyzico' },
  { id: 'papara', label: 'Papara' },
  { id: 'wise', label: 'Wise' },
  { id: 'revolut', label: 'Revolut' },
]

const BANK_PROVIDERS = [
  { id: 'plaid', label: 'Plaid' },
  { id: 'yapily', label: 'Yapily' },
  { id: 'saltedge', label: 'SaltEdge' },
  { id: 'nordigen', label: 'Nordigen (GoCardless)' },
]

const ACCOUNTING_TYPES = [
  { id: 'quickbooks', label: 'QuickBooks' },
  { id: 'xero', label: 'Xero' },
  { id: 'zoho_books', label: 'Zoho Books' },
  { id: 'wave', label: 'Wave' },
  { id: 'freshbooks', label: 'FreshBooks' },
  { id: 'sage_accounting', label: 'Sage Accounting' },
  { id: 'dynamics_finance', label: 'Dynamics 365 Finance' },
  { id: 'iyzico', label: 'Iyzico Muhasebe' },
  { id: 'parasut', label: 'Paraşüt' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number, currency = 'TRY') =>
  n.toLocaleString('tr-TR', { style: 'currency', currency, minimumFractionDigits: 2 })

const STATUS_CLS: Record<string, string> = {
  draft: 'bg-gray-700 text-gray-300', sent: 'bg-blue-900 text-blue-300',
  paid: 'bg-green-900 text-green-300', overdue: 'bg-red-900 text-red-300',
  pending: 'bg-yellow-900 text-yellow-300', approved: 'bg-green-900 text-green-300',
  completed: 'bg-green-900 text-green-300', rejected: 'bg-red-900 text-red-300',
  cancelled: 'bg-gray-700 text-gray-300',
}
const STATUS_LBL: Record<string, string> = {
  draft: 'Taslak', sent: 'Gönderildi', paid: 'Ödendi', overdue: 'Gecikmiş',
  pending: 'Bekliyor', approved: 'Onaylandı', completed: 'Tamamlandı',
  rejected: 'Reddedildi', cancelled: 'İptal',
}

function StatusBadge({ s }: { s?: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_CLS[s ?? ''] ?? 'bg-gray-700 text-gray-300'}`}>
      {STATUS_LBL[s ?? ''] ?? s ?? '-'}
    </span>
  )
}

const iCls = 'w-full px-3 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-white text-sm focus:outline-none focus:border-[#6366f1]'

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-gray-400">{label}</label><div className="mt-1">{children}</div></div>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#0f0f0f] rounded-3xl border border-[#2a2a2a] p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-white" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Credential form components ────────────────────────────────────────────────
function PaymentCredForm({ provider, value, onChange }: { provider: string; value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const f = (k: string, lbl: string, t = 'text') => (
    <F key={k} label={lbl}><input type={t} value={value[k] ?? ''} onChange={e => onChange({ ...value, [k]: e.target.value })} className={iCls} /></F>
  )
  const s = (k: string, lbl: string, opts: string[]) => (
    <F key={k} label={lbl}><select value={value[k] ?? opts[0]} onChange={e => onChange({ ...value, [k]: e.target.value })} className={iCls}>{opts.map(o => <option key={o} value={o}>{o}</option>)}</select></F>
  )
  if (provider === 'stripe') return <div className="space-y-3">{f('secretKey', 'Secret Key', 'password')}{f('webhookSecret', 'Webhook Secret', 'password')}{s('mode', 'Mod', ['live', 'test'])}</div>
  if (provider === 'paypal') return <div className="space-y-3">{f('clientId', 'Client ID')}{f('clientSecret', 'Client Secret', 'password')}{s('mode', 'Mod', ['live', 'sandbox'])}</div>
  if (provider === 'iyzico') return <div className="space-y-3">{f('apiKey', 'API Key')}{f('secretKey', 'Secret Key', 'password')}{s('env', 'Ortam', ['production', 'sandbox'])}</div>
  if (provider === 'papara') return <div className="space-y-3">{f('apiKey', 'API Key')}{s('env', 'Ortam', ['production', 'sandbox'])}</div>
  if (provider === 'wise') return <div className="space-y-3">{f('apiToken', 'API Token', 'password')}{s('environment', 'Ortam', ['production', 'sandbox'])}</div>
  if (provider === 'revolut') return <div className="space-y-3">{f('apiKey', 'API Key', 'password')}{s('environment', 'Ortam', ['production', 'sandbox'])}</div>
  return null
}

function BankCredForm({ provider, value, onChange }: { provider: string; value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const f = (k: string, lbl: string, t = 'text') => (
    <F key={k} label={lbl}><input type={t} value={value[k] ?? ''} onChange={e => onChange({ ...value, [k]: e.target.value })} className={iCls} /></F>
  )
  const s = (k: string, lbl: string, opts: string[]) => (
    <F key={k} label={lbl}><select value={value[k] ?? opts[0]} onChange={e => onChange({ ...value, [k]: e.target.value })} className={iCls}>{opts.map(o => <option key={o} value={o}>{o}</option>)}</select></F>
  )
  if (provider === 'plaid') return <div className="space-y-3">{f('clientId', 'Client ID')}{f('secret', 'Secret', 'password')}{s('env', 'Ortam', ['sandbox', 'development', 'production'])}</div>
  if (provider === 'yapily') return <div className="space-y-3">{f('applicationId', 'Application ID')}{f('applicationSecret', 'Application Secret', 'password')}</div>
  if (provider === 'saltedge') return <div className="space-y-3">{f('appId', 'App ID')}{f('secret', 'Secret', 'password')}{f('customerIdentifier', 'Customer Identifier')}</div>
  if (provider === 'nordigen') return <div className="space-y-3">{f('secretId', 'Secret ID')}{f('secretKey', 'Secret Key', 'password')}</div>
  return null
}

function AccCredForm({ type, value, onChange }: { type: string; value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const f = (k: string, lbl: string, t = 'text') => (
    <F key={k} label={lbl}><input type={t} value={value[k] ?? ''} onChange={e => onChange({ ...value, [k]: e.target.value })} className={iCls} /></F>
  )
  if (type === 'quickbooks') return <div className="space-y-3">{f('clientId', 'Client ID')}{f('clientSecret', 'Client Secret', 'password')}{f('refreshToken', 'Refresh Token', 'password')}{f('realmId', 'Realm ID')}</div>
  if (type === 'xero') return <div className="space-y-3">{f('clientId', 'Client ID')}{f('clientSecret', 'Client Secret', 'password')}{f('refreshToken', 'Refresh Token', 'password')}</div>
  if (type === 'zoho_books') return <div className="space-y-3">{f('clientId', 'Client ID')}{f('clientSecret', 'Client Secret', 'password')}{f('refreshToken', 'Refresh Token', 'password')}{f('organizationId', 'Org ID')}</div>
  if (type === 'wave') return <div className="space-y-3">{f('accessToken', 'Access Token', 'password')}{f('businessId', 'Business ID')}</div>
  if (type === 'freshbooks') return <div className="space-y-3">{f('clientId', 'Client ID')}{f('clientSecret', 'Client Secret', 'password')}{f('refreshToken', 'Refresh Token', 'password')}</div>
  if (type === 'sage_accounting') return <div className="space-y-3">{f('clientId', 'Client ID')}{f('clientSecret', 'Client Secret', 'password')}{f('refreshToken', 'Refresh Token', 'password')}</div>
  if (type === 'dynamics_finance') return <div className="space-y-3">{f('tenantId', 'Tenant ID')}{f('clientId', 'Client ID')}{f('clientSecret', 'Client Secret', 'password')}{f('environmentName', 'Environment')}</div>
  if (type === 'iyzico') return <div className="space-y-3">{f('apiKey', 'API Key')}{f('secretKey', 'Secret Key', 'password')}</div>
  if (type === 'parasut') return <div className="space-y-3">{f('clientId', 'Client ID')}{f('clientSecret', 'Client Secret', 'password')}{f('username', 'Kullanıcı Adı')}{f('password', 'Şifre', 'password')}{f('companyId', 'Company ID')}</div>
  return null
}

// ── Integrations Tab ──────────────────────────────────────────────────────────
function IntegrationsTab({ paymentIntegrations, bankIntegrations, accountingConns, onReload }: {
  paymentIntegrations: PayIntegration[]
  bankIntegrations: BankIntegration[]
  accountingConns: AccConn[]
  onReload: () => void
}) {
  const [section, setSection] = useState<'payment' | 'bank' | 'accounting'>('payment')
  const [payForm, setPayForm] = useState({ provider: 'stripe', name: '', creds: {} as Record<string, string> })
  const [bankForm, setBankForm] = useState({ provider: 'plaid', bankName: '', country: 'TR', creds: {} as Record<string, string> })
  const [accForm, setAccForm] = useState({ accountingType: 'quickbooks', name: '', creds: {} as Record<string, string> })
  const [accTestStatus, setAccTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [accTestError, setAccTestError] = useState('')
  const [saving, setSaving] = useState(false)

  const testAcc = async () => {
    setAccTestStatus('testing'); setAccTestError('')
    try {
      const { data } = await api.post('/accounting/connections/test', { accountingType: accForm.accountingType, credentials: accForm.creds })
      setAccTestStatus(data.ok ? 'ok' : 'error')
      if (!data.ok) setAccTestError(data.error ?? 'Bağlantı başarısız')
    } catch { setAccTestStatus('error'); setAccTestError('Sunucu hatası') }
  }

  const savePayment = async () => {
    setSaving(true)
    try {
      await api.post('/accounting/payment-integrations', { provider: payForm.provider, name: payForm.name || payForm.provider, credentials: payForm.creds })
      setPayForm({ provider: 'stripe', name: '', creds: {} }); onReload()
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  const saveBank = async () => {
    setSaving(true)
    try {
      await api.post('/accounting/bank-integrations', { provider: bankForm.provider, bankName: bankForm.bankName || bankForm.provider, country: bankForm.country, credentials: bankForm.creds })
      setBankForm({ provider: 'plaid', bankName: '', country: 'TR', creds: {} }); onReload()
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  const saveAcc = async () => {
    if (accTestStatus !== 'ok') return
    setSaving(true)
    try {
      await api.post('/accounting/connections', { accountingType: accForm.accountingType, name: accForm.name || accForm.accountingType, credentials: accForm.creds })
      setAccForm({ accountingType: 'quickbooks', name: '', creds: {} }); setAccTestStatus('idle'); onReload()
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-3 flex-wrap">
        {([['payment', 'Ödeme Entegrasyonları'], ['bank', 'Banka Entegrasyonları'], ['accounting', 'Muhasebe Sync']] as const).map(([id, lbl]) => (
          <button key={id} onClick={() => setSection(id)} className={`px-4 py-2 rounded-2xl text-sm font-medium ${section === id ? 'bg-[#6366f1] text-white' : 'bg-[#111111] text-gray-300 border border-[#2a2a2a]'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {section === 'payment' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="p-6 bg-[#111111] rounded-3xl border border-[#2a2a2a] space-y-4">
            <h3 className="text-base font-semibold text-white">Yeni Ödeme Entegrasyonu</h3>
            <F label="Sağlayıcı">
              <select value={payForm.provider} onChange={e => setPayForm({ ...payForm, provider: e.target.value, creds: {} })} className={iCls}>
                {PAYMENT_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </F>
            <F label="İsim (opsiyonel)">
              <input value={payForm.name} onChange={e => setPayForm({ ...payForm, name: e.target.value })} className={iCls} placeholder={payForm.provider} />
            </F>
            <PaymentCredForm provider={payForm.provider} value={payForm.creds} onChange={creds => setPayForm({ ...payForm, creds })} />
            <button onClick={savePayment} disabled={saving} className="w-full px-4 py-2.5 rounded-2xl bg-[#6366f1] text-white text-sm disabled:opacity-50">
              {saving ? 'Kaydediliyor...' : 'Ekle'}
            </button>
          </div>
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-white">Bağlı Ödeme Sistemleri</h3>
            {paymentIntegrations.length === 0 ? (
              <p className="text-gray-500 text-sm">Henüz ödeme entegrasyonu yok.</p>
            ) : paymentIntegrations.map(pi => (
              <div key={pi.id} className="flex items-center justify-between gap-3 p-4 bg-[#111111] rounded-2xl border border-[#2a2a2a]">
                <div>
                  <p className="text-white text-sm font-medium">{pi.name}</p>
                  <p className="text-xs text-gray-400">{pi.provider}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${pi.isActive ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
                    {pi.isActive ? 'Aktif' : 'Pasif'}
                  </span>
                  <button onClick={async () => { await api.delete(`/accounting/payment-integrations/${pi.id}`); onReload() }} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-red-400"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {section === 'bank' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="p-6 bg-[#111111] rounded-3xl border border-[#2a2a2a] space-y-4">
            <h3 className="text-base font-semibold text-white">Yeni Banka Entegrasyonu</h3>
            <F label="Sağlayıcı">
              <select value={bankForm.provider} onChange={e => setBankForm({ ...bankForm, provider: e.target.value, creds: {} })} className={iCls}>
                {BANK_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </F>
            <F label="Banka Adı"><input value={bankForm.bankName} onChange={e => setBankForm({ ...bankForm, bankName: e.target.value })} className={iCls} placeholder="Örn: Garanti BBVA" /></F>
            <F label="Ülke"><input value={bankForm.country} onChange={e => setBankForm({ ...bankForm, country: e.target.value })} className={iCls} placeholder="TR" /></F>
            <BankCredForm provider={bankForm.provider} value={bankForm.creds} onChange={creds => setBankForm({ ...bankForm, creds })} />
            <button onClick={saveBank} disabled={saving} className="w-full px-4 py-2.5 rounded-2xl bg-[#6366f1] text-white text-sm disabled:opacity-50">
              {saving ? 'Kaydediliyor...' : 'Ekle'}
            </button>
          </div>
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-white">Bağlı Bankalar</h3>
            {bankIntegrations.length === 0 ? (
              <p className="text-gray-500 text-sm">Henüz banka entegrasyonu yok.</p>
            ) : bankIntegrations.map(b => (
              <div key={b.id} className="flex items-center justify-between gap-3 p-4 bg-[#111111] rounded-2xl border border-[#2a2a2a]">
                <div>
                  <p className="text-white text-sm font-medium">{b.bankName}</p>
                  <p className="text-xs text-gray-400">{b.provider} · {b.country}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${b.isActive ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
                    {b.isActive ? 'Aktif' : 'Pasif'}
                  </span>
                  <button onClick={async () => { await api.delete(`/accounting/bank-integrations/${b.id}`); onReload() }} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-red-400"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {section === 'accounting' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="p-6 bg-[#111111] rounded-3xl border border-[#2a2a2a] space-y-4">
            <h3 className="text-base font-semibold text-white">Harici Muhasebe Bağlantısı</h3>
            <F label="Platform">
              <select value={accForm.accountingType} onChange={e => { setAccForm({ ...accForm, accountingType: e.target.value, creds: {} }); setAccTestStatus('idle') }} className={iCls}>
                {ACCOUNTING_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </F>
            <F label="Bağlantı İsmi">
              <input value={accForm.name} onChange={e => setAccForm({ ...accForm, name: e.target.value })} className={iCls} placeholder={ACCOUNTING_TYPES.find(t => t.id === accForm.accountingType)?.label} />
            </F>
            <AccCredForm type={accForm.accountingType} value={accForm.creds} onChange={creds => { setAccForm({ ...accForm, creds }); setAccTestStatus('idle') }} />
            <div className="flex items-center gap-3">
              <button onClick={testAcc} disabled={accTestStatus === 'testing'} className="flex-1 px-4 py-2.5 rounded-2xl border border-[#2a2a2a] text-sm text-gray-300 hover:text-white disabled:opacity-50">
                {accTestStatus === 'testing' ? 'Test ediliyor...' : 'Bağlantıyı Test Et'}
              </button>
              {accTestStatus === 'ok' && <span className="flex items-center gap-1 text-green-400 text-sm whitespace-nowrap"><Check size={14} /> Başarılı</span>}
              {accTestStatus === 'error' && <span className="flex items-center gap-1 text-red-400 text-sm whitespace-nowrap"><AlertCircle size={14} /> Hata</span>}
            </div>
            {accTestStatus === 'error' && accTestError && <p className="text-xs text-red-400">{accTestError}</p>}
            <button onClick={saveAcc} disabled={accTestStatus !== 'ok' || saving} className="w-full px-4 py-2.5 rounded-2xl bg-[#6366f1] text-white text-sm disabled:opacity-50">
              {saving ? 'Kaydediliyor...' : 'Kaydet ve Bağla'}
            </button>
          </div>
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-white">Bağlı Muhasebe Sistemleri</h3>
            {accountingConns.length === 0 ? (
              <p className="text-gray-500 text-sm">Henüz harici muhasebe bağlantısı yok.</p>
            ) : accountingConns.map(c => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-4 bg-[#111111] rounded-2xl border border-[#2a2a2a]">
                <div>
                  <p className="text-white text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.accountingType}</p>
                  {c.lastSyncAt && <p className="text-xs text-gray-500">Son sync: {new Date(c.lastSyncAt).toLocaleDateString('tr-TR')}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={async () => { await api.post(`/accounting/connections/${c.id}/sync`); onReload() }} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-blue-400" title="Senkronize et">
                    <RefreshCw size={14} />
                  </button>
                  <button onClick={async () => { await api.delete(`/accounting/connections/${c.id}`); onReload() }} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-red-400"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
const TAB_MAP: Record<string, string> = { summary: 'overview', invoices: 'invoices', payments: 'payments', contacts: 'contacts', expenses: 'expenses', reports: 'reports', integrations: 'integrations' }

export default function Accounting() {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState(() => {
    const p = searchParams.get('tab')
    return p ? (TAB_MAP[p] ?? p) : 'overview'
  })
  const [contacts, setContacts] = useState<Contact[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [paymentIntegrations, setPaymentIntegrations] = useState<PayIntegration[]>([])
  const [bankIntegrations, setBankIntegrations] = useState<BankIntegration[]>([])
  const [accountingConns, setAccountingConns] = useState<AccConn[]>([])
  const [reports, setReports] = useState<any>(null)
  const [cashFlow, setCashFlow] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const [contactModal, setContactModal] = useState<any>(null)
  const [invoiceModal, setInvoiceModal] = useState<any>(null)
  const [paymentModal, setPaymentModal] = useState<any>(null)
  const [expenseModal, setExpenseModal] = useState<any>(null)

  const loadAll = async () => {
    setLoading(true)
    try {
      const [c, i, p, e, pi, bi, ac] = await Promise.all([
        api.get('/accounting/contacts').then(r => r.data.contacts ?? []),
        api.get('/accounting/invoices').then(r => r.data.invoices ?? []),
        api.get('/accounting/payments').then(r => r.data.payments ?? []),
        api.get('/accounting/expenses').then(r => r.data.expenses ?? []),
        api.get('/accounting/payment-integrations').then(r => r.data.integrations ?? []),
        api.get('/accounting/bank-integrations').then(r => r.data.banks ?? []),
        api.get('/accounting/connections').then(r => r.data.connections ?? []),
      ])
      setContacts(c); setInvoices(i); setPayments(p); setExpenses(e)
      setPaymentIntegrations(pi); setBankIntegrations(bi); setAccountingConns(ac)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  const loadReports = async () => {
    const from = new Date(); from.setMonth(from.getMonth() - 12)
    const fromStr = from.toISOString().slice(0, 10)
    const toStr = new Date().toISOString().slice(0, 10)
    try {
      const [inc, cf] = await Promise.all([
        api.get(`/accounting/reports/income-statement?from=${fromStr}&to=${toStr}`).then(r => r.data),
        api.get(`/accounting/reports/cash-flow?from=${fromStr}&to=${toStr}`).then(r => r.data),
      ])
      setReports(inc); setCashFlow(cf)
    } catch (err) { console.error(err) }
  }

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (tab === 'reports') loadReports() }, [tab])
  useEffect(() => {
    const p = searchParams.get('tab')
    if (p) setTab(TAB_MAP[p] ?? p)
  }, [searchParams])

  // Derived stats
  const now = new Date()
  const thisMonth = now.toISOString().slice(0, 7)
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonth = lastMonthDate.toISOString().slice(0, 7)

  const thisMonthRevenue  = invoices.filter(i => i.invoiceType === 'sale' && i.issueDate?.startsWith(thisMonth)).reduce((s, i) => s + (i.total ?? 0), 0)
  const lastMonthRevenue  = invoices.filter(i => i.invoiceType === 'sale' && i.issueDate?.startsWith(lastMonth)).reduce((s, i) => s + (i.total ?? 0), 0)
  const totalRevenue      = invoices.filter(i => i.invoiceType === 'sale').reduce((s, i) => s + (i.total ?? 0), 0)
  const totalExpenses     = expenses.reduce((s, e) => s + (e.amount ?? 0), 0)
  const receivables       = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled').reduce((s, i) => s + ((i.total ?? 0) - (i.paidAmount ?? 0)), 0)
  const unpaidInvoices    = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled' && i.status !== 'draft')

  const revenueDelta = lastMonthRevenue > 0 ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0

  const monthlyData = (() => {
    const months: Record<string, { month: string; revenue: number; expenses: number }> = {}
    invoices.forEach(inv => {
      const d = inv.issueDate?.slice(0, 7) ?? ''; if (!d) return
      if (!months[d]) months[d] = { month: d, revenue: 0, expenses: 0 }
      if (inv.invoiceType === 'sale') months[d].revenue += inv.total ?? 0
    })
    expenses.forEach(exp => {
      const d = exp.expenseDate?.slice(0, 7) ?? ''; if (!d) return
      if (!months[d]) months[d] = { month: d, revenue: 0, expenses: 0 }
      months[d].expenses += exp.amount ?? 0
    })
    return Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).slice(-6)
  })()

  // ── Modals ──
  function ContactModal() {
    const [form, setForm] = useState(contactModal?.data ?? {
      contactType: 'individual', name: '', email: '', phone: '',
      taxNumber: '', taxOffice: '', address: '', country: 'TR', currencyCode: 'TRY',
    })
    const save = async () => {
      contactModal?.id ? await api.put(`/accounting/contacts/${contactModal.id}`, form) : await api.post('/accounting/contacts', form)
      setContactModal(null); loadAll()
    }
    return (
      <Modal title={contactModal?.id ? 'Kişi Düzenle' : 'Yeni Kişi'} onClose={() => setContactModal(null)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Tür"><select value={form.contactType} onChange={e => setForm({ ...form, contactType: e.target.value })} className={iCls}><option value="individual">Bireysel</option><option value="corporate">Kurumsal</option></select></F>
          <F label="Ad / Firma"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={iCls} /></F>
          <F label="Email"><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={iCls} /></F>
          <F label="Telefon"><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={iCls} /></F>
          <F label="Vergi No"><input value={form.taxNumber} onChange={e => setForm({ ...form, taxNumber: e.target.value })} className={iCls} /></F>
          <F label="Vergi Dairesi"><input value={form.taxOffice} onChange={e => setForm({ ...form, taxOffice: e.target.value })} className={iCls} /></F>
          <F label="Ülke"><input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} className={iCls} /></F>
          <F label="Para Birimi"><input value={form.currencyCode} onChange={e => setForm({ ...form, currencyCode: e.target.value })} className={iCls} /></F>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setContactModal(null)} className="px-4 py-2 rounded-2xl border border-[#2a2a2a] text-gray-400">İptal</button>
          <button onClick={save} className="px-4 py-2 rounded-2xl bg-[#6366f1] text-white">Kaydet</button>
        </div>
      </Modal>
    )
  }

  function InvoiceModal() {
    const [form, setForm] = useState(invoiceModal?.data ?? {
      invoiceType: 'sale', contactId: '', issueDate: new Date().toISOString().slice(0, 10),
      dueDate: '', currencyCode: 'TRY', subtotal: 0, taxTotal: 0, discountTotal: 0, total: 0, status: 'draft', notes: '',
    })
    const recalc = (patch: Partial<typeof form>) => {
      const m = { ...form, ...patch }
      m.total = (m.subtotal ?? 0) + (m.taxTotal ?? 0) - (m.discountTotal ?? 0)
      setForm(m)
    }
    const save = async () => {
      invoiceModal?.id ? await api.put(`/accounting/invoices/${invoiceModal.id}`, form) : await api.post('/accounting/invoices', form)
      setInvoiceModal(null); loadAll()
    }
    return (
      <Modal title={invoiceModal?.id ? 'Fatura Düzenle' : 'Yeni Fatura'} onClose={() => setInvoiceModal(null)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Tür"><select value={form.invoiceType} onChange={e => setForm({ ...form, invoiceType: e.target.value })} className={iCls}><option value="sale">Satış</option><option value="purchase">Alım</option></select></F>
          <F label="Kişi"><select value={form.contactId} onChange={e => setForm({ ...form, contactId: e.target.value })} className={iCls}><option value="">Seçin...</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></F>
          <F label="Düzenleme Tarihi"><input type="date" value={form.issueDate} onChange={e => setForm({ ...form, issueDate: e.target.value })} className={iCls} /></F>
          <F label="Vade Tarihi"><input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className={iCls} /></F>
          <F label="Ara Toplam"><input type="number" value={form.subtotal} onChange={e => recalc({ subtotal: Number(e.target.value) })} className={iCls} /></F>
          <F label="KDV"><input type="number" value={form.taxTotal} onChange={e => recalc({ taxTotal: Number(e.target.value) })} className={iCls} /></F>
          <F label="İndirim"><input type="number" value={form.discountTotal} onChange={e => recalc({ discountTotal: Number(e.target.value) })} className={iCls} /></F>
          <F label="Toplam"><input type="number" value={form.total} onChange={e => setForm({ ...form, total: Number(e.target.value) })} className={iCls} /></F>
          <F label="Durum"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={iCls}><option value="draft">Taslak</option><option value="sent">Gönderildi</option><option value="paid">Ödendi</option><option value="overdue">Gecikmiş</option><option value="cancelled">İptal</option></select></F>
          <F label="Para Birimi"><input value={form.currencyCode} onChange={e => setForm({ ...form, currencyCode: e.target.value })} className={iCls} /></F>
        </div>
        <F label="Notlar"><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className={iCls} /></F>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setInvoiceModal(null)} className="px-4 py-2 rounded-2xl border border-[#2a2a2a] text-gray-400">İptal</button>
          <button onClick={save} className="px-4 py-2 rounded-2xl bg-[#6366f1] text-white">Kaydet</button>
        </div>
      </Modal>
    )
  }

  function PaymentModal() {
    const [form, setForm] = useState({
      paymentType: 'received', amount: 0, currencyCode: 'TRY',
      paymentMethod: 'bank_transfer', reference: '', notes: '', status: 'completed', contactId: '', invoiceId: '',
    })
    const save = async () => {
      await api.post('/accounting/payments', form)
      setPaymentModal(null); loadAll()
    }
    return (
      <Modal title="Yeni Ödeme" onClose={() => setPaymentModal(null)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Tür"><select value={form.paymentType} onChange={e => setForm({ ...form, paymentType: e.target.value })} className={iCls}><option value="received">Alınan</option><option value="sent">Gönderilen</option></select></F>
          <F label="Tutar"><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} className={iCls} /></F>
          <F label="Yöntem"><select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} className={iCls}><option value="bank_transfer">Banka Havalesi</option><option value="credit_card">Kredi Kartı</option><option value="cash">Nakit</option><option value="check">Çek</option><option value="online">Online</option></select></F>
          <F label="Referans No"><input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} className={iCls} /></F>
          <F label="Kişi"><select value={form.contactId} onChange={e => setForm({ ...form, contactId: e.target.value })} className={iCls}><option value="">Seçin...</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></F>
          <F label="Fatura"><select value={form.invoiceId} onChange={e => setForm({ ...form, invoiceId: e.target.value })} className={iCls}><option value="">Seçin...</option>{invoices.map(i => <option key={i.id} value={i.id}>{i.invoiceNumber}</option>)}</select></F>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setPaymentModal(null)} className="px-4 py-2 rounded-2xl border border-[#2a2a2a] text-gray-400">İptal</button>
          <button onClick={save} className="px-4 py-2 rounded-2xl bg-[#6366f1] text-white">Kaydet</button>
        </div>
      </Modal>
    )
  }

  function ExpenseModal() {
    const [form, setForm] = useState(expenseModal?.data ?? {
      expenseDate: new Date().toISOString().slice(0, 10),
      category: 'general', description: '', amount: 0, currencyCode: 'TRY', status: 'pending',
    })
    const save = async () => {
      expenseModal?.id ? await api.put(`/accounting/expenses/${expenseModal.id}`, form) : await api.post('/accounting/expenses', form)
      setExpenseModal(null); loadAll()
    }
    return (
      <Modal title={expenseModal?.id ? 'Gider Düzenle' : 'Yeni Gider'} onClose={() => setExpenseModal(null)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Tarih"><input type="date" value={form.expenseDate} onChange={e => setForm({ ...form, expenseDate: e.target.value })} className={iCls} /></F>
          <F label="Kategori"><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={iCls}><option value="general">Genel</option><option value="salary">Maaş</option><option value="rent">Kira</option><option value="utilities">Faturalar</option><option value="marketing">Pazarlama</option><option value="software">Yazılım</option><option value="travel">Seyahat</option><option value="other">Diğer</option></select></F>
          <div className="sm:col-span-2"><F label="Açıklama"><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={iCls} /></F></div>
          <F label="Tutar"><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} className={iCls} /></F>
          <F label="Durum"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={iCls}><option value="pending">Bekliyor</option><option value="approved">Onaylandı</option><option value="rejected">Reddedildi</option></select></F>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setExpenseModal(null)} className="px-4 py-2 rounded-2xl border border-[#2a2a2a] text-gray-400">İptal</button>
          <button onClick={save} className="px-4 py-2 rounded-2xl bg-[#6366f1] text-white">Kaydet</button>
        </div>
      </Modal>
    )
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Muhasebe</h1>
          <p className="text-gray-400">Fatura, ödeme ve finansal yönetim</p>
        </div>
        <button onClick={loadAll} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-gray-300 hover:text-white">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-2xl text-sm font-medium whitespace-nowrap ${tab === t.id ? 'bg-[#6366f1] text-white' : 'bg-[#111111] text-gray-300 border border-[#2a2a2a]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Modals */}
      {contactModal !== null && <ContactModal />}
      {invoiceModal !== null && <InvoiceModal />}
      {paymentModal !== null && <PaymentModal />}
      {expenseModal !== null && <ExpenseModal />}

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* CTA — no connections */}
          {accountingConns.length === 0 && (
            <div className="p-6 rounded-3xl border border-dashed border-[#3a3a3a] flex flex-col sm:flex-row items-center gap-4 bg-[#111111]">
              <Link2 size={32} className="text-[#6366f1] flex-shrink-0" />
              <div className="flex-1 text-center sm:text-left">
                <p className="text-white font-semibold">Muhasebe Yazılımı Bağla</p>
                <p className="text-gray-400 text-sm mt-0.5">Zoho Books, QuickBooks, Xero veya diğerlerini bağlayarak muhasebe verilerinizi buraya çekin.</p>
              </div>
              <button onClick={() => setTab('integrations')}
                className="px-5 py-2.5 rounded-2xl text-sm font-medium flex-shrink-0"
                style={{ background: '#6366f1', color: '#fff' }}>
                Bağlantı Ekle
              </button>
            </div>
          )}

          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="p-5 bg-[#111111] rounded-3xl border border-[#2a2a2a]">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-xl bg-gradient-to-br from-green-600 to-emerald-600"><TrendingUp size={14} className="text-white" /></div>
                <p className="text-xs text-gray-400">Bu Ay Gelir</p>
              </div>
              <p className="text-xl font-bold text-white">{fmt(thisMonthRevenue)}</p>
              {lastMonthRevenue > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  {revenueDelta >= 0
                    ? <ArrowUpRight size={12} className="text-green-400" />
                    : <ArrowDownRight size={12} className="text-red-400" />}
                  <span className={`text-xs ${revenueDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {Math.abs(revenueDelta).toFixed(1)}% geçen aya göre
                  </span>
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">Geçen ay: {fmt(lastMonthRevenue)}</p>
            </div>
            {[
              { label: 'Toplam Gelir', value: fmt(totalRevenue), icon: TrendingUp, color: 'from-green-600 to-emerald-600' },
              { label: 'Toplam Gider', value: fmt(totalExpenses), icon: CreditCard, color: 'from-red-600 to-rose-600' },
              { label: 'Alacaklar', value: fmt(receivables), icon: FileText, color: 'from-amber-600 to-orange-600' },
            ].map(card => (
              <div key={card.label} className="p-5 bg-[#111111] rounded-3xl border border-[#2a2a2a]">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1.5 rounded-xl bg-gradient-to-br ${card.color}`}><card.icon size={14} className="text-white" /></div>
                  <p className="text-xs text-gray-400">{card.label}</p>
                </div>
                <p className="text-xl font-bold text-white">{card.value}</p>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="p-6 bg-[#111111] rounded-3xl border border-[#2a2a2a]">
            <h3 className="text-base font-semibold text-white mb-4">Aylık Gelir / Gider</h3>
            {monthlyData.length === 0 ? (
              <p className="text-gray-500 text-sm">Henüz kayıt yok.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyData}>
                  <XAxis dataKey="month" stroke="#555" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <YAxis stroke="#555" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: 12 }} />
                  <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                  <Bar dataKey="revenue" name="Gelir" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Gider" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Unpaid invoices */}
            <div className="p-6 bg-[#111111] rounded-3xl border border-[#2a2a2a]">
              <h3 className="text-base font-semibold text-white mb-3">Ödenmemiş Faturalar</h3>
              <div className="space-y-2">
                {unpaidInvoices.slice(0, 5).map(inv => (
                  <div key={inv.id} className="flex items-center justify-between gap-3 py-2 border-b border-[#1a1a1a] last:border-0">
                    <div><p className="text-sm text-white font-mono">{inv.invoiceNumber}</p><p className="text-xs text-gray-500">Vade: {inv.dueDate?.slice(0, 10) ?? '-'}</p></div>
                    <div className="flex items-center gap-2"><StatusBadge s={inv.status} /><span className="text-sm text-white">{fmt((inv.total ?? 0) - (inv.paidAmount ?? 0))}</span></div>
                  </div>
                ))}
                {unpaidInvoices.length === 0 && <p className="text-gray-500 text-sm">Ödenmemiş fatura yok.</p>}
              </div>
            </div>
            {/* Recent payments */}
            <div className="p-6 bg-[#111111] rounded-3xl border border-[#2a2a2a]">
              <h3 className="text-base font-semibold text-white mb-3">Son İşlemler</h3>
              <div className="space-y-2">
                {payments.slice(0, 5).map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-2 border-b border-[#1a1a1a] last:border-0">
                    <div>
                      <p className="text-sm text-white">{p.paymentType === 'received' ? 'Alınan Ödeme' : 'Gönderilen Ödeme'}</p>
                      <p className="text-xs text-gray-500">{p.paymentMethod ?? '-'} · {p.reference ?? ''}</p>
                    </div>
                    <span className={`text-sm font-semibold ${p.paymentType === 'received' ? 'text-green-400' : 'text-red-400'}`}>
                      {p.paymentType === 'received' ? '+' : '-'}{fmt(p.amount ?? 0)}
                    </span>
                  </div>
                ))}
                {payments.length === 0 && <p className="text-gray-500 text-sm">Ödeme yok.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Invoices ── */}
      {tab === 'invoices' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">Faturalar</h2>
            <button onClick={() => setInvoiceModal({})} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Yeni Fatura</button>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-sm text-gray-300">
              <thead><tr><th className="px-6 py-4 text-left">Numara</th><th className="px-6 py-4 text-left">Tür</th><th className="px-6 py-4 text-left">Tarih</th><th className="px-6 py-4 text-left">Toplam</th><th className="px-6 py-4 text-left">Durum</th><th className="px-6 py-4 text-right">İşlem</th></tr></thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-500">Fatura bulunamadı.</td></tr>
                ) : invoices.map(inv => (
                  <tr key={inv.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                    <td className="px-6 py-4 text-white font-mono text-xs">{inv.invoiceNumber}</td>
                    <td className="px-6 py-4">{inv.invoiceType === 'sale' ? 'Satış' : 'Alım'}</td>
                    <td className="px-6 py-4">{inv.issueDate?.slice(0, 10) ?? '-'}</td>
                    <td className="px-6 py-4 text-white">{fmt(inv.total ?? 0)}</td>
                    <td className="px-6 py-4"><StatusBadge s={inv.status} /></td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setInvoiceModal({ id: inv.id, data: inv })} className="p-1.5 rounded-lg hover:bg-[#2a2a2a]" title="Düzenle"><Edit2 size={14} /></button>
                        <button onClick={async () => { await api.post(`/accounting/invoices/${inv.id}/send`); loadAll() }} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-blue-400" title="Gönder"><Send size={14} /></button>
                        <button onClick={async () => { await api.delete(`/accounting/invoices/${inv.id}`); loadAll() }} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-red-400" title="Sil"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Payments ── */}
      {tab === 'payments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">Ödemeler</h2>
            <button onClick={() => setPaymentModal({})} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Yeni Ödeme</button>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-sm text-gray-300">
              <thead><tr><th className="px-6 py-4 text-left">Tür</th><th className="px-6 py-4 text-left">Tutar</th><th className="px-6 py-4 text-left">Yöntem</th><th className="px-6 py-4 text-left">Referans</th><th className="px-6 py-4 text-left">Durum</th></tr></thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-500">Ödeme bulunamadı.</td></tr>
                ) : payments.map(p => (
                  <tr key={p.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                    <td className="px-6 py-4">{p.paymentType === 'received' ? 'Alınan' : 'Gönderilen'}</td>
                    <td className="px-6 py-4 text-white">{fmt(p.amount)}</td>
                    <td className="px-6 py-4">{p.paymentMethod ?? '-'}</td>
                    <td className="px-6 py-4 font-mono text-xs">{p.reference ?? '-'}</td>
                    <td className="px-6 py-4"><StatusBadge s={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Contacts ── */}
      {tab === 'contacts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">Kişiler</h2>
            <button onClick={() => setContactModal({})} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Yeni Kişi</button>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-sm text-gray-300">
              <thead><tr><th className="px-6 py-4 text-left">Ad / Firma</th><th className="px-6 py-4 text-left">Tür</th><th className="px-6 py-4 text-left">Email</th><th className="px-6 py-4 text-left">Telefon</th><th className="px-6 py-4 text-left">Bakiye</th><th className="px-6 py-4 text-right">İşlem</th></tr></thead>
              <tbody>
                {contacts.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-500">Kişi bulunamadı.</td></tr>
                ) : contacts.map(c => (
                  <tr key={c.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                    <td className="px-6 py-4 text-white">{c.name}</td>
                    <td className="px-6 py-4">{c.contactType === 'individual' ? 'Bireysel' : 'Kurumsal'}</td>
                    <td className="px-6 py-4">{c.email ?? '-'}</td>
                    <td className="px-6 py-4">{c.phone ?? '-'}</td>
                    <td className="px-6 py-4">{fmt(c.balance ?? 0)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setContactModal({ id: c.id, data: c })} className="p-1.5 rounded-lg hover:bg-[#2a2a2a]"><Edit2 size={14} /></button>
                        <button onClick={async () => { await api.delete(`/accounting/contacts/${c.id}`); loadAll() }} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-red-400"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Expenses ── */}
      {tab === 'expenses' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">Giderler</h2>
            <button onClick={() => setExpenseModal({})} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Yeni Gider</button>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-sm text-gray-300">
              <thead><tr><th className="px-6 py-4 text-left">Tarih</th><th className="px-6 py-4 text-left">Kategori</th><th className="px-6 py-4 text-left">Açıklama</th><th className="px-6 py-4 text-left">Tutar</th><th className="px-6 py-4 text-left">Durum</th><th className="px-6 py-4 text-right">İşlem</th></tr></thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-500">Gider bulunamadı.</td></tr>
                ) : expenses.map(e => (
                  <tr key={e.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                    <td className="px-6 py-4">{e.expenseDate?.slice(0, 10) ?? '-'}</td>
                    <td className="px-6 py-4">{e.category ?? '-'}</td>
                    <td className="px-6 py-4 max-w-[200px] truncate">{e.description ?? '-'}</td>
                    <td className="px-6 py-4 text-white">{fmt(e.amount ?? 0)}</td>
                    <td className="px-6 py-4"><StatusBadge s={e.status} /></td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setExpenseModal({ id: e.id, data: e })} className="p-1.5 rounded-lg hover:bg-[#2a2a2a]"><Edit2 size={14} /></button>
                        <button onClick={async () => { await api.delete(`/accounting/expenses/${e.id}`); loadAll() }} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-red-400"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Reports ── */}
      {tab === 'reports' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">Finansal Raporlar</h2>
            <button onClick={loadReports} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-gray-300 hover:text-white text-sm">
              <RefreshCw size={14} /> Güncelle
            </button>
          </div>
          {!reports ? (
            <p className="text-gray-500">Yükleniyor...</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="p-6 bg-[#111111] rounded-3xl border border-[#2a2a2a]">
                <h3 className="text-base font-semibold text-white mb-4">Gelir Tablosu</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-400">Toplam Gelir</span><span className="text-green-400">{fmt(reports.revenue ?? 0)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Toplam Gider</span><span className="text-red-400">{fmt(reports.expenses ?? 0)}</span></div>
                  <div className="flex justify-between border-t border-[#2a2a2a] pt-3">
                    <span className="text-white font-semibold">Net Kar</span>
                    <span className={`font-semibold ${(reports.netProfit ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(reports.netProfit ?? 0)}</span>
                  </div>
                </div>
              </div>
              <div className="p-6 bg-[#111111] rounded-3xl border border-[#2a2a2a]">
                <h3 className="text-base font-semibold text-white mb-4">Nakit Akışı</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-400">Operasyonel</span><span className="text-white">{fmt(cashFlow?.operating ?? 0)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Yatırım</span><span className="text-white">{fmt(cashFlow?.investing ?? 0)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Finansman</span><span className="text-white">{fmt(cashFlow?.financing ?? 0)}</span></div>
                  <div className="flex justify-between border-t border-[#2a2a2a] pt-3">
                    <span className="text-white font-semibold">Net Akış</span>
                    <span className={`font-semibold ${(cashFlow?.net ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(cashFlow?.net ?? 0)}</span>
                  </div>
                </div>
              </div>
              <div className="p-6 bg-[#111111] rounded-3xl border border-[#2a2a2a]">
                <h3 className="text-base font-semibold text-white mb-4">Kârlılık</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-400">Brüt Marj</span><span className="text-white">{((reports.grossMargin ?? 0) * 100).toFixed(1)}%</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Net Marj</span><span className="text-white">{((reports.netMargin ?? 0) * 100).toFixed(1)}%</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">ROA</span><span className="text-white">{((reports.ROA ?? 0) * 100).toFixed(1)}%</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Integrations ── */}
      {tab === 'integrations' && (
        <IntegrationsTab
          paymentIntegrations={paymentIntegrations}
          bankIntegrations={bankIntegrations}
          accountingConns={accountingConns}
          onReload={loadAll}
        />
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Plus, Trash2, Edit2, X, RefreshCw } from 'lucide-react'
import api from '../lib/api'
import DynamicForm from '../components/DynamicForm'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Contact { id: string; fullName?: string; firstName?: string; lastName?: string; email?: string; phone?: string; companyName?: string; contactType?: string; leadStatus?: string; companyId?: string }
interface Company { id: string; name: string; industry?: string; companyType?: string; website?: string; email?: string; phone?: string; taxNumber?: string }
interface Deal { id: string; title: string; contactId?: string; companyId?: string; stage?: string; dealValue?: number; currency?: string; expectedCloseDate?: string }
interface Activity { id: string; type: string; subject?: string; dealId?: string; contactId?: string; status?: string; priority?: string; dueDate?: string }

const TABS = [
  { id: 'contacts', label: 'Kişiler' },
  { id: 'companies', label: 'Firmalar' },
  { id: 'deals', label: 'Fırsatlar' },
  { id: 'activities', label: 'Aktiviteler' },
]

const STAGE_LBL: Record<string, string> = { new: 'Yeni', qualified: 'Nitelikli', proposal: 'Teklif', negotiation: 'Pazarlık', won: 'Kazanıldı', lost: 'Kaybedildi' }
const STAGE_CLS: Record<string, string> = { new: 'bg-gray-700 text-gray-300', qualified: 'bg-blue-900 text-blue-300', proposal: 'bg-amber-900 text-amber-300', negotiation: 'bg-purple-900 text-purple-300', won: 'bg-green-900 text-green-300', lost: 'bg-red-900 text-red-300' }
const CONTACT_TYPE_LBL: Record<string, string> = { lead: 'Lead', contact: 'Kişi', customer: 'Müşteri', partner: 'Partner', vendor: 'Tedarikçi' }

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

export default function Crm() {
  const [tab, setTab] = useState('contacts')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(false)

  const [contactModal, setContactModal] = useState<any>(null)
  const [companyModal, setCompanyModal] = useState<any>(null)
  const [dealModal, setDealModal] = useState<any>(null)
  const [activityModal, setActivityModal] = useState<any>(null)

  const loadAll = async () => {
    setLoading(true)
    try {
      const [c, co, d, a] = await Promise.all([
        api.get('/crm-native/contacts').then(r => r.data.contacts ?? []),
        api.get('/crm-native/companies').then(r => r.data.companies ?? []),
        api.get('/crm-native/deals').then(r => r.data.deals ?? []),
        api.get('/crm-native/activities').then(r => r.data.activities ?? []),
      ])
      setContacts(c); setCompanies(co); setDeals(d); setActivities(a)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  // ── Modals ──
  function ContactModal() {
    const [form, setForm] = useState(contactModal?.data ?? { firstName: '', lastName: '', email: '', phone: '', companyName: '', contactType: 'lead' })
    const save = async () => {
      contactModal?.id ? await api.put(`/crm-native/contacts/${contactModal.id}`, form) : await api.post('/crm-native/contacts', form)
      setContactModal(null); loadAll()
    }
    return (
      <Modal title={contactModal?.id ? 'Kişi Düzenle' : 'Yeni Kişi'} onClose={() => setContactModal(null)}>
        <DynamicForm
          moduleKey="crm_contacts"
          value={form}
          onChange={setForm}
          inputClassName={iCls}
          excludeKeys={['fullName', 'customFields', 'tags', 'leadScore', 'opportunityScore', 'doNotContact']}
          relationOptions={{ companyId: companies.map(c => ({ value: c.id, label: c.name })) }}
          fallback={
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Ad"><input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} className={iCls} /></F>
              <F label="Soyad"><input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} className={iCls} /></F>
              <F label="Email"><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={iCls} /></F>
              <F label="Telefon"><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={iCls} /></F>
              <F label="Firma Adı"><input value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} className={iCls} /></F>
              <F label="Tür"><select value={form.contactType} onChange={e => setForm({ ...form, contactType: e.target.value })} className={iCls}>
                {Object.entries(CONTACT_TYPE_LBL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></F>
            </div>
          }
        />
        <div className="flex gap-3 justify-end">
          <button onClick={() => setContactModal(null)} className="px-4 py-2 rounded-2xl border border-[#2a2a2a] text-gray-400">İptal</button>
          <button onClick={save} className="px-4 py-2 rounded-2xl bg-[#6366f1] text-white">Kaydet</button>
        </div>
      </Modal>
    )
  }

  function CompanyModal() {
    const [form, setForm] = useState(companyModal?.data ?? { name: '', industry: '', companyType: 'prospect', website: '', email: '', phone: '', taxNumber: '' })
    const save = async () => {
      companyModal?.id ? await api.put(`/crm-native/companies/${companyModal.id}`, form) : await api.post('/crm-native/companies', form)
      setCompanyModal(null); loadAll()
    }
    return (
      <Modal title={companyModal?.id ? 'Firma Düzenle' : 'Yeni Firma'} onClose={() => setCompanyModal(null)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Firma Adı"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={iCls} /></F>
          <F label="Sektör"><input value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} className={iCls} /></F>
          <F label="Tür"><select value={form.companyType} onChange={e => setForm({ ...form, companyType: e.target.value })} className={iCls}>
            <option value="prospect">Potansiyel</option><option value="customer">Müşteri</option>
            <option value="partner">Partner</option><option value="vendor">Tedarikçi</option><option value="competitor">Rakip</option>
          </select></F>
          <F label="Website"><input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} className={iCls} /></F>
          <F label="Email"><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={iCls} /></F>
          <F label="Telefon"><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={iCls} /></F>
          <F label="Vergi No"><input value={form.taxNumber} onChange={e => setForm({ ...form, taxNumber: e.target.value })} className={iCls} /></F>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setCompanyModal(null)} className="px-4 py-2 rounded-2xl border border-[#2a2a2a] text-gray-400">İptal</button>
          <button onClick={save} className="px-4 py-2 rounded-2xl bg-[#6366f1] text-white">Kaydet</button>
        </div>
      </Modal>
    )
  }

  function DealModal() {
    const [form, setForm] = useState(dealModal?.data ?? { title: '', contactId: '', companyId: '', stage: 'new', dealValue: 0, currency: 'TRY', expectedCloseDate: '' })
    const save = async () => {
      dealModal?.id ? await api.put(`/crm-native/deals/${dealModal.id}`, form) : await api.post('/crm-native/deals', form)
      setDealModal(null); loadAll()
    }
    return (
      <Modal title={dealModal?.id ? 'Fırsat Düzenle' : 'Yeni Fırsat'} onClose={() => setDealModal(null)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><F label="Başlık"><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={iCls} /></F></div>
          <F label="Kişi"><select value={form.contactId ?? ''} onChange={e => setForm({ ...form, contactId: e.target.value || null })} className={iCls}><option value="">Seçin...</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.fullName || c.email || c.id}</option>)}</select></F>
          <F label="Firma"><select value={form.companyId ?? ''} onChange={e => setForm({ ...form, companyId: e.target.value || null })} className={iCls}><option value="">Seçin...</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></F>
          <F label="Aşama"><select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })} className={iCls}>
            {Object.entries(STAGE_LBL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></F>
          <F label="Değer"><input type="number" value={form.dealValue} onChange={e => setForm({ ...form, dealValue: Number(e.target.value) })} className={iCls} /></F>
          <F label="Beklenen Kapanış"><input type="date" value={form.expectedCloseDate ?? ''} onChange={e => setForm({ ...form, expectedCloseDate: e.target.value })} className={iCls} /></F>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setDealModal(null)} className="px-4 py-2 rounded-2xl border border-[#2a2a2a] text-gray-400">İptal</button>
          <button onClick={save} className="px-4 py-2 rounded-2xl bg-[#6366f1] text-white">Kaydet</button>
        </div>
      </Modal>
    )
  }

  function ActivityModal() {
    const [form, setForm] = useState(activityModal?.data ?? { type: 'task', subject: '', dealId: '', contactId: '', status: 'planned', priority: 'medium', dueDate: '' })
    const save = async () => {
      activityModal?.id ? await api.put(`/crm-native/activities/${activityModal.id}`, form) : await api.post('/crm-native/activities', form)
      setActivityModal(null); loadAll()
    }
    return (
      <Modal title={activityModal?.id ? 'Aktivite Düzenle' : 'Yeni Aktivite'} onClose={() => setActivityModal(null)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Tür"><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={iCls}>
            <option value="call">Arama</option><option value="email">Email</option><option value="meeting">Toplantı</option>
            <option value="task">Görev</option><option value="note">Not</option><option value="demo">Demo</option>
          </select></F>
          <F label="Durum"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={iCls}>
            <option value="planned">Planlandı</option><option value="in_progress">Devam Ediyor</option><option value="completed">Tamamlandı</option><option value="cancelled">İptal</option>
          </select></F>
          <div className="sm:col-span-2"><F label="Konu"><input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} className={iCls} /></F></div>
          <F label="İlgili Fırsat"><select value={form.dealId ?? ''} onChange={e => setForm({ ...form, dealId: e.target.value || null })} className={iCls}><option value="">Seçin...</option>{deals.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></F>
          <F label="Vade Tarihi"><input type="date" value={form.dueDate ?? ''} onChange={e => setForm({ ...form, dueDate: e.target.value })} className={iCls} /></F>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setActivityModal(null)} className="px-4 py-2 rounded-2xl border border-[#2a2a2a] text-gray-400">İptal</button>
          <button onClick={save} className="px-4 py-2 rounded-2xl bg-[#6366f1] text-white">Kaydet</button>
        </div>
      </Modal>
    )
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">CRM</h1>
          <p className="text-gray-400">Kişiler, firmalar, fırsatlar ve aktiviteler</p>
        </div>
        <button onClick={loadAll} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-gray-300 hover:text-white">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-2xl text-sm font-medium whitespace-nowrap ${tab === t.id ? 'bg-[#6366f1] text-white' : 'bg-[#111111] text-gray-300 border border-[#2a2a2a]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {contactModal !== null && <ContactModal />}
      {companyModal !== null && <CompanyModal />}
      {dealModal !== null && <DealModal />}
      {activityModal !== null && <ActivityModal />}

      {tab === 'contacts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">Kişiler</h2>
            <button onClick={() => setContactModal({})} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Yeni Kişi</button>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-sm text-gray-300">
              <thead><tr><th className="px-6 py-4 text-left">Ad Soyad</th><th className="px-6 py-4 text-left">Email</th><th className="px-6 py-4 text-left">Firma</th><th className="px-6 py-4 text-left">Tür</th><th className="px-6 py-4 text-right">İşlem</th></tr></thead>
              <tbody>
                {contacts.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-500">Kişi bulunamadı.</td></tr>
                ) : contacts.map(c => (
                  <tr key={c.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                    <td className="px-6 py-4 text-white">{c.fullName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '-'}</td>
                    <td className="px-6 py-4">{c.email ?? '-'}</td>
                    <td className="px-6 py-4">{c.companyName ?? '-'}</td>
                    <td className="px-6 py-4">{CONTACT_TYPE_LBL[c.contactType ?? ''] ?? c.contactType ?? '-'}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setContactModal({ id: c.id, data: c })} className="p-1.5 rounded-lg hover:bg-[#2a2a2a]"><Edit2 size={14} /></button>
                        <button onClick={async () => { await api.delete(`/crm-native/contacts/${c.id}`); loadAll() }} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-red-400"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'companies' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">Firmalar</h2>
            <button onClick={() => setCompanyModal({})} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Yeni Firma</button>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-sm text-gray-300">
              <thead><tr><th className="px-6 py-4 text-left">Firma Adı</th><th className="px-6 py-4 text-left">Sektör</th><th className="px-6 py-4 text-left">Tür</th><th className="px-6 py-4 text-left">Email</th><th className="px-6 py-4 text-right">İşlem</th></tr></thead>
              <tbody>
                {companies.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-500">Firma bulunamadı.</td></tr>
                ) : companies.map(c => (
                  <tr key={c.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                    <td className="px-6 py-4 text-white">{c.name}</td>
                    <td className="px-6 py-4">{c.industry ?? '-'}</td>
                    <td className="px-6 py-4">{c.companyType ?? '-'}</td>
                    <td className="px-6 py-4">{c.email ?? '-'}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setCompanyModal({ id: c.id, data: c })} className="p-1.5 rounded-lg hover:bg-[#2a2a2a]"><Edit2 size={14} /></button>
                        <button onClick={async () => { await api.delete(`/crm-native/companies/${c.id}`); loadAll() }} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-red-400"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'deals' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">Fırsatlar</h2>
            <button onClick={() => setDealModal({})} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Yeni Fırsat</button>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-sm text-gray-300">
              <thead><tr><th className="px-6 py-4 text-left">Başlık</th><th className="px-6 py-4 text-left">Aşama</th><th className="px-6 py-4 text-left">Değer</th><th className="px-6 py-4 text-left">Beklenen Kapanış</th><th className="px-6 py-4 text-right">İşlem</th></tr></thead>
              <tbody>
                {deals.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-500">Fırsat bulunamadı.</td></tr>
                ) : deals.map(d => (
                  <tr key={d.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                    <td className="px-6 py-4 text-white">{d.title}</td>
                    <td className="px-6 py-4"><span className={`px-2 py-0.5 rounded-full text-xs ${STAGE_CLS[d.stage ?? ''] ?? 'bg-gray-700 text-gray-300'}`}>{STAGE_LBL[d.stage ?? ''] ?? d.stage}</span></td>
                    <td className="px-6 py-4">{(d.dealValue ?? 0).toLocaleString('tr-TR')} {d.currency ?? 'TRY'}</td>
                    <td className="px-6 py-4">{d.expectedCloseDate?.slice(0, 10) ?? '-'}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setDealModal({ id: d.id, data: d })} className="p-1.5 rounded-lg hover:bg-[#2a2a2a]"><Edit2 size={14} /></button>
                        <button onClick={async () => { await api.delete(`/crm-native/deals/${d.id}`); loadAll() }} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-red-400"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'activities' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">Aktiviteler</h2>
            <button onClick={() => setActivityModal({})} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Yeni Aktivite</button>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-sm text-gray-300">
              <thead><tr><th className="px-6 py-4 text-left">Tür</th><th className="px-6 py-4 text-left">Konu</th><th className="px-6 py-4 text-left">Durum</th><th className="px-6 py-4 text-left">Vade</th><th className="px-6 py-4 text-right">İşlem</th></tr></thead>
              <tbody>
                {activities.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-500">Aktivite bulunamadı.</td></tr>
                ) : activities.map(a => (
                  <tr key={a.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                    <td className="px-6 py-4">{a.type}</td>
                    <td className="px-6 py-4 text-white">{a.subject ?? '-'}</td>
                    <td className="px-6 py-4">{a.status ?? '-'}</td>
                    <td className="px-6 py-4">{a.dueDate?.slice(0, 10) ?? '-'}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setActivityModal({ id: a.id, data: a })} className="p-1.5 rounded-lg hover:bg-[#2a2a2a]"><Edit2 size={14} /></button>
                        <button onClick={async () => { await api.delete(`/crm-native/activities/${a.id}`); loadAll() }} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-red-400"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

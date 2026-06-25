import { useEffect, useState } from 'react'
import { Plus, RefreshCw, Lock, Wallet } from 'lucide-react'
import api from '../lib/api'

interface Staff { id: string; firstName: string; lastName: string; employeeNumber?: string; department?: string; position?: string; email?: string; baseSalary?: number; salaryCurrency?: string; status: string }
interface PayrollRow { id: string; staffId: string; firstName?: string; lastName?: string; periodYear: number; periodMonth: number; grossPay?: number; netPay?: number; currency?: string; status: string }

const TABS = [{ id: 'staff', label: 'Personel' }, { id: 'payroll', label: 'Bordro' }]
const STATUS_LBL: Record<string, string> = { active: 'Aktif', on_leave: 'İzinli', probation: 'Deneme Süresi', suspended: 'Askıda', terminated: 'İşten Çıkmış' }
const STATUS_CLS: Record<string, string> = { active: 'bg-green-900 text-green-300', on_leave: 'bg-blue-900 text-blue-300', probation: 'bg-amber-900 text-amber-300', suspended: 'bg-red-900 text-red-300', terminated: 'bg-gray-700 text-gray-300' }

const iCls = 'w-full px-3 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-white text-sm focus:outline-none focus:border-[#6366f1]'

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-gray-400">{label}</label><div className="mt-1">{children}</div></div>
}

export default function Personnel() {
  const [entitled, setEntitled] = useState<boolean | null>(null)
  const [activating, setActivating] = useState(false)
  const [tab, setTab] = useState('staff')
  const [staff, setStaff] = useState<Staff[]>([])
  const [payroll, setPayroll] = useState<PayrollRow[]>([])
  const [loading, setLoading] = useState(false)
  const [showNewStaff, setShowNewStaff] = useState(false)
  const [staffForm, setStaffForm] = useState({ firstName: '', lastName: '', department: '', position: '', email: '', baseSalary: 0 })
  const [showNewPayroll, setShowNewPayroll] = useState(false)
  const now = new Date()
  const [payrollForm, setPayrollForm] = useState({ staffId: '', periodYear: now.getFullYear(), periodMonth: now.getMonth() + 1, baseSalary: 0 })

  const checkEntitlement = async () => {
    try {
      const { data } = await api.get('/entitlements')
      const row = (data.entitlements ?? []).find((e: any) => e.moduleKey === 'addon_personnel_management')
      setEntitled(!!row && ['active', 'trial'].includes(row.status))
    } catch { setEntitled(false) }
  }

  const loadAll = async () => {
    setLoading(true)
    try {
      const [s, p] = await Promise.all([
        api.get('/personnel-native/staff').then(r => r.data.staff ?? []),
        api.get('/personnel-native/payroll').then(r => r.data.payroll ?? []),
      ])
      setStaff(s); setPayroll(p)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  useEffect(() => { checkEntitlement() }, [])
  useEffect(() => { if (entitled) loadAll() }, [entitled])

  const activate = async () => {
    setActivating(true)
    try { await api.post('/entitlements/addon_personnel_management/activate', {}); await checkEntitlement() }
    catch (err) { console.error(err) }
    setActivating(false)
  }

  const createStaff = async () => {
    await api.post('/personnel-native/staff', staffForm)
    setShowNewStaff(false); setStaffForm({ firstName: '', lastName: '', department: '', position: '', email: '', baseSalary: 0 }); loadAll()
  }

  const createPayroll = async () => {
    await api.post('/personnel-native/payroll', payrollForm)
    setShowNewPayroll(false); loadAll()
  }

  const approvePayroll = async (id: string) => {
    await api.put(`/personnel-native/payroll/${id}/approve`)
    loadAll()
  }

  if (entitled === null) return <div className="p-8 text-gray-400">Yükleniyor...</div>

  if (!entitled) {
    return (
      <div className="p-8">
        <div className="max-w-xl mx-auto mt-16 p-8 rounded-3xl border border-[#2a2a2a] bg-[#111111] text-center space-y-4">
          <Lock size={40} className="mx-auto text-[#6366f1]" />
          <h1 className="text-2xl font-bold text-white">Personnel Management</h1>
          <p className="text-gray-400">Personel kaydı, devam takibi ve bordro hesaplama (Türkiye SGK/gelir vergisi kesintileri dahil) — native add-on modülü.</p>
          <button onClick={activate} disabled={activating} className="px-6 py-3 rounded-2xl bg-[#6366f1] text-white font-medium disabled:opacity-50">
            {activating ? 'Etkinleştiriliyor...' : 'Modülü Etkinleştir'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Personel</h1>
          <p className="text-gray-400">Personel, devam ve bordro yönetimi</p>
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

      {tab === 'staff' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">Personel Listesi</h2>
            <button onClick={() => setShowNewStaff(true)} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Yeni Personel</button>
          </div>
          {showNewStaff && (
            <div className="p-6 rounded-3xl border border-[#2a2a2a] bg-[#111111] space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <F label="Ad"><input value={staffForm.firstName} onChange={e => setStaffForm({ ...staffForm, firstName: e.target.value })} className={iCls} /></F>
                <F label="Soyad"><input value={staffForm.lastName} onChange={e => setStaffForm({ ...staffForm, lastName: e.target.value })} className={iCls} /></F>
                <F label="Departman"><input value={staffForm.department} onChange={e => setStaffForm({ ...staffForm, department: e.target.value })} className={iCls} /></F>
                <F label="Pozisyon"><input value={staffForm.position} onChange={e => setStaffForm({ ...staffForm, position: e.target.value })} className={iCls} /></F>
                <F label="Email"><input value={staffForm.email} onChange={e => setStaffForm({ ...staffForm, email: e.target.value })} className={iCls} /></F>
                <F label="Maaş (TRY)"><input type="number" value={staffForm.baseSalary} onChange={e => setStaffForm({ ...staffForm, baseSalary: Number(e.target.value) })} className={iCls} /></F>
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowNewStaff(false)} className="px-4 py-2 rounded-2xl border border-[#2a2a2a] text-gray-400">İptal</button>
                <button onClick={createStaff} disabled={!staffForm.firstName || !staffForm.lastName} className="px-4 py-2 rounded-2xl bg-[#6366f1] text-white disabled:opacity-50">Kaydet</button>
              </div>
            </div>
          )}
          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-sm text-gray-300">
              <thead><tr><th className="px-6 py-4 text-left">Ad Soyad</th><th className="px-6 py-4 text-left">Departman</th><th className="px-6 py-4 text-left">Pozisyon</th><th className="px-6 py-4 text-left">Maaş</th><th className="px-6 py-4 text-left">Durum</th></tr></thead>
              <tbody>
                {staff.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-500">Personel bulunamadı.</td></tr>
                ) : staff.map(s => (
                  <tr key={s.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                    <td className="px-6 py-4 text-white">{s.firstName} {s.lastName}</td>
                    <td className="px-6 py-4">{s.department ?? '-'}</td>
                    <td className="px-6 py-4">{s.position ?? '-'}</td>
                    <td className="px-6 py-4">{(s.baseSalary ?? 0).toLocaleString('tr-TR')} {s.salaryCurrency ?? 'TRY'}</td>
                    <td className="px-6 py-4"><span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_CLS[s.status] ?? 'bg-gray-700 text-gray-300'}`}>{STATUS_LBL[s.status] ?? s.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'payroll' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">Bordro</h2>
            <button onClick={() => setShowNewPayroll(true)} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Yeni Bordro</button>
          </div>
          {showNewPayroll && (
            <div className="p-6 rounded-3xl border border-[#2a2a2a] bg-[#111111] space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <F label="Personel"><select value={payrollForm.staffId} onChange={e => {
                  const s = staff.find(x => x.id === e.target.value)
                  setPayrollForm({ ...payrollForm, staffId: e.target.value, baseSalary: s?.baseSalary ?? 0 })
                }} className={iCls}><option value="">Seçin...</option>{staff.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}</select></F>
                <F label="Dönem (Ay/Yıl)">
                  <div className="flex gap-2">
                    <input type="number" value={payrollForm.periodMonth} onChange={e => setPayrollForm({ ...payrollForm, periodMonth: Number(e.target.value) })} className={iCls} placeholder="Ay" />
                    <input type="number" value={payrollForm.periodYear} onChange={e => setPayrollForm({ ...payrollForm, periodYear: Number(e.target.value) })} className={iCls} placeholder="Yıl" />
                  </div>
                </F>
                <F label="Brüt Maaş (TRY)"><input type="number" value={payrollForm.baseSalary} onChange={e => setPayrollForm({ ...payrollForm, baseSalary: Number(e.target.value) })} className={iCls} /></F>
              </div>
              <p className="text-xs text-gray-500">SGK (%14), işsizlik (%1) kesintileri otomatik hesaplanır. Gelir vergisi/damga vergisi manuel girilebilir (varsayılan 0).</p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowNewPayroll(false)} className="px-4 py-2 rounded-2xl border border-[#2a2a2a] text-gray-400">İptal</button>
                <button onClick={createPayroll} disabled={!payrollForm.staffId} className="px-4 py-2 rounded-2xl bg-[#6366f1] text-white disabled:opacity-50">Hesapla ve Kaydet</button>
              </div>
            </div>
          )}
          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-sm text-gray-300">
              <thead><tr><th className="px-6 py-4 text-left">Personel</th><th className="px-6 py-4 text-left">Dönem</th><th className="px-6 py-4 text-left">Brüt</th><th className="px-6 py-4 text-left">Net</th><th className="px-6 py-4 text-left">Durum</th><th className="px-6 py-4 text-right">İşlem</th></tr></thead>
              <tbody>
                {payroll.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-500">Bordro bulunamadı.</td></tr>
                ) : payroll.map(p => (
                  <tr key={p.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                    <td className="px-6 py-4 text-white">{p.firstName} {p.lastName}</td>
                    <td className="px-6 py-4">{p.periodMonth}/{p.periodYear}</td>
                    <td className="px-6 py-4">{(p.grossPay ?? 0).toLocaleString('tr-TR')} {p.currency ?? 'TRY'}</td>
                    <td className="px-6 py-4 text-white">{(p.netPay ?? 0).toLocaleString('tr-TR')} {p.currency ?? 'TRY'}</td>
                    <td className="px-6 py-4">{p.status}</td>
                    <td className="px-6 py-4 text-right">
                      {p.status === 'draft' && (
                        <button onClick={() => approvePayroll(p.id)} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-[#6366f1]" title="Onayla"><Wallet size={14} /></button>
                      )}
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

import { useEffect, useState } from 'react'
import { Plus, Trash2, RefreshCw, Check, X as XIcon } from 'lucide-react'
import api from '../lib/api'

// FAZ 6.3: form/list-based blueprint editor — NOT a drag-drop canvas. The roadmap calls for
// a React Flow node/edge editor; given the measurable Definition of Done for FAZ 6 is the
// backend gating behavior (KIBIPR.md FAZ 6.2), this scoped-down list UI is what ships for
// 6.3. A visual canvas can replace this later without changing the API it talks to.

interface Transition {
  id: string
  moduleKey: string
  fieldKey: string
  fromState: string
  toState: string
  conditions?: { field: string; op: string; value: unknown } | null
  requiresApprovalRole?: string | null
}

interface Approval {
  id: string
  moduleKey: string
  table: string
  recordId: string
  fieldKey: string
  fromState: string
  toState: string
  status: string
  createdAt: string
}

const iCls = 'w-full px-3 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-white text-sm focus:outline-none focus:border-[#6366f1]'

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-gray-400">{label}</label><div className="mt-1">{children}</div></div>
}

export default function Blueprint() {
  const [transitions, setTransitions] = useState<Transition[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ moduleKey: 'crm_deals', fieldKey: 'stage', fromState: '', toState: '', conditionField: '', conditionOp: '>', conditionValue: '', requiresApprovalRole: '' })

  const loadAll = async () => {
    setLoading(true)
    try {
      const [t, a] = await Promise.all([
        api.get('/blueprint/transitions').then(r => r.data.transitions ?? []),
        api.get('/blueprint/approvals?status=pending').then(r => r.data.approvals ?? []),
      ])
      setTransitions(t); setApprovals(a)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  const createTransition = async () => {
    if (!form.fromState || !form.toState) return
    const conditions = form.conditionField
      ? { field: form.conditionField, op: form.conditionOp, value: isNaN(Number(form.conditionValue)) ? form.conditionValue : Number(form.conditionValue) }
      : null
    await api.post('/blueprint/transitions', {
      moduleKey: form.moduleKey,
      fieldKey: form.fieldKey,
      fromState: form.fromState,
      toState: form.toState,
      conditions,
      requiresApprovalRole: form.requiresApprovalRole || null,
    })
    setForm({ ...form, fromState: '', toState: '', conditionField: '', conditionValue: '', requiresApprovalRole: '' })
    loadAll()
  }

  const deleteTransition = async (id: string) => {
    await api.delete(`/blueprint/transitions/${id}`)
    loadAll()
  }

  const resolveApproval = async (id: string, action: 'approve' | 'reject') => {
    await api.post(`/blueprint/approvals/${id}/${action}`)
    loadAll()
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Blueprint</h1>
          <p className="text-gray-400">Modül alanları için deterministik geçiş kuralları ve onay kuyruğu</p>
        </div>
        <button onClick={loadAll} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-gray-300 hover:text-white">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>
      </div>

      {approvals.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Onay Bekleyenler</h2>
          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-sm text-gray-300">
              <thead><tr><th className="px-6 py-4 text-left">Modül</th><th className="px-6 py-4 text-left">Alan</th><th className="px-6 py-4 text-left">Geçiş</th><th className="px-6 py-4 text-right">İşlem</th></tr></thead>
              <tbody>
                {approvals.map(a => (
                  <tr key={a.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                    <td className="px-6 py-4 text-white">{a.moduleKey}</td>
                    <td className="px-6 py-4">{a.fieldKey}</td>
                    <td className="px-6 py-4">{a.fromState} → {a.toState}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => resolveApproval(a.id, 'approve')} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-green-400"><Check size={14} /></button>
                        <button onClick={() => resolveApproval(a.id, 'reject')} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-red-400"><XIcon size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Yeni Geçiş Kuralı</h2>
        <div className="rounded-3xl border border-[#2a2a2a] bg-[#111111] p-6 grid gap-3 sm:grid-cols-3">
          <F label="Modül"><input value={form.moduleKey} onChange={e => setForm({ ...form, moduleKey: e.target.value })} className={iCls} placeholder="crm_deals" /></F>
          <F label="Alan"><input value={form.fieldKey} onChange={e => setForm({ ...form, fieldKey: e.target.value })} className={iCls} placeholder="stage" /></F>
          <F label="Onay Rolü (ops.)"><input value={form.requiresApprovalRole} onChange={e => setForm({ ...form, requiresApprovalRole: e.target.value })} className={iCls} placeholder="manager" /></F>
          <F label="Başlangıç Durumu"><input value={form.fromState} onChange={e => setForm({ ...form, fromState: e.target.value })} className={iCls} placeholder="negotiation" /></F>
          <F label="Hedef Durum"><input value={form.toState} onChange={e => setForm({ ...form, toState: e.target.value })} className={iCls} placeholder="won" /></F>
          <div />
          <F label="Koşul Alanı (ops.)"><input value={form.conditionField} onChange={e => setForm({ ...form, conditionField: e.target.value })} className={iCls} placeholder="dealValue" /></F>
          <F label="Operatör"><select value={form.conditionOp} onChange={e => setForm({ ...form, conditionOp: e.target.value })} className={iCls}>
            <option value="=">=</option><option value="!=">!=</option><option value=">">&gt;</option><option value=">=">&gt;=</option><option value="<">&lt;</option><option value="<=">&lt;=</option><option value="contains">contains</option>
          </select></F>
          <F label="Koşul Değeri"><input value={form.conditionValue} onChange={e => setForm({ ...form, conditionValue: e.target.value })} className={iCls} placeholder="0" /></F>
          <div className="sm:col-span-3">
            <button onClick={createTransition} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Geçiş Ekle</button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Tanımlı Geçişler</h2>
        <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
          <table className="min-w-full text-sm text-gray-300">
            <thead><tr><th className="px-6 py-4 text-left">Modül</th><th className="px-6 py-4 text-left">Alan</th><th className="px-6 py-4 text-left">Geçiş</th><th className="px-6 py-4 text-left">Koşul</th><th className="px-6 py-4 text-left">Onay</th><th className="px-6 py-4 text-right">İşlem</th></tr></thead>
            <tbody>
              {transitions.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-500">Geçiş tanımlanmamış — alan kontrolsüz.</td></tr>
              ) : transitions.map(t => (
                <tr key={t.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                  <td className="px-6 py-4 text-white">{t.moduleKey}</td>
                  <td className="px-6 py-4">{t.fieldKey}</td>
                  <td className="px-6 py-4">{t.fromState} → {t.toState}</td>
                  <td className="px-6 py-4">{t.conditions ? `${t.conditions.field} ${t.conditions.op} ${t.conditions.value}` : '-'}</td>
                  <td className="px-6 py-4">{t.requiresApprovalRole ?? '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => deleteTransition(t.id)} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-red-400"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Plus, Trash2, RefreshCw, ArrowUp, ArrowDown } from 'lucide-react'
import api from '../lib/api'

// FAZ 8.3: "add custom field" wizard — list-based with up/down reorder, NOT a drag-drop
// canvas (same scope call as FAZ 6.3's Blueprint UI). Only crm_* Base modules are selectable
// here because FAZ 4.1's registry seed only covers those — see KIBIPR.md's deferred list.

interface Field {
  id?: string
  key: string
  label: string
  type: string
  isRequired: boolean
  isSystem: boolean
  position: number
}

const MODULES = [
  { key: 'crm_contacts', label: 'Kişiler' },
  { key: 'crm_companies', label: 'Şirketler' },
  { key: 'crm_deals', label: 'Anlaşmalar' },
  { key: 'crm_activities', label: 'Aktiviteler' },
]

const TYPES = ['text', 'number', 'date', 'boolean', 'select', 'relation', 'ai']

const iCls = 'w-full px-3 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-white text-sm focus:outline-none focus:border-[#6366f1]'

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-gray-400">{label}</label><div className="mt-1">{children}</div></div>
}

export default function FieldManager() {
  const [moduleKey, setModuleKey] = useState('crm_contacts')
  const [fields, setFields] = useState<Field[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ key: '', label: '', type: 'text', isRequired: false })

  const load = async (mk: string) => {
    setLoading(true)
    try {
      const r = await api.get(`/metadata/${mk}/fields`)
      setFields(r.data.fields ?? [])
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  useEffect(() => { load(moduleKey) }, [moduleKey])

  const addField = async () => {
    setError('')
    if (!form.key || !form.label) return
    try {
      await api.post(`/metadata/${moduleKey}/fields`, form)
      setForm({ key: '', label: '', type: 'text', isRequired: false })
      load(moduleKey)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Hata oluştu')
    }
  }

  const deleteField = async (id: string) => {
    await api.delete(`/metadata/${moduleKey}/fields/${id}`)
    load(moduleKey)
  }

  const move = async (index: number, direction: -1 | 1) => {
    const next = [...fields]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setFields(next)
    await api.post(`/metadata/${moduleKey}/fields/reorder`, { order: next.filter((f) => f.id).map((f) => f.id) })
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Alan Yöneticisi</h1>
          <p className="text-gray-400">Modüllere özel alan ekle, sırala, sil — DynamicForm bunları otomatik render eder</p>
        </div>
        <button onClick={() => load(moduleKey)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-gray-300 hover:text-white">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>
      </div>

      <F label="Modül">
        <select value={moduleKey} onChange={(e) => setModuleKey(e.target.value)} className={iCls}>
          {MODULES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </F>

      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Yeni Özel Alan</h2>
        <div className="rounded-3xl border border-[#2a2a2a] bg-[#111111] p-6 grid gap-3 sm:grid-cols-4">
          <F label="Anahtar (camelCase)"><input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} className={iCls} placeholder="ornekAlan" /></F>
          <F label="Etiket"><input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={iCls} placeholder="Örnek Alan" /></F>
          <F label="Tip"><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={iCls}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select></F>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={form.isRequired} onChange={(e) => setForm({ ...form, isRequired: e.target.checked })} /> Zorunlu
            </label>
          </div>
          {error && <p className="text-sm text-red-400 sm:col-span-4">{error}</p>}
          <div className="sm:col-span-4">
            <button onClick={addField} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Alan Ekle</button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
        <table className="min-w-full text-sm text-gray-300">
          <thead><tr><th className="px-6 py-4 text-left">Sıra</th><th className="px-6 py-4 text-left">Anahtar</th><th className="px-6 py-4 text-left">Etiket</th><th className="px-6 py-4 text-left">Tip</th><th className="px-6 py-4 text-left">Kaynak</th><th className="px-6 py-4 text-right">İşlem</th></tr></thead>
          <tbody>
            {fields.map((f, i) => (
              <tr key={f.id ?? f.key} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                <td className="px-6 py-4">
                  <div className="flex gap-1">
                    <button onClick={() => move(i, -1)} className="p-1 rounded hover:bg-[#2a2a2a]"><ArrowUp size={12} /></button>
                    <button onClick={() => move(i, 1)} className="p-1 rounded hover:bg-[#2a2a2a]"><ArrowDown size={12} /></button>
                  </div>
                </td>
                <td className="px-6 py-4 text-white">{f.key}</td>
                <td className="px-6 py-4">{f.label}</td>
                <td className="px-6 py-4">{f.type}</td>
                <td className="px-6 py-4">{f.isSystem ? 'Sistem' : 'Özel'}</td>
                <td className="px-6 py-4 text-right">
                  {!f.isSystem && f.id && (
                    <button onClick={() => deleteField(f.id!)} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-red-400"><Trash2 size={14} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

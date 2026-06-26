import { useEffect, useState } from 'react'
import { Plus, Trash2, Play, RefreshCw } from 'lucide-react'
import api from '../lib/api'

// FAZ 7.3: custom function management — create/edit/test/delete + execution history.
// Code editor is a plain textarea (no Monaco) — consistent with FAZ 6.3's "form, not canvas"
// scope decision; the real engineering effort went into executor.ts's isolate-based sandbox.

interface FunctionDef {
  id: string
  name: string
  code: string
  isActive: boolean
  createdAt: string
}

interface Execution {
  id: string
  status: 'success' | 'error'
  result: unknown
  error: string | null
  logs: string[]
  durationMs: number
  createdAt: string
  triggeredBy: Record<string, unknown>
}

const iCls = 'w-full px-3 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-white text-sm focus:outline-none focus:border-[#6366f1]'
const codeCls = 'w-full px-3 py-2 rounded-xl bg-[#0a0a0a] border border-[#2a2a2a] text-green-300 text-sm font-mono focus:outline-none focus:border-[#6366f1]'

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-gray-400">{label}</label><div className="mt-1">{children}</div></div>
}

export default function Functions() {
  const [functions, setFunctions] = useState<FunctionDef[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', code: 'return { ok: true };' })
  const [selected, setSelected] = useState<FunctionDef | null>(null)
  const [testInput, setTestInput] = useState('{}')
  const [testResult, setTestResult] = useState<any>(null)
  const [executions, setExecutions] = useState<Execution[]>([])
  const [createError, setCreateError] = useState<string | null>(null)

  const loadAll = async () => {
    setLoading(true)
    try {
      const fns = await api.get('/functions').then(r => r.data.functions ?? [])
      setFunctions(fns)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  const createFunction = async () => {
    if (!form.name || !form.code) return
    setCreateError(null)
    try {
      await api.post('/functions', form)
      setForm({ name: '', code: 'return { ok: true };' })
      loadAll()
    } catch (err: any) {
      setCreateError(err?.response?.data?.error ?? 'Hata oluştu')
    }
  }

  const deleteFunction = async (id: string) => {
    await api.delete(`/functions/${id}`)
    if (selected?.id === id) setSelected(null)
    loadAll()
  }

  const selectFunction = async (fn: FunctionDef) => {
    setSelected(fn)
    setTestResult(null)
    const ex = await api.get(`/functions/${fn.id}/executions`).then(r => r.data.executions ?? [])
    setExecutions(ex)
  }

  const runTest = async () => {
    if (!selected) return
    let input: Record<string, unknown> = {}
    try { input = JSON.parse(testInput) } catch { /* ignore invalid JSON, run with {} */ }
    setTestResult({ loading: true })
    try {
      const res = await api.post(`/functions/${selected.id}/test`, { input })
      setTestResult(res.data)
      const ex = await api.get(`/functions/${selected.id}/executions`).then(r => r.data.executions ?? [])
      setExecutions(ex)
    } catch (err: any) {
      setTestResult({ ok: false, error: err?.response?.data?.error ?? 'Hata oluştu' })
    }
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Fonksiyonlar</h1>
          <p className="text-gray-400">Kural motorundan tetiklenen özel JS fonksiyonları — izole V8 isolate içinde çalışır</p>
        </div>
        <button onClick={loadAll} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-gray-300 hover:text-white">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Yeni Fonksiyon</h2>
        <div className="rounded-3xl border border-[#2a2a2a] bg-[#111111] p-6 space-y-3">
          <F label="Ad"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={iCls} placeholder="Lead skorla" /></F>
          <F label="Kod (ctx.input, ctx.records.*, ctx.http.*, ctx.log kullanılabilir)">
            <textarea value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className={codeCls} rows={8} />
          </F>
          {createError && <p className="text-sm text-red-400">{createError}</p>}
          <button onClick={createFunction} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Fonksiyon Ekle</button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Tanımlı Fonksiyonlar</h2>
          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-sm text-gray-300">
              <thead><tr><th className="px-6 py-4 text-left">Ad</th><th className="px-6 py-4 text-left">Durum</th><th className="px-6 py-4 text-right">İşlem</th></tr></thead>
              <tbody>
                {functions.length === 0 ? (
                  <tr><td colSpan={3} className="px-6 py-10 text-center text-gray-500">Fonksiyon tanımlanmamış.</td></tr>
                ) : functions.map(f => (
                  <tr key={f.id} onClick={() => selectFunction(f)} className={`border-t border-[#2a2a2a] hover:bg-[#1a1a1a] cursor-pointer ${selected?.id === f.id ? 'bg-[#1a1a1a]' : ''}`}>
                    <td className="px-6 py-4 text-white">{f.name}</td>
                    <td className="px-6 py-4">{f.isActive ? 'Aktif' : 'Pasif'}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={(e) => { e.stopPropagation(); deleteFunction(f.id) }} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-red-400"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Test Çalıştır</h2>
          {!selected ? (
            <div className="rounded-3xl border border-[#2a2a2a] bg-[#111111] p-6 text-gray-500 text-sm">Soldan bir fonksiyon seçin.</div>
          ) : (
            <div className="rounded-3xl border border-[#2a2a2a] bg-[#111111] p-6 space-y-3">
              <p className="text-white text-sm font-semibold">{selected.name}</p>
              <F label="ctx.input (JSON)"><textarea value={testInput} onChange={e => setTestInput(e.target.value)} className={codeCls} rows={3} /></F>
              <button onClick={runTest} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Play size={16} /> Çalıştır</button>
              {testResult && (
                <pre className="text-xs text-gray-300 bg-[#0a0a0a] rounded-xl p-3 overflow-x-auto">{JSON.stringify(testResult, null, 2)}</pre>
              )}
              <div className="pt-2">
                <p className="text-xs text-gray-400 mb-2">Son Çalıştırmalar</p>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {executions.length === 0 ? (
                    <p className="text-xs text-gray-500">Henüz çalıştırma yok.</p>
                  ) : executions.map(ex => (
                    <div key={ex.id} className="text-xs text-gray-400 border-t border-[#2a2a2a] py-1.5">
                      <span className={ex.status === 'success' ? 'text-green-400' : 'text-red-400'}>{ex.status}</span> · {ex.durationMs}ms · {new Date(ex.createdAt).toLocaleString('tr-TR')}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

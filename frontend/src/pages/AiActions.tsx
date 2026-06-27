import { useEffect, useState } from 'react'
import { Check, X as XIcon, RefreshCw, Bot } from 'lucide-react'
import api from '../lib/api'

// FAZ 10.3: AI write approval inbox. The AI assistant can only READ data directly and
// PROPOSE create/update/delete — nothing here is applied until a human approves.

interface PendingAction {
  id: string
  moduleKey: string
  action: 'create' | 'update' | 'delete'
  recordId: string | null
  proposedData: Record<string, unknown> | null
  summary: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
}

const ACTION_LABEL: Record<string, string> = { create: 'Oluştur', update: 'Güncelle', delete: 'Sil' }
const ACTION_CLS: Record<string, string> = {
  create: 'bg-green-900 text-green-300',
  update: 'bg-amber-900 text-amber-300',
  delete: 'bg-red-900 text-red-300',
}

export default function AiActions() {
  const [actions, setActions] = useState<PendingAction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get('/ai-actions?status=pending')
      setActions(r.data.actions ?? [])
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const resolve = async (id: string, decision: 'approve' | 'reject') => {
    setError(null)
    try {
      await api.post(`/ai-actions/${id}/${decision}`)
      load()
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Hata oluştu')
    }
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2"><Bot size={28} /> AI Onayları</h1>
          <p className="text-gray-400">Asistanın önerdiği kayıt oluşturma/güncelleme/silme işlemleri — onaylamadan hiçbiri uygulanmaz</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-gray-300 hover:text-white">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
        <table className="min-w-full text-sm text-gray-300">
          <thead><tr><th className="px-6 py-4 text-left">Modül</th><th className="px-6 py-4 text-left">İşlem</th><th className="px-6 py-4 text-left">Özet</th><th className="px-6 py-4 text-left">Tarih</th><th className="px-6 py-4 text-right">Karar</th></tr></thead>
          <tbody>
            {actions.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-500">Bekleyen öneri yok.</td></tr>
            ) : actions.map(a => (
              <tr key={a.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                <td className="px-6 py-4 text-white">{a.moduleKey}</td>
                <td className="px-6 py-4"><span className={`px-2 py-0.5 rounded-full text-xs ${ACTION_CLS[a.action]}`}>{ACTION_LABEL[a.action]}</span></td>
                <td className="px-6 py-4 max-w-md">{a.summary}</td>
                <td className="px-6 py-4">{new Date(a.createdAt).toLocaleString('tr-TR')}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => resolve(a.id, 'approve')} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-green-400" title="Onayla"><Check size={14} /></button>
                    <button onClick={() => resolve(a.id, 'reject')} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-red-400" title="Reddet"><XIcon size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

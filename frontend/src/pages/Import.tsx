import { useState } from 'react'
import { Upload, Check, RefreshCw } from 'lucide-react'
import api from '../lib/api'

// FAZ 8.2: CSV/Excel contact import with dedup preview — file → preview (exact/fuzzy/new per
// row, fuzzy match defaults to "merge", new defaults to "create") → commit. Backend does the
// matching (src/engine/import/dedup.ts); this page is just upload + a decision table.

interface PreviewRow {
  row: Record<string, unknown>
  match: 'exact' | 'fuzzy' | 'new'
  existingId?: string
  score?: number
}

const MATCH_LABEL: Record<string, string> = { exact: 'Birebir eşleşme', fuzzy: 'Olası eşleşme', new: 'Yeni kayıt' }
const MATCH_CLS: Record<string, string> = { exact: 'bg-blue-900 text-blue-300', fuzzy: 'bg-amber-900 text-amber-300', new: 'bg-green-900 text-green-300' }

export default function Import() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [summary, setSummary] = useState<{ total: number; exact: number; fuzzy: number; new: number } | null>(null)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [decisions, setDecisions] = useState<Record<number, 'create' | 'merge' | 'skip'>>({})
  const [committing, setCommitting] = useState(false)
  const [result, setResult] = useState<{ created: number; merged: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (selected: File) => {
    setFile(selected)
    setError(null)
    setResult(null)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selected)
      const res = await api.post('/import/contacts/preview', formData)
      setSummary(res.data.summary)
      const previewRows: PreviewRow[] = res.data.results ?? []
      setRows(previewRows)
      const defaults: Record<number, 'create' | 'merge' | 'skip'> = {}
      previewRows.forEach((r, i) => { defaults[i] = r.match === 'new' ? 'create' : r.match === 'exact' ? 'skip' : 'merge' })
      setDecisions(defaults)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Dosya işlenemedi')
    }
    setUploading(false)
  }

  const commit = async () => {
    setCommitting(true)
    setError(null)
    try {
      const payload = rows.map((r, i) => ({ row: r.row, action: decisions[i], existingId: r.existingId }))
      const res = await api.post('/import/contacts/commit', { decisions: payload })
      setResult(res.data)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'İçe aktarma başarısız')
    }
    setCommitting(false)
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">İçe Aktarma</h1>
        <p className="text-gray-400">CSV/Excel'den kişi içe aktarın — eşleşen kayıtlar otomatik tespit edilir (e-posta birebir, ad+firma benzerlik)</p>
      </div>

      <div className="rounded-3xl border border-[#2a2a2a] bg-[#111111] p-6 space-y-3">
        <label className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm cursor-pointer w-fit">
          <Upload size={16} /> Dosya Seç (CSV/XLSX)
          <input type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </label>
        {file && <p className="text-xs text-gray-400">{file.name}</p>}
        {uploading && <p className="text-xs text-gray-400 flex items-center gap-2"><RefreshCw size={12} className="animate-spin" /> İşleniyor...</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <p className="text-xs text-gray-500">Başlık satırı şu alanları kullanmalı: firstName, lastName, email, phone, companyName</p>
      </div>

      {summary && (
        <div className="space-y-4">
          <div className="flex gap-4 text-sm text-gray-300">
            <span>Toplam: {summary.total}</span>
            <span className="text-blue-300">Birebir: {summary.exact}</span>
            <span className="text-amber-300">Olası: {summary.fuzzy}</span>
            <span className="text-green-300">Yeni: {summary.new}</span>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-sm text-gray-300">
              <thead><tr><th className="px-6 py-4 text-left">Ad Soyad</th><th className="px-6 py-4 text-left">E-posta</th><th className="px-6 py-4 text-left">Firma</th><th className="px-6 py-4 text-left">Eşleşme</th><th className="px-6 py-4 text-left">İşlem</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-[#2a2a2a]">
                    <td className="px-6 py-4 text-white">{String(r.row.firstName ?? '')} {String(r.row.lastName ?? '')}</td>
                    <td className="px-6 py-4">{String(r.row.email ?? '-')}</td>
                    <td className="px-6 py-4">{String(r.row.companyName ?? '-')}</td>
                    <td className="px-6 py-4"><span className={`px-2 py-0.5 rounded-full text-xs ${MATCH_CLS[r.match]}`}>{MATCH_LABEL[r.match]}</span></td>
                    <td className="px-6 py-4">
                      <select value={decisions[i]} onChange={(e) => setDecisions({ ...decisions, [i]: e.target.value as any })}
                        className="px-2 py-1 rounded-lg bg-[#0a0a0a] border border-[#2a2a2a] text-white text-xs">
                        <option value="create">Yeni oluştur</option>
                        {r.existingId && <option value="merge">Mevcutla birleştir</option>}
                        <option value="skip">Atla</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={commit} disabled={committing} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm disabled:opacity-50">
            <Check size={16} /> {committing ? 'Aktarılıyor...' : 'İçe Aktar'}
          </button>
        </div>
      )}

      {result && (
        <div className="rounded-3xl border border-[#2a2a2a] bg-[#111111] p-6 text-sm text-gray-300">
          <p className="text-green-400 font-semibold mb-2">İçe aktarma tamamlandı</p>
          <p>Oluşturulan: {result.created} · Birleştirilen: {result.merged} · Atlanan: {result.skipped}</p>
        </div>
      )}
    </div>
  )
}

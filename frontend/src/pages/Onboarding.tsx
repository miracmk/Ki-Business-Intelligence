import { useEffect, useState } from 'react'
import { Sparkles, Check } from 'lucide-react'
import api from '../lib/api'

// FAZ 8.1: pick an industry template and apply it — writes custom fields/blueprints/rules
// on top of the already-seeded Base registry (FAZ 4.1). One action, not a multi-step wizard —
// the actual onboarding speed comes from FieldManager/Import being immediately usable after.

interface Template { key: string; label: string }

export default function Onboarding() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [applying, setApplying] = useState<string | null>(null)
  const [result, setResult] = useState<{ key: string; applied: { fields: number; blueprints: number; rules: number } } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get('/onboarding/templates').then((r) => setTemplates(r.data.templates ?? [])).catch(() => {})
  }, [])

  const apply = async (key: string) => {
    setApplying(key)
    setError(null)
    try {
      const res = await api.post(`/onboarding/templates/${key}/apply`)
      setResult({ key, applied: res.data.applied })
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Şablon uygulanamadı')
    }
    setApplying(null)
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Sektörel Şablonlar</h1>
        <p className="text-gray-400">Sektörünüze uygun şablonu uygulayın — özel alanlar, geçiş kuralları ve workflow'lar otomatik eklenir</p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        {templates.map((t) => (
          <div key={t.key} className="rounded-3xl border border-[#2a2a2a] bg-[#111111] p-6 space-y-4">
            <div className="flex items-center gap-2 text-white font-semibold"><Sparkles size={18} className="text-[#6366f1]" /> {t.label}</div>
            <button onClick={() => apply(t.key)} disabled={applying === t.key}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm disabled:opacity-50">
              <Check size={16} /> {applying === t.key ? 'Uygulanıyor...' : 'Uygula'}
            </button>
            {result?.key === t.key && (
              <p className="text-xs text-green-400">
                {result.applied.fields} alan, {result.applied.blueprints} geçiş kuralı, {result.applied.rules} workflow eklendi.
              </p>
            )}
          </div>
        ))}
        {templates.length === 0 && <p className="text-gray-500 text-sm">Şablon bulunamadı.</p>}
      </div>
    </div>
  )
}

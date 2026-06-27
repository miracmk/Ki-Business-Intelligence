import { useSearchParams } from 'react-router-dom'
import { resolveIcon } from '../lib/icon-map'

// Generic placeholder for nav-catalog items with kind:'placeholder' (no real page yet) —
// the backend (src/lib/nav-catalog.ts) decides which items are placeholders; this component
// just renders whatever label/icon it's told via the nav link's query params.

export default function ComingSoon() {
  const [params] = useSearchParams()
  const label = params.get('label') ?? 'Bu modül'
  const icon = params.get('icon') ?? 'sparkles'
  const Icon = resolveIcon(icon)

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8" style={{ minHeight: '60vh' }}>
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(38,166,154,0.10)', border: '1px solid var(--border)' }}>
        <Icon size={28} />
      </div>
      <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>{label}</h1>
      <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-3)' }}>
        Bu modül henüz kullanıma açılmadı — yakında burada olacak.
      </p>
    </div>
  )
}

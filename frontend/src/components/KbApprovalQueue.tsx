import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, ExternalLink } from 'lucide-react'
import api from '../lib/api'

interface QueueItem {
  id:               string
  problem_summary:  string | null
  solution_text:    string
  confidence_score: number | null
  web_sources:      { url: string; title: string; snippet: string }[] | null
  kb_category?:     string
  status:           'pending' | 'approved' | 'rejected'
  created_at:       string
}

type Tab = 'pending' | 'approved' | 'rejected'

export function KbApprovalQueue() {
  const [tab,     setTab]     = useState<Tab>('pending')
  const [items,   setItems]   = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = async (status: Tab) => {
    setLoading(true)
    try {
      const r = await api.get(`/entity-ai/kb-queue?status=${status}`)
      setItems(r.data.queue ?? [])
    } catch { setItems([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load(tab) }, [tab])

  const approve = async (id: string) => {
    await api.put(`/entity-ai/kb-queue/${id}/approve`)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const reject = async (id: string) => {
    await api.put(`/entity-ai/kb-queue/${id}/reject`)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const scoreColor = (s: number | null) => {
    if (!s) return 'var(--text-3)'
    if (s >= 80) return '#22c55e'
    if (s >= 60) return '#f59e0b'
    return '#ef4444'
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2">
        {(['pending', 'approved', 'rejected'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: tab === t ? 'var(--teal)' : 'rgba(255,255,255,0.08)',
              color:      tab === t ? '#fff' : 'var(--text-2)',
            }}
          >
            {t === 'pending' ? 'Bekleyen' : t === 'approved' ? 'Onaylananlar' : 'Reddedilenler'}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-sm" style={{ color: 'var(--text-3)' }}>Yükleniyor...</div>
      )}

      {!loading && items.length === 0 && (
        <div className="p-8 text-center rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-3)' }}>
          {tab === 'pending' ? 'Bekleyen onay yok' : 'Kayıt bulunamadı'}
        </div>
      )}

      {items.map(item => (
        <div
          key={item.id}
          className="rounded-xl p-4 space-y-3"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              {item.problem_summary && (
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-1)' }}>
                  Sorun: {item.problem_summary}
                </p>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-3)' }}>
                  {new Date(item.created_at).toLocaleDateString('tr-TR')}
                </span>
                {item.confidence_score !== null && (
                  <span className="text-xs font-bold" style={{ color: scoreColor(item.confidence_score) }}>
                    Güven: {item.confidence_score}/100
                  </span>
                )}
              </div>
            </div>
            {tab === 'pending' && (
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => approve(item.id)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
                >
                  <CheckCircle size={13} /> Onayla
                </button>
                <button
                  onClick={() => reject(item.id)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                >
                  <XCircle size={13} /> Reddet
                </button>
              </div>
            )}
          </div>

          {/* Solution */}
          <div className="text-sm" style={{ color: 'var(--text-2)' }}>
            {expanded === item.id ? item.solution_text : `${item.solution_text.slice(0, 200)}${item.solution_text.length > 200 ? '...' : ''}`}
            {item.solution_text.length > 200 && (
              <button
                onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                className="ml-2 text-xs"
                style={{ color: 'var(--teal)' }}
              >
                {expanded === item.id ? 'Kapat ▲' : 'Tamamını Gör ▾'}
              </button>
            )}
          </div>

          {/* Web sources */}
          {item.web_sources && item.web_sources.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.web_sources.slice(0, 3).map((s, i) => (
                <a
                  key={i}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--teal)' }}
                >
                  <ExternalLink size={10} />
                  {s.title?.slice(0, 30) || s.url.replace(/https?:\/\//, '').slice(0, 30)}
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

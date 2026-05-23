import { useEffect, useState } from 'react'
import { X, RefreshCw, Database } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import api from '../lib/api'

export default function Modules() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [connections,    setConnections]    = useState<any[]>([])
  const [selectedConn,   setSelectedConn]   = useState<string>('')
  const [modules,        setModules]        = useState<any[]>([])
  const [selectedModule, setSelectedModule] = useState<string>(searchParams.get('module') || '')
  const [fields,         setFields]         = useState<any[]>([])
  const [records,        setRecords]        = useState<any[]>([])
  const [loading,        setLoading]        = useState(false)
  const [drawer,         setDrawer]         = useState<any>(null)
  const [search,         setSearch]         = useState('')
  const [page,           setPage]           = useState(1)
  const [syncing,        setSyncing]        = useState(false)

  useEffect(() => {
    api.get('/crm/connections').then(r => {
      const conns = r.data.connections ?? []
      setConnections(conns)
      if (conns[0]) setSelectedConn(conns[0].id)
    })
  }, [])

  useEffect(() => {
    const mod = searchParams.get('module')
    if (mod) setSelectedModule(mod)
  }, [searchParams])

  useEffect(() => {
    if (!selectedConn) return
    api.get(`/crm/connections/${selectedConn}/modules`).then(r => setModules(r.data.modules ?? []))
  }, [selectedConn])

  useEffect(() => {
    if (!selectedConn || !selectedModule) return
    setLoading(true)
    Promise.all([
      api.get(`/crm/connections/${selectedConn}/modules/${selectedModule}/fields`),
      api.get(`/crm/connections/${selectedConn}/records?module=${selectedModule}&limit=50&page=${page}`),
    ]).then(([f, r]) => {
      setFields(f.data.fields ?? [])
      setRecords(r.data.records ?? [])
    }).finally(() => setLoading(false))
  }, [selectedConn, selectedModule, page])

  const selectModule = (apiName: string) => {
    setSelectedModule(apiName)
    setPage(1)
    setSearchParams({ module: apiName })
  }

  const syncMetadata = () => { setSyncing(true); api.post(`/crm/connections/${selectedConn}/sync/metadata`).finally(() => setSyncing(false)) }
  const syncFields   = () => { setSyncing(true); api.post(`/crm/connections/${selectedConn}/sync/fields`).finally(() => setSyncing(false)) }

  const displayFields = fields.slice(0, 8)
  const filtered      = records.filter(r => !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex h-full overflow-hidden">
      {/* Module sidebar */}
      <aside className="w-64 flex flex-col" style={{ background: 'var(--surface-2)', borderRight: '1px solid var(--border)' }}>
        <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <select value={selectedConn} onChange={e => setSelectedConn(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--surface)', color: 'var(--text-1)', border: '1px solid var(--border)' }}>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {modules.length === 0 ? (
            <div className="text-center py-10 px-4 space-y-2">
              <Database size={28} className="mx-auto opacity-30" style={{ color: 'var(--text-3)' }} />
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>Modül yok — Metadata Sync çalıştırın</p>
            </div>
          ) : modules.map((m: any) => (
            <button key={m.apiName} onClick={() => selectModule(m.apiName)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5 transition-all"
              style={selectedModule === m.apiName
                ? { background: 'rgba(38,166,154,0.14)', color: 'var(--accent)' }
                : { color: 'var(--text-2)' }}
              onMouseEnter={e => { if (selectedModule !== m.apiName) { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-1)' } }}
              onMouseLeave={e => { if (selectedModule !== m.apiName) { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)' } }}>
              {m.pluralLabel || m.apiName}
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header with sync buttons top-right */}
        <div className="px-5 py-3 flex items-center gap-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            {selectedModule || 'CRM'}
          </h2>
          {selectedModule && (
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>{records.length} kayıt</span>
          )}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ara..."
            className="ml-auto px-3 py-1.5 rounded-lg text-sm outline-none w-44"
            style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }} />
          {/* Sync buttons — top right */}
          <button onClick={syncMetadata} disabled={!selectedConn || syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all disabled:opacity-40"
            style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            Metadata Sync
          </button>
          <button onClick={syncFields} disabled={!selectedConn || syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all disabled:opacity-40"
            style={{ background: 'rgba(38,166,154,0.12)', color: 'var(--accent)', border: '1px solid rgba(38,166,154,0.2)' }}>
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            Sync Fields
          </button>
        </div>

        {/* Content */}
        {!selectedModule ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: 'var(--text-3)' }}>
            <Database size={40} className="opacity-20" />
            <p className="text-sm">Sol panelden bir modül seçin</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32" style={{ color: 'var(--text-3)' }}>Yükleniyor...</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0" style={{ background: 'var(--surface-2)' }}>
                    <tr>
                      {displayFields.map((f: any) => (
                        <th key={f.apiName} className="px-4 py-3 text-left font-medium text-xs" style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
                          {f.fieldLabel || f.apiName}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r: any, i: number) => (
                      <tr key={i} onClick={() => setDrawer(r)}
                        className="cursor-pointer transition-all"
                        style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                        {displayFields.map((f: any) => (
                          <td key={f.apiName} className="px-4 py-3 truncate max-w-[180px]" style={{ color: 'var(--text-2)' }}>
                            {String(r[f.apiName] ?? r[f.fieldLabel] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-4 py-2.5 flex items-center gap-3 text-xs" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-lg disabled:opacity-40 transition-all"
                style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                ← Önceki
              </button>
              <span style={{ color: 'var(--text-3)' }}>Sayfa {page}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={records.length < 50}
                className="px-3 py-1.5 rounded-lg disabled:opacity-40 transition-all"
                style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                Sonraki →
              </button>
            </div>
          </>
        )}
      </main>

      {/* Record detail drawer */}
      {drawer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end" onClick={() => setDrawer(null)}>
          <div className="w-96 h-full overflow-y-auto p-6 shadow-2xl" style={{ background: 'var(--surface)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Kayıt Detayı</h3>
              <button onClick={() => setDrawer(null)} style={{ color: 'var(--text-3)' }}>
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              {Object.entries(drawer).filter(([, v]) => v !== null && v !== '').map(([k, v]) => (
                <div key={k} className="py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>{k}</span>
                  <p className="text-sm mt-0.5 break-words" style={{ color: 'var(--text-2)' }}>
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

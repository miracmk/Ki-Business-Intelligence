import { useEffect, useState, useRef, useCallback } from 'react'
import { X, RefreshCw, Database, Play, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import api from '../lib/api'

interface SyncState { moduleApiName: string; totalRecords: number | null; lastFullSync: string | null; status: string }
interface BulkJob   { moduleApiName: string; status: string; recordsCount: number | null; createdAt: string }

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
  const [syncStates,     setSyncStates]     = useState<Record<string, SyncState>>({})
  const [recentJobs,     setRecentJobs]     = useState<BulkJob[]>([])
  const [polling,        setPolling]        = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  const loadSyncStatus = useCallback((connId: string) => {
    api.get(`/crm/connections/${connId}/sync-status`).then(r => {
      const stateMap: Record<string, SyncState> = {}
      for (const s of (r.data.syncState ?? []) as SyncState[]) {
        stateMap[s.moduleApiName] = s
      }
      setSyncStates(stateMap)
      setRecentJobs(r.data.recentJobs ?? [])

      // Check if any job is still running
      const anyRunning = (r.data.recentJobs ?? []).some((j: BulkJob) => j.status === 'pending' || j.status === 'running')
      if (!anyRunning && polling) {
        setPolling(false)
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      }
    }).catch(() => {})
  }, [polling])

  useEffect(() => {
    if (!selectedConn) return
    api.get(`/crm/connections/${selectedConn}/modules`).then(r => setModules(r.data.modules ?? []))
    loadSyncStatus(selectedConn)
  }, [selectedConn])

  // Poll every 5s when sync is running
  useEffect(() => {
    if (polling && selectedConn) {
      pollRef.current = setInterval(() => loadSyncStatus(selectedConn), 5000)
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [polling, selectedConn, loadSyncStatus])

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

  const syncMetadata = () => {
    setSyncing(true)
    api.post(`/crm/connections/${selectedConn}/sync/metadata`)
      .then(() => setTimeout(() => api.get(`/crm/connections/${selectedConn}/modules`).then(r => setModules(r.data.modules ?? [])), 2000))
      .finally(() => setSyncing(false))
  }

  const startFullSync = () => {
    if (!selectedConn) return
    setSyncing(true)
    api.post(`/crm/connections/${selectedConn}/sync/full`)
      .then(() => { setPolling(true); loadSyncStatus(selectedConn) })
      .catch(() => {})
      .finally(() => setSyncing(false))
  }

  const startEntityEtl = () => {
    if (!selectedConn) return
    setSyncing(true)
    api.post(`/crm/connections/${selectedConn}/sync/entity`)
      .then(() => alert('ETL başlatıldı. Tüm veriler aynalalanıyor ve AI ile normalize ediliyor. Bu işlem birkaç dakika sürebilir.'))
      .catch((e: any) => alert(e.response?.data?.error || 'ETL başlatılamadı'))
      .finally(() => setSyncing(false))
  }

  const displayFields = fields.slice(0, 8)
  const filtered      = records.filter(r => !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase()))

  // Running jobs summary
  const runningJobs = recentJobs.filter(j => j.status === 'pending' || j.status === 'running')
  const doneJobs    = recentJobs.filter(j => j.status === 'completed').slice(0, 3)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Module sidebar */}
      <aside className="w-64 flex flex-col" style={{ background: 'var(--surface-2)', borderRight: '1px solid var(--border)' }}>
        <div className="p-3 space-y-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <select value={selectedConn} onChange={e => setSelectedConn(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--surface)', color: 'var(--text-1)', border: '1px solid var(--border)' }}>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={syncMetadata} disabled={!selectedConn || syncing} title="Metadata Sync — Tablo/modül yapısını tara"
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs transition-all disabled:opacity-40"
              style={{ background: 'var(--surface)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
              <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
              Modüller
            </button>
            <button onClick={startFullSync} disabled={!selectedConn || syncing || polling} title="Ham veri sync (crm_records)"
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs transition-all disabled:opacity-40"
              style={{ background: polling ? 'rgba(45,138,107,0.15)' : 'rgba(45,138,107,0.85)', color: '#fff' }}>
              {polling ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
              {polling ? 'Sync...' : 'Ham Sync'}
            </button>
          </div>
          <button onClick={startEntityEtl} disabled={!selectedConn || syncing}
            title="Tüm verileri aynala → AI ile normalize et → Entity DB'ye yaz"
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs transition-all disabled:opacity-40"
            style={{ background: 'rgba(99,102,241,0.85)', color: '#fff' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
            AI Aynala + Entity DB'ye Yaz
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {modules.length === 0 ? (
            <div className="text-center py-10 px-4 space-y-2">
              <Database size={28} className="mx-auto opacity-30" style={{ color: 'var(--text-3)' }} />
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>Modül yok — "Modüller" butonuna tıklayın</p>
            </div>
          ) : modules.map((m: any) => {
            const ss = syncStates[m.apiName]
            return (
              <button key={m.apiName} onClick={() => selectModule(m.apiName)}
                className="w-full text-left px-3 py-2.5 rounded-lg mb-0.5 transition-all"
                style={selectedModule === m.apiName
                  ? { background: 'rgba(38,166,154,0.14)', color: 'var(--accent)' }
                  : { color: 'var(--text-2)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm truncate">{m.pluralLabel || m.apiName}</span>
                  {ss?.status === 'running' && <Loader2 size={10} className="animate-spin flex-shrink-0" style={{ color: 'var(--forest)' }} />}
                  {ss?.status === 'done'    && <CheckCircle2 size={10} className="flex-shrink-0" style={{ color: 'var(--forest)' }} />}
                  {ss?.status === 'error'   && <AlertCircle size={10} className="flex-shrink-0 text-red-400" />}
                </div>
                {ss && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {ss.totalRecords != null && (
                      <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>{ss.totalRecords.toLocaleString('tr-TR')} kayıt</span>
                    )}
                    {ss.lastFullSync && (
                      <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                        · {new Date(ss.lastFullSync).toLocaleDateString('tr-TR')}
                      </span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Sync status banner */}
        {(runningJobs.length > 0 || doneJobs.length > 0) && (
          <div className="px-5 py-2 text-xs flex items-center gap-3 flex-wrap"
            style={{ background: polling ? 'rgba(45,138,107,0.07)' : 'rgba(45,138,107,0.04)', borderBottom: '1px solid var(--border)' }}>
            {runningJobs.length > 0 && (
              <span className="flex items-center gap-1.5" style={{ color: 'var(--forest)' }}>
                <Loader2 size={11} className="animate-spin" />
                {runningJobs.length} modül sync ediliyor...
              </span>
            )}
            {doneJobs.map(j => (
              <span key={j.moduleApiName + j.createdAt} className="flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
                <CheckCircle2 size={11} style={{ color: 'var(--forest)' }} />
                {j.moduleApiName}: {j.recordsCount?.toLocaleString('tr-TR') ?? '?'} kayıt
              </span>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="px-5 py-3 flex items-center gap-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            {selectedModule || 'CRM'}
          </h2>
          {selectedModule && syncStates[selectedModule] && (
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>
              {syncStates[selectedModule].totalRecords?.toLocaleString('tr-TR') ?? records.length} kayıt
            </span>
          )}
          {selectedModule && !syncStates[selectedModule] && (
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>{records.length} kayıt (yerel)</span>
          )}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ara..."
            className="ml-auto px-3 py-1.5 rounded-lg text-sm outline-none w-44"
            style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }} />
        </div>

        {/* Content */}
        {!selectedModule ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: 'var(--text-3)' }}>
            <Database size={40} className="opacity-20" />
            <p className="text-sm">Sol panelden bir modül seçin</p>
            {modules.length === 0 && selectedConn && (
              <button onClick={syncMetadata} disabled={syncing}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm disabled:opacity-40"
                style={{ background: 'rgba(45,138,107,0.85)', color: '#fff' }}>
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                Modülleri Getir
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32" style={{ color: 'var(--text-3)' }}>
                  <Loader2 size={20} className="animate-spin" />
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0" style={{ background: 'var(--surface-2)' }}>
                    <tr>
                      {displayFields.map((f: any) => (
                        <th key={f.apiName} className="px-4 py-3 text-left font-medium text-xs"
                          style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
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

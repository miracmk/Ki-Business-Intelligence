import { useEffect, useState } from 'react'
import { Plus, Trash2, RefreshCw, Lock, Check, AlertCircle } from 'lucide-react'
import api from '../lib/api'

interface Connection { id: string; provider: string; name: string; isActive?: boolean; lastSyncAt?: string }
interface Listing { id: string; connectionId: string; provider?: string; connectionName?: string; productId?: string; productName?: string; marketplaceSku?: string; priceOverride?: number; isActive?: boolean }
interface MpOrder { id: string; provider?: string; orderNumber?: string; externalOrderId: string; externalStatus?: string; importedAt?: string }
interface Product { id: string; name: string; sku?: string }

const PROVIDERS = [
  { id: 'amazon', label: 'Amazon' }, { id: 'ebay', label: 'eBay' }, { id: 'walmart', label: 'Walmart' },
  { id: 'trendyol', label: 'Trendyol' }, { id: 'hepsiburada', label: 'Hepsiburada' },
]

const TABS = [
  { id: 'connections', label: 'Pazaryeri Bağlantıları' },
  { id: 'listings', label: 'İlanlar' },
  { id: 'orders', label: 'Pazaryeri Siparişleri' },
]

const iCls = 'w-full px-3 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-white text-sm focus:outline-none focus:border-[#6366f1]'

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-gray-400">{label}</label><div className="mt-1">{children}</div></div>
}

export default function Ecommerce() {
  const [entitled, setEntitled] = useState<boolean | null>(null)
  const [activating, setActivating] = useState(false)
  const [tab, setTab] = useState('connections')
  const [connections, setConnections] = useState<Connection[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [orders, setOrders] = useState<MpOrder[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)

  const [connForm, setConnForm] = useState({ provider: 'trendyol', name: '', apiKey: '', apiSecret: '' })
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [listingForm, setListingForm] = useState({ connectionId: '', productId: '', marketplaceSku: '' })
  const [showListingForm, setShowListingForm] = useState(false)

  const checkEntitlement = async () => {
    try {
      const { data } = await api.get('/entitlements')
      const row = (data.entitlements ?? []).find((e: any) => e.moduleKey === 'addon_ecommerce')
      setEntitled(!!row && ['active', 'trial'].includes(row.status))
    } catch { setEntitled(false) }
  }

  const loadAll = async () => {
    setLoading(true)
    try {
      const [c, l, o, p] = await Promise.all([
        api.get('/ecommerce-native/connections').then(r => r.data.connections ?? []),
        api.get('/ecommerce-native/listings').then(r => r.data.listings ?? []),
        api.get('/ecommerce-native/orders').then(r => r.data.orders ?? []),
        api.get('/erp-native/products').then(r => r.data.products ?? []),
      ])
      setConnections(c); setListings(l); setOrders(o); setProducts(p)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  useEffect(() => { checkEntitlement() }, [])
  useEffect(() => { if (entitled) loadAll() }, [entitled])

  const activate = async () => {
    setActivating(true)
    try { await api.post('/entitlements/addon_ecommerce/activate', {}); await checkEntitlement() }
    catch (err) { console.error(err) }
    setActivating(false)
  }

  const testConnection = async () => {
    setTestStatus('testing')
    try {
      const { data } = await api.post('/ecommerce-native/connections/test', { provider: connForm.provider, name: connForm.name, credentials: { apiKey: connForm.apiKey, apiSecret: connForm.apiSecret } })
      setTestStatus(data.ok ? 'ok' : 'error')
    } catch { setTestStatus('error') }
  }

  const saveConnection = async () => {
    await api.post('/ecommerce-native/connections', { provider: connForm.provider, name: connForm.name || connForm.provider, credentials: { apiKey: connForm.apiKey, apiSecret: connForm.apiSecret } })
    setConnForm({ provider: 'trendyol', name: '', apiKey: '', apiSecret: '' }); setTestStatus('idle'); loadAll()
  }

  const saveListing = async () => {
    await api.post('/ecommerce-native/listings', { ...listingForm, productId: listingForm.productId || null })
    setShowListingForm(false); setListingForm({ connectionId: '', productId: '', marketplaceSku: '' }); loadAll()
  }

  if (entitled === null) return <div className="p-8 text-gray-400">Yükleniyor...</div>

  if (!entitled) {
    return (
      <div className="p-8">
        <div className="max-w-xl mx-auto mt-16 p-8 rounded-3xl border border-[#2a2a2a] bg-[#111111] text-center space-y-4">
          <Lock size={40} className="mx-auto text-[#6366f1]" />
          <h1 className="text-2xl font-bold text-white">E-Commerce Management</h1>
          <p className="text-gray-400">Amazon, eBay, Walmart, Trendyol, Hepsiburada pazaryeri bağlantıları — tek panelden envanter ve sipariş yönetimi. Native add-on modülü.</p>
          <button onClick={activate} disabled={activating} className="px-6 py-3 rounded-2xl bg-[#6366f1] text-white font-medium disabled:opacity-50">
            {activating ? 'Etkinleştiriliyor...' : 'Modülü Etkinleştir'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">E-Commerce</h1>
          <p className="text-gray-400">Pazaryeri bağlantıları, ilanlar ve siparişler</p>
        </div>
        <button onClick={loadAll} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-gray-300 hover:text-white">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-2xl text-sm font-medium whitespace-nowrap ${tab === t.id ? 'bg-[#6366f1] text-white' : 'bg-[#111111] text-gray-300 border border-[#2a2a2a]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'connections' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="p-6 bg-[#111111] rounded-3xl border border-[#2a2a2a] space-y-4">
            <h3 className="text-base font-semibold text-white">Yeni Pazaryeri Bağlantısı</h3>
            <F label="Pazaryeri">
              <select value={connForm.provider} onChange={e => { setConnForm({ ...connForm, provider: e.target.value }); setTestStatus('idle') }} className={iCls}>
                {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </F>
            <F label="Bağlantı Adı"><input value={connForm.name} onChange={e => setConnForm({ ...connForm, name: e.target.value })} className={iCls} placeholder={PROVIDERS.find(p => p.id === connForm.provider)?.label} /></F>
            <F label="API Key"><input value={connForm.apiKey} onChange={e => { setConnForm({ ...connForm, apiKey: e.target.value }); setTestStatus('idle') }} className={iCls} /></F>
            <F label="API Secret"><input type="password" value={connForm.apiSecret} onChange={e => { setConnForm({ ...connForm, apiSecret: e.target.value }); setTestStatus('idle') }} className={iCls} /></F>
            <div className="flex items-center gap-3">
              <button onClick={testConnection} disabled={testStatus === 'testing'} className="flex-1 px-4 py-2.5 rounded-2xl border border-[#2a2a2a] text-sm text-gray-300 hover:text-white disabled:opacity-50">
                {testStatus === 'testing' ? 'Test ediliyor...' : 'Bağlantıyı Test Et'}
              </button>
              {testStatus === 'ok' && <span className="flex items-center gap-1 text-green-400 text-sm whitespace-nowrap"><Check size={14} /> Başarılı</span>}
              {testStatus === 'error' && <span className="flex items-center gap-1 text-red-400 text-sm whitespace-nowrap"><AlertCircle size={14} /> Hata</span>}
            </div>
            <button onClick={saveConnection} disabled={testStatus !== 'ok'} className="w-full px-4 py-2.5 rounded-2xl bg-[#6366f1] text-white text-sm disabled:opacity-50">
              Kaydet ve Bağla
            </button>
            <p className="text-xs text-gray-500">Not: Gerçek pazaryeri API senkronizasyonu (stok/fiyat push, sipariş pull) gelecek bir fazda eklenecek — bu test şu an simüle edilmiştir.</p>
          </div>
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-white">Bağlı Pazaryerleri</h3>
            {connections.length === 0 ? <p className="text-gray-500 text-sm">Henüz bağlantı yok.</p> : connections.map(c => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-4 bg-[#111111] rounded-2xl border border-[#2a2a2a]">
                <div><p className="text-white text-sm font-medium">{c.name}</p><p className="text-xs text-gray-400">{PROVIDERS.find(p => p.id === c.provider)?.label ?? c.provider}</p></div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${c.isActive ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'}`}>{c.isActive ? 'Aktif' : 'Pasif'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'listings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">İlanlar</h2>
            <button onClick={() => setShowListingForm(true)} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Yeni İlan</button>
          </div>
          {showListingForm && (
            <div className="p-6 rounded-3xl border border-[#2a2a2a] bg-[#111111] space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <F label="Pazaryeri Bağlantısı"><select value={listingForm.connectionId} onChange={e => setListingForm({ ...listingForm, connectionId: e.target.value })} className={iCls}><option value="">Seçin...</option>{connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></F>
                <F label="Ürün"><select value={listingForm.productId} onChange={e => setListingForm({ ...listingForm, productId: e.target.value })} className={iCls}><option value="">Seçin...</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></F>
                <F label="Pazaryeri SKU"><input value={listingForm.marketplaceSku} onChange={e => setListingForm({ ...listingForm, marketplaceSku: e.target.value })} className={iCls} /></F>
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowListingForm(false)} className="px-4 py-2 rounded-2xl border border-[#2a2a2a] text-gray-400">İptal</button>
                <button onClick={saveListing} disabled={!listingForm.connectionId} className="px-4 py-2 rounded-2xl bg-[#6366f1] text-white disabled:opacity-50">Kaydet</button>
              </div>
            </div>
          )}
          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-sm text-gray-300">
              <thead><tr><th className="px-6 py-4 text-left">Pazaryeri</th><th className="px-6 py-4 text-left">Ürün</th><th className="px-6 py-4 text-left">SKU</th><th className="px-6 py-4 text-right">İşlem</th></tr></thead>
              <tbody>
                {listings.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-500">İlan bulunamadı.</td></tr>
                ) : listings.map(l => (
                  <tr key={l.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                    <td className="px-6 py-4">{l.connectionName ?? '-'}</td>
                    <td className="px-6 py-4 text-white">{l.productName ?? '-'}</td>
                    <td className="px-6 py-4 font-mono text-xs">{l.marketplaceSku ?? '-'}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={async () => { await api.delete(`/ecommerce-native/listings/${l.id}`); loadAll() }} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-red-400"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'orders' && (
        <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
          <table className="min-w-full text-sm text-gray-300">
            <thead><tr><th className="px-6 py-4 text-left">Pazaryeri</th><th className="px-6 py-4 text-left">Harici Sipariş No</th><th className="px-6 py-4 text-left">ERP Sipariş No</th><th className="px-6 py-4 text-left">Durum</th></tr></thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-500">Pazaryeri siparişi bulunamadı.</td></tr>
              ) : orders.map(o => (
                <tr key={o.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                  <td className="px-6 py-4">{PROVIDERS.find(p => p.id === o.provider)?.label ?? o.provider}</td>
                  <td className="px-6 py-4 font-mono text-xs">{o.externalOrderId}</td>
                  <td className="px-6 py-4 font-mono text-xs text-white">{o.orderNumber ?? '-'}</td>
                  <td className="px-6 py-4">{o.externalStatus ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

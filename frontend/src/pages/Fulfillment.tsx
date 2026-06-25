import { useEffect, useState } from 'react'
import { Plus, RefreshCw, Lock, Truck } from 'lucide-react'
import api from '../lib/api'

interface Shipment { id: string; orderId: string; orderNumber?: string; trackingNumber?: string; carrier?: string; status: string; createdAt?: string }
interface Courier { id: string; name: string; carrierCode?: string; isActive?: boolean }
interface Order { id: string; orderNumber: string }

const STATUS_LBL: Record<string, string> = { picking: 'Toplanıyor', packed: 'Paketlendi', shipped: 'Sevk Edildi', out_for_delivery: 'Dağıtımda', delivered: 'Teslim Edildi', failed: 'Başarısız' }
const STATUS_CLS: Record<string, string> = { picking: 'bg-gray-700 text-gray-300', packed: 'bg-blue-900 text-blue-300', shipped: 'bg-purple-900 text-purple-300', out_for_delivery: 'bg-amber-900 text-amber-300', delivered: 'bg-green-900 text-green-300', failed: 'bg-red-900 text-red-300' }

const iCls = 'w-full px-3 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-white text-sm focus:outline-none focus:border-[#6366f1]'

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-gray-400">{label}</label><div className="mt-1">{children}</div></div>
}

export default function Fulfillment() {
  const [entitled, setEntitled] = useState<boolean | null>(null)
  const [activating, setActivating] = useState(false)
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [couriers, setCouriers] = useState<Courier[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [newForm, setNewForm] = useState({ orderId: '', courierId: '', trackingNumber: '', carrier: '' })
  const [showNew, setShowNew] = useState(false)

  const checkEntitlement = async () => {
    try {
      const { data } = await api.get('/entitlements')
      const row = (data.entitlements ?? []).find((e: any) => e.moduleKey === 'addon_fulfillment')
      setEntitled(!!row && ['active', 'trial'].includes(row.status))
    } catch { setEntitled(false) }
  }

  const loadAll = async () => {
    setLoading(true)
    try {
      const [s, c, o] = await Promise.all([
        api.get('/fulfillment-native/shipments').then(r => r.data.shipments ?? []),
        api.get('/fulfillment-native/couriers').then(r => r.data.couriers ?? []),
        api.get('/erp-native/orders').then(r => r.data.orders ?? []),
      ])
      setShipments(s); setCouriers(c); setOrders(o)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  useEffect(() => { checkEntitlement() }, [])
  useEffect(() => { if (entitled) loadAll() }, [entitled])

  const activate = async () => {
    setActivating(true)
    try { await api.post('/entitlements/addon_fulfillment/activate', {}); await checkEntitlement() }
    catch (err) { console.error(err) }
    setActivating(false)
  }

  const createShipment = async () => {
    await api.post('/fulfillment-native/shipments', { ...newForm, courierId: newForm.courierId || null })
    setShowNew(false); setNewForm({ orderId: '', courierId: '', trackingNumber: '', carrier: '' }); loadAll()
  }

  const advanceStatus = async (s: Shipment) => {
    const order = ['picking', 'packed', 'shipped', 'out_for_delivery', 'delivered']
    const next = order[order.indexOf(s.status) + 1]
    if (!next) return
    await api.put(`/fulfillment-native/shipments/${s.id}`, { status: next })
    loadAll()
  }

  if (entitled === null) return <div className="p-8 text-gray-400">Yükleniyor...</div>

  if (!entitled) {
    return (
      <div className="p-8">
        <div className="max-w-xl mx-auto mt-16 p-8 rounded-3xl border border-[#2a2a2a] bg-[#111111] text-center space-y-4">
          <Lock size={40} className="mx-auto text-[#6366f1]" />
          <h1 className="text-2xl font-bold text-white">Fulfillment Service Management</h1>
          <p className="text-gray-400">Kurye entegrasyonu, sevkiyat takibi ve depo çıkış yönetimi — native add-on modülü.</p>
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
          <h1 className="text-3xl font-bold text-white">Fulfillment</h1>
          <p className="text-gray-400">Sevkiyat ve depo çıkış yönetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-gray-300 hover:text-white">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Yenile
          </button>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Yeni Sevkiyat</button>
        </div>
      </div>

      {showNew && (
        <div className="p-6 rounded-3xl border border-[#2a2a2a] bg-[#111111] space-y-4">
          <h3 className="text-base font-semibold text-white">Yeni Sevkiyat</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Sipariş"><select value={newForm.orderId} onChange={e => setNewForm({ ...newForm, orderId: e.target.value })} className={iCls}><option value="">Seçin...</option>{orders.map(o => <option key={o.id} value={o.id}>{o.orderNumber}</option>)}</select></F>
            <F label="Kurye"><select value={newForm.courierId} onChange={e => setNewForm({ ...newForm, courierId: e.target.value })} className={iCls}><option value="">Seçin...</option>{couriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></F>
            <F label="Takip Numarası"><input value={newForm.trackingNumber} onChange={e => setNewForm({ ...newForm, trackingNumber: e.target.value })} className={iCls} /></F>
            <F label="Kargo Firması"><input value={newForm.carrier} onChange={e => setNewForm({ ...newForm, carrier: e.target.value })} className={iCls} /></F>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowNew(false)} className="px-4 py-2 rounded-2xl border border-[#2a2a2a] text-gray-400">İptal</button>
            <button onClick={createShipment} disabled={!newForm.orderId} className="px-4 py-2 rounded-2xl bg-[#6366f1] text-white disabled:opacity-50">Oluştur</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
        <table className="min-w-full text-sm text-gray-300">
          <thead><tr><th className="px-6 py-4 text-left">Sipariş</th><th className="px-6 py-4 text-left">Takip No</th><th className="px-6 py-4 text-left">Kargo</th><th className="px-6 py-4 text-left">Durum</th><th className="px-6 py-4 text-right">İşlem</th></tr></thead>
          <tbody>
            {shipments.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-500">Sevkiyat bulunamadı.</td></tr>
            ) : shipments.map(s => (
              <tr key={s.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                <td className="px-6 py-4 text-white font-mono text-xs">{s.orderNumber ?? s.orderId}</td>
                <td className="px-6 py-4 font-mono text-xs">{s.trackingNumber ?? '-'}</td>
                <td className="px-6 py-4">{s.carrier ?? '-'}</td>
                <td className="px-6 py-4"><span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_CLS[s.status] ?? 'bg-gray-700 text-gray-300'}`}>{STATUS_LBL[s.status] ?? s.status}</span></td>
                <td className="px-6 py-4 text-right">
                  {s.status !== 'delivered' && s.status !== 'failed' && (
                    <button onClick={() => advanceStatus(s)} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-[#6366f1]" title="İlerlet"><Truck size={16} /></button>
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

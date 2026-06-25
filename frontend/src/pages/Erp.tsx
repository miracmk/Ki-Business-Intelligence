import { useEffect, useState } from 'react'
import { Plus, Trash2, Edit2, X, RefreshCw, AlertTriangle } from 'lucide-react'
import api from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Product { id: string; sku?: string; name: string; category?: string; costPrice?: number; salePrice?: number; stockQuantity?: number; availableQuantity?: number; reorderPoint?: number; unit?: string; isActive?: boolean }
interface Supplier { id: string; name: string; contactName?: string; email?: string; phone?: string; rating?: number; isActive?: boolean }
interface Order { id: string; orderNumber: string; orderType: string; status?: string; total?: number; currency?: string; orderDate?: string; supplierId?: string }

const TABS = [
  { id: 'products', label: 'Ürünler' },
  { id: 'suppliers', label: 'Tedarikçiler' },
  { id: 'orders', label: 'Siparişler' },
]

const ORDER_STATUS_LBL: Record<string, string> = {
  draft: 'Taslak', confirmed: 'Onaylandı', ordered: 'Sipariş Verildi', partially_received: 'Kısmi Teslim',
  received: 'Teslim Alındı', processing: 'İşleniyor', picking: 'Toplanıyor', shipped: 'Sevk Edildi',
  delivered: 'Teslim Edildi', cancelled: 'İptal', returned: 'İade',
}
const ORDER_STATUS_CLS: Record<string, string> = {
  draft: 'bg-gray-700 text-gray-300', confirmed: 'bg-blue-900 text-blue-300', received: 'bg-green-900 text-green-300',
  delivered: 'bg-green-900 text-green-300', cancelled: 'bg-red-900 text-red-300', returned: 'bg-red-900 text-red-300',
}

const iCls = 'w-full px-3 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-white text-sm focus:outline-none focus:border-[#6366f1]'

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-gray-400">{label}</label><div className="mt-1">{children}</div></div>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#0f0f0f] rounded-3xl border border-[#2a2a2a] p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-white" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function Erp() {
  const [tab, setTab] = useState('products')
  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)

  const [productModal, setProductModal] = useState<any>(null)
  const [supplierModal, setSupplierModal] = useState<any>(null)
  const [orderModal, setOrderModal] = useState<any>(null)

  const loadAll = async () => {
    setLoading(true)
    try {
      const [p, s, o] = await Promise.all([
        api.get('/erp-native/products').then(r => r.data.products ?? []),
        api.get('/erp-native/suppliers').then(r => r.data.suppliers ?? []),
        api.get('/erp-native/orders').then(r => r.data.orders ?? []),
      ])
      setProducts(p); setSuppliers(s); setOrders(o)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  const lowStockCount = products.filter(p => p.reorderPoint != null && (p.availableQuantity ?? 0) <= (p.reorderPoint ?? 0)).length

  function ProductModal() {
    const [form, setForm] = useState(productModal?.data ?? { name: '', sku: '', category: '', unit: 'adet', costPrice: 0, salePrice: 0, stockQuantity: 0, reorderPoint: 0 })
    const save = async () => {
      productModal?.id ? await api.put(`/erp-native/products/${productModal.id}`, form) : await api.post('/erp-native/products', form)
      setProductModal(null); loadAll()
    }
    return (
      <Modal title={productModal?.id ? 'Ürün Düzenle' : 'Yeni Ürün'} onClose={() => setProductModal(null)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><F label="Ürün Adı"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={iCls} /></F></div>
          <F label="SKU"><input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} className={iCls} /></F>
          <F label="Kategori"><input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={iCls} /></F>
          <F label="Birim"><input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className={iCls} /></F>
          <F label="Maliyet Fiyatı"><input type="number" value={form.costPrice} onChange={e => setForm({ ...form, costPrice: Number(e.target.value) })} className={iCls} /></F>
          <F label="Satış Fiyatı"><input type="number" value={form.salePrice} onChange={e => setForm({ ...form, salePrice: Number(e.target.value) })} className={iCls} /></F>
          <F label="Stok Adedi"><input type="number" value={form.stockQuantity} onChange={e => setForm({ ...form, stockQuantity: Number(e.target.value) })} className={iCls} /></F>
          <F label="Yeniden Sipariş Noktası"><input type="number" value={form.reorderPoint} onChange={e => setForm({ ...form, reorderPoint: Number(e.target.value) })} className={iCls} /></F>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setProductModal(null)} className="px-4 py-2 rounded-2xl border border-[#2a2a2a] text-gray-400">İptal</button>
          <button onClick={save} className="px-4 py-2 rounded-2xl bg-[#6366f1] text-white">Kaydet</button>
        </div>
      </Modal>
    )
  }

  function SupplierModal() {
    const [form, setForm] = useState(supplierModal?.data ?? { name: '', contactName: '', email: '', phone: '', paymentTerms: 'net30', rating: 3 })
    const save = async () => {
      supplierModal?.id ? await api.put(`/erp-native/suppliers/${supplierModal.id}`, form) : await api.post('/erp-native/suppliers', form)
      setSupplierModal(null); loadAll()
    }
    return (
      <Modal title={supplierModal?.id ? 'Tedarikçi Düzenle' : 'Yeni Tedarikçi'} onClose={() => setSupplierModal(null)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><F label="Firma Adı"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={iCls} /></F></div>
          <F label="İletişim Kişisi"><input value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} className={iCls} /></F>
          <F label="Email"><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={iCls} /></F>
          <F label="Telefon"><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={iCls} /></F>
          <F label="Ödeme Koşulu"><input value={form.paymentTerms} onChange={e => setForm({ ...form, paymentTerms: e.target.value })} className={iCls} /></F>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setSupplierModal(null)} className="px-4 py-2 rounded-2xl border border-[#2a2a2a] text-gray-400">İptal</button>
          <button onClick={save} className="px-4 py-2 rounded-2xl bg-[#6366f1] text-white">Kaydet</button>
        </div>
      </Modal>
    )
  }

  function OrderModal() {
    const [form, setForm] = useState(orderModal?.data ?? { orderType: 'purchase', supplierId: '', status: 'draft', total: 0, currency: 'TRY', orderDate: new Date().toISOString().slice(0, 10) })
    const save = async () => {
      orderModal?.id ? await api.put(`/erp-native/orders/${orderModal.id}`, form) : await api.post('/erp-native/orders', form)
      setOrderModal(null); loadAll()
    }
    return (
      <Modal title={orderModal?.id ? 'Sipariş Düzenle' : 'Yeni Sipariş'} onClose={() => setOrderModal(null)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Tür"><select value={form.orderType} onChange={e => setForm({ ...form, orderType: e.target.value })} className={iCls}><option value="purchase">Alım</option><option value="sale">Satış</option></select></F>
          <F label="Tarih"><input type="date" value={form.orderDate} onChange={e => setForm({ ...form, orderDate: e.target.value })} className={iCls} /></F>
          {form.orderType === 'purchase' && (
            <F label="Tedarikçi"><select value={form.supplierId ?? ''} onChange={e => setForm({ ...form, supplierId: e.target.value || null })} className={iCls}><option value="">Seçin...</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></F>
          )}
          <F label="Durum"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={iCls}>
            {Object.entries(ORDER_STATUS_LBL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></F>
          <F label="Toplam"><input type="number" value={form.total} onChange={e => setForm({ ...form, total: Number(e.target.value) })} className={iCls} /></F>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setOrderModal(null)} className="px-4 py-2 rounded-2xl border border-[#2a2a2a] text-gray-400">İptal</button>
          <button onClick={save} className="px-4 py-2 rounded-2xl bg-[#6366f1] text-white">Kaydet</button>
        </div>
      </Modal>
    )
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">ERP</h1>
          <p className="text-gray-400">Stok, ürün, tedarikçi ve sipariş yönetimi</p>
        </div>
        <button onClick={loadAll} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-gray-300 hover:text-white">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>
      </div>

      {lowStockCount > 0 && (
        <div className="p-4 rounded-2xl border border-amber-900/50 bg-amber-950/30 flex items-center gap-3 text-amber-300 text-sm">
          <AlertTriangle size={18} /> {lowStockCount} üründe stok yeniden sipariş noktasının altında.
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-2xl text-sm font-medium whitespace-nowrap ${tab === t.id ? 'bg-[#6366f1] text-white' : 'bg-[#111111] text-gray-300 border border-[#2a2a2a]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {productModal !== null && <ProductModal />}
      {supplierModal !== null && <SupplierModal />}
      {orderModal !== null && <OrderModal />}

      {tab === 'products' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">Ürünler</h2>
            <button onClick={() => setProductModal({})} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Yeni Ürün</button>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-sm text-gray-300">
              <thead><tr><th className="px-6 py-4 text-left">Ürün</th><th className="px-6 py-4 text-left">SKU</th><th className="px-6 py-4 text-left">Stok</th><th className="px-6 py-4 text-left">Satış Fiyatı</th><th className="px-6 py-4 text-right">İşlem</th></tr></thead>
              <tbody>
                {products.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-500">Ürün bulunamadı.</td></tr>
                ) : products.map(p => (
                  <tr key={p.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                    <td className="px-6 py-4 text-white">{p.name}</td>
                    <td className="px-6 py-4 font-mono text-xs">{p.sku ?? '-'}</td>
                    <td className="px-6 py-4">
                      {p.availableQuantity ?? p.stockQuantity ?? 0} {p.unit ?? ''}
                      {p.reorderPoint != null && (p.availableQuantity ?? 0) <= p.reorderPoint && <span className="ml-2 text-amber-400 text-xs">Düşük</span>}
                    </td>
                    <td className="px-6 py-4">{(p.salePrice ?? 0).toLocaleString('tr-TR')}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setProductModal({ id: p.id, data: p })} className="p-1.5 rounded-lg hover:bg-[#2a2a2a]"><Edit2 size={14} /></button>
                        <button onClick={async () => { await api.delete(`/erp-native/products/${p.id}`); loadAll() }} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-red-400"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'suppliers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">Tedarikçiler</h2>
            <button onClick={() => setSupplierModal({})} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Yeni Tedarikçi</button>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-sm text-gray-300">
              <thead><tr><th className="px-6 py-4 text-left">Firma</th><th className="px-6 py-4 text-left">İletişim</th><th className="px-6 py-4 text-left">Email</th><th className="px-6 py-4 text-left">Telefon</th><th className="px-6 py-4 text-right">İşlem</th></tr></thead>
              <tbody>
                {suppliers.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-500">Tedarikçi bulunamadı.</td></tr>
                ) : suppliers.map(s => (
                  <tr key={s.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                    <td className="px-6 py-4 text-white">{s.name}</td>
                    <td className="px-6 py-4">{s.contactName ?? '-'}</td>
                    <td className="px-6 py-4">{s.email ?? '-'}</td>
                    <td className="px-6 py-4">{s.phone ?? '-'}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setSupplierModal({ id: s.id, data: s })} className="p-1.5 rounded-lg hover:bg-[#2a2a2a]"><Edit2 size={14} /></button>
                        <button onClick={async () => { await api.delete(`/erp-native/suppliers/${s.id}`); loadAll() }} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-red-400"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'orders' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">Siparişler</h2>
            <button onClick={() => setOrderModal({})} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Yeni Sipariş</button>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-sm text-gray-300">
              <thead><tr><th className="px-6 py-4 text-left">Sipariş No</th><th className="px-6 py-4 text-left">Tür</th><th className="px-6 py-4 text-left">Tarih</th><th className="px-6 py-4 text-left">Toplam</th><th className="px-6 py-4 text-left">Durum</th><th className="px-6 py-4 text-right">İşlem</th></tr></thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-500">Sipariş bulunamadı.</td></tr>
                ) : orders.map(o => (
                  <tr key={o.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                    <td className="px-6 py-4 text-white font-mono text-xs">{o.orderNumber}</td>
                    <td className="px-6 py-4">{o.orderType === 'purchase' ? 'Alım' : 'Satış'}</td>
                    <td className="px-6 py-4">{o.orderDate?.slice(0, 10) ?? '-'}</td>
                    <td className="px-6 py-4">{(o.total ?? 0).toLocaleString('tr-TR')} {o.currency ?? 'TRY'}</td>
                    <td className="px-6 py-4"><span className={`px-2 py-0.5 rounded-full text-xs ${ORDER_STATUS_CLS[o.status ?? ''] ?? 'bg-gray-700 text-gray-300'}`}>{ORDER_STATUS_LBL[o.status ?? ''] ?? o.status}</span></td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setOrderModal({ id: o.id, data: o })} className="p-1.5 rounded-lg hover:bg-[#2a2a2a]"><Edit2 size={14} /></button>
                        <button onClick={async () => { await api.delete(`/erp-native/orders/${o.id}`); loadAll() }} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-red-400"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

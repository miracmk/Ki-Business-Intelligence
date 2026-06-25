import { useEffect, useState } from 'react'
import { Plus, Trash2, RefreshCw, Lock, Send, Sparkles } from 'lucide-react'
import api from '../lib/api'

interface Campaign { id: string; name: string; subject: string; segment?: string; status: string; recipientCount?: number; sentCount?: number; failedCount?: number }
interface SocialPost { id: string; platform: string; content?: string; aiGenerated?: boolean; status: string; scheduledAt?: string }

const TABS = [{ id: 'campaigns', label: 'E-posta Kampanyaları' }, { id: 'social', label: 'Sosyal Medya Takvimi' }]
const SEGMENT_LBL: Record<string, string> = { all: 'Tüm Kişiler', lead: 'Lead', contact: 'Kişi', customer: 'Müşteri', partner: 'Partner', vendor: 'Tedarikçi' }
const PLATFORMS = [{ id: 'instagram', label: 'Instagram' }, { id: 'facebook', label: 'Facebook' }, { id: 'twitter', label: 'X (Twitter)' }, { id: 'linkedin', label: 'LinkedIn' }, { id: 'tiktok', label: 'TikTok' }]
const STATUS_CLS: Record<string, string> = { draft: 'bg-gray-700 text-gray-300', scheduled: 'bg-blue-900 text-blue-300', sending: 'bg-amber-900 text-amber-300', sent: 'bg-green-900 text-green-300', published: 'bg-green-900 text-green-300', failed: 'bg-red-900 text-red-300' }

const iCls = 'w-full px-3 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-white text-sm focus:outline-none focus:border-[#6366f1]'

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-gray-400">{label}</label><div className="mt-1">{children}</div></div>
}

export default function Marketing() {
  const [entitled, setEntitled] = useState<boolean | null>(null)
  const [activating, setActivating] = useState(false)
  const [tab, setTab] = useState('campaigns')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(false)
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const [campForm, setCampForm] = useState({ name: '', subject: '', body: '', segment: 'all' })
  const [showNewPost, setShowNewPost] = useState(false)
  const [postForm, setPostForm] = useState({ platform: 'instagram', content: '', topic: '' })
  const [generating, setGenerating] = useState(false)

  const checkEntitlement = async () => {
    try {
      const { data } = await api.get('/entitlements')
      const row = (data.entitlements ?? []).find((e: any) => e.moduleKey === 'addon_marketing')
      setEntitled(!!row && ['active', 'trial'].includes(row.status))
    } catch { setEntitled(false) }
  }

  const loadAll = async () => {
    setLoading(true)
    try {
      const [c, p] = await Promise.all([
        api.get('/marketing-native/campaigns').then(r => r.data.campaigns ?? []),
        api.get('/marketing-native/social-posts').then(r => r.data.posts ?? []),
      ])
      setCampaigns(c); setPosts(p)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  useEffect(() => { checkEntitlement() }, [])
  useEffect(() => { if (entitled) loadAll() }, [entitled])

  const activate = async () => {
    setActivating(true)
    try { await api.post('/entitlements/addon_marketing/activate', {}); await checkEntitlement() }
    catch (err) { console.error(err) }
    setActivating(false)
  }

  const createCampaign = async () => {
    await api.post('/marketing-native/campaigns', campForm)
    setShowNewCampaign(false); setCampForm({ name: '', subject: '', body: '', segment: 'all' }); loadAll()
  }

  const sendCampaign = async (id: string) => {
    if (!confirm('Bu kampanyayı şimdi göndermek istediğinize emin misiniz?')) return
    try {
      const { data } = await api.post(`/marketing-native/campaigns/${id}/send`)
      alert(`Gönderildi: ${data.sentCount}/${data.recipientCount} (başarısız: ${data.failedCount})`)
      loadAll()
    } catch (e: any) { alert(e?.response?.data?.error ?? 'Gönderim başarısız') }
  }

  const generateContent = async () => {
    if (!postForm.topic.trim()) return
    setGenerating(true)
    try {
      const { data } = await api.post('/marketing-native/social-posts/generate', { platform: postForm.platform, topic: postForm.topic })
      setPostForm({ ...postForm, content: data.content })
    } catch (e: any) { alert(e?.response?.data?.error ?? 'AI içerik üretimi başarısız (Premium AI gerekli olabilir)') }
    setGenerating(false)
  }

  const savePost = async () => {
    await api.post('/marketing-native/social-posts', { platform: postForm.platform, content: postForm.content, status: 'draft' })
    setShowNewPost(false); setPostForm({ platform: 'instagram', content: '', topic: '' }); loadAll()
  }

  if (entitled === null) return <div className="p-8 text-gray-400">Yükleniyor...</div>

  if (!entitled) {
    return (
      <div className="p-8">
        <div className="max-w-xl mx-auto mt-16 p-8 rounded-3xl border border-[#2a2a2a] bg-[#111111] text-center space-y-4">
          <Lock size={40} className="mx-auto text-[#6366f1]" />
          <h1 className="text-2xl font-bold text-white">Marketing Management</h1>
          <p className="text-gray-400">E-posta pazarlama kampanyaları ve sosyal medya içerik takvimi — native add-on modülü.</p>
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
          <h1 className="text-3xl font-bold text-white">Marketing</h1>
          <p className="text-gray-400">E-posta kampanyaları ve sosyal medya takvimi</p>
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

      {tab === 'campaigns' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">E-posta Kampanyaları</h2>
            <button onClick={() => setShowNewCampaign(true)} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Yeni Kampanya</button>
          </div>
          {showNewCampaign && (
            <div className="p-6 rounded-3xl border border-[#2a2a2a] bg-[#111111] space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <F label="Kampanya Adı"><input value={campForm.name} onChange={e => setCampForm({ ...campForm, name: e.target.value })} className={iCls} /></F>
                <F label="Hedef Segment"><select value={campForm.segment} onChange={e => setCampForm({ ...campForm, segment: e.target.value })} className={iCls}>{Object.entries(SEGMENT_LBL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></F>
                <div className="sm:col-span-2"><F label="Konu"><input value={campForm.subject} onChange={e => setCampForm({ ...campForm, subject: e.target.value })} className={iCls} /></F></div>
                <div className="sm:col-span-2"><F label="İçerik (HTML)"><textarea value={campForm.body} onChange={e => setCampForm({ ...campForm, body: e.target.value })} rows={4} className={iCls} /></F></div>
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowNewCampaign(false)} className="px-4 py-2 rounded-2xl border border-[#2a2a2a] text-gray-400">İptal</button>
                <button onClick={createCampaign} disabled={!campForm.name || !campForm.subject} className="px-4 py-2 rounded-2xl bg-[#6366f1] text-white disabled:opacity-50">Taslak Oluştur</button>
              </div>
            </div>
          )}
          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-sm text-gray-300">
              <thead><tr><th className="px-6 py-4 text-left">Ad</th><th className="px-6 py-4 text-left">Segment</th><th className="px-6 py-4 text-left">Durum</th><th className="px-6 py-4 text-left">Gönderim</th><th className="px-6 py-4 text-right">İşlem</th></tr></thead>
              <tbody>
                {campaigns.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-500">Kampanya bulunamadı.</td></tr>
                ) : campaigns.map(c => (
                  <tr key={c.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                    <td className="px-6 py-4 text-white">{c.name}</td>
                    <td className="px-6 py-4">{SEGMENT_LBL[c.segment ?? ''] ?? c.segment}</td>
                    <td className="px-6 py-4"><span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_CLS[c.status] ?? 'bg-gray-700 text-gray-300'}`}>{c.status}</span></td>
                    <td className="px-6 py-4">{c.status === 'sent' ? `${c.sentCount}/${c.recipientCount}` : '-'}</td>
                    <td className="px-6 py-4 text-right">
                      {c.status === 'draft' && (
                        <button onClick={() => sendCampaign(c.id)} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-[#6366f1]" title="Gönder"><Send size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'social' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">Sosyal Medya Takvimi</h2>
            <button onClick={() => setShowNewPost(true)} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Yeni Gönderi</button>
          </div>
          {showNewPost && (
            <div className="p-6 rounded-3xl border border-[#2a2a2a] bg-[#111111] space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <F label="Platform"><select value={postForm.platform} onChange={e => setPostForm({ ...postForm, platform: e.target.value })} className={iCls}>{PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></F>
                <F label="AI Konu (opsiyonel)"><input value={postForm.topic} onChange={e => setPostForm({ ...postForm, topic: e.target.value })} className={iCls} placeholder="örn: yeni ürün lansmanı" /></F>
              </div>
              <button onClick={generateContent} disabled={generating || !postForm.topic.trim()} className="flex items-center gap-2 px-4 py-2 rounded-2xl border border-[#6366f1] text-[#6366f1] text-sm disabled:opacity-50">
                <Sparkles size={14} /> {generating ? 'Üretiliyor...' : 'AI ile İçerik Üret (KiBI AI Premium gerekir)'}
              </button>
              <F label="İçerik"><textarea value={postForm.content} onChange={e => setPostForm({ ...postForm, content: e.target.value })} rows={4} className={iCls} /></F>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowNewPost(false)} className="px-4 py-2 rounded-2xl border border-[#2a2a2a] text-gray-400">İptal</button>
                <button onClick={savePost} disabled={!postForm.content} className="px-4 py-2 rounded-2xl bg-[#6366f1] text-white disabled:opacity-50">Taslak Kaydet</button>
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {posts.length === 0 ? <p className="text-gray-500 text-sm">Gönderi bulunamadı.</p> : posts.map(p => (
              <div key={p.id} className="p-4 rounded-2xl border border-[#2a2a2a] bg-[#111111] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{PLATFORMS.find(pl => pl.id === p.platform)?.label ?? p.platform}</span>
                  <div className="flex items-center gap-2">
                    {p.aiGenerated && <Sparkles size={12} className="text-[#6366f1]" />}
                    <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_CLS[p.status] ?? 'bg-gray-700 text-gray-300'}`}>{p.status}</span>
                    <button onClick={async () => { await api.delete(`/marketing-native/social-posts/${p.id}`); loadAll() }} className="text-red-400 hover:text-red-300"><Trash2 size={14} /></button>
                  </div>
                </div>
                <p className="text-sm text-white line-clamp-4">{p.content ?? '-'}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

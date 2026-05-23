import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, User, Mail, Lock, Briefcase, ArrowRight, Check } from 'lucide-react'
import api from '../lib/api'

const INDUSTRIES = [
  'Perakende', 'Toptan Ticaret', 'Üretim', 'İnşaat', 'Teknoloji',
  'Sağlık', 'Eğitim', 'Finans & Sigorta', 'Lojistik & Taşımacılık',
  'Turizm & Otelcilik', 'Gıda & Restoran', 'Hizmet Sektörü', 'Diğer',
]

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', companyName: '', industry: '' })
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState(false)
  const navigate = useNavigate()

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 8) { setError('Şifre en az 8 karakter olmalı'); return }
    setLoading(true); setError('')
    try {
      await api.post('/auth/register-entity', form)
      setSuccess(true)
      setTimeout(() => navigate('/app/login'), 2500)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Kayıt başarısız')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'rgba(45,138,107,0.15)' }}>
            <Building2 size={24} style={{ color: 'var(--forest)' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Ki Business Intelligence</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>Şirketiniz için hesap oluşturun</p>
        </div>

        <div className="rounded-2xl p-8" style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)' }}>
          {success ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: 'rgba(45,138,107,0.15)' }}>
                <Check size={28} style={{ color: 'var(--forest)' }} />
              </div>
              <h3 className="font-semibold text-lg mb-2" style={{ color: 'var(--text-1)' }}>Kayıt Başarılı!</h3>
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>Giriş sayfasına yönlendiriliyorsunuz…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Ad Soyad</label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
                  <input
                    required value={form.name} onChange={e => set('name', e.target.value)}
                    placeholder="Ad Soyad"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>E-posta</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
                  <input
                    type="email" required value={form.email} onChange={e => set('email', e.target.value)}
                    placeholder="ornek@sirket.com"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Şifre</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
                  <input
                    type="password" required minLength={8} value={form.password} onChange={e => set('password', e.target.value)}
                    placeholder="En az 8 karakter"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}
                  />
                </div>
              </div>

              {/* Company name */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Şirket Adı</label>
                <div className="relative">
                  <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
                  <input
                    required value={form.companyName} onChange={e => set('companyName', e.target.value)}
                    placeholder="Şirket Adı A.Ş."
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}
                  />
                </div>
              </div>

              {/* Industry */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Sektör</label>
                <div className="relative">
                  <Briefcase size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-3)' }} />
                  <select
                    value={form.industry} onChange={e => set('industry', e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none appearance-none"
                    style={{ background: 'var(--surface-2)', color: form.industry ? 'var(--text-1)' : 'var(--text-3)', border: '1px solid var(--border)' }}
                  >
                    <option value="">Sektör seçin (isteğe bağlı)</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
              </div>

              {error && (
                <div className="px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-all disabled:opacity-50"
                style={{ background: 'rgba(45,138,107,0.85)', color: '#fff' }}>
                {loading ? 'Hesap oluşturuluyor…' : <><span>Hesap Oluştur</span><ArrowRight size={16} /></>}
              </button>

              <p className="text-center text-xs" style={{ color: 'var(--text-3)' }}>
                Zaten hesabınız var mı?{' '}
                <Link to="/app/login" style={{ color: 'var(--forest)' }}>Giriş Yap</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api'

export default function Register() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    tenantName: '',
    phone: '',
    birthDate: '',
    otpPreference: 'email' as 'email' | 'whatsapp',
    enable2fa: true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/auth/register', {
        name: form.name,
        email: form.email,
        password: form.password,
        tenantName: form.tenantName,
      })
      setSuccess(true)
      setTimeout(() => navigate('/login'), 2000)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Kayıt başarısız')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f0f] py-12">
      <div className="w-full max-w-lg p-8 bg-[#1a1a1a] rounded-2xl shadow-xl">
        <h1 className="text-3xl font-bold mb-8 text-center text-white">Hesap Oluştur</h1>
        {success ? (
          <div className="text-center py-8">
            <div className="text-green-400 text-xl mb-4">Kayıt başarılı!</div>
            <div className="text-gray-400">Giriş sayfasına yönlendiriliyorsunuz...</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-2">Ad Soyad *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 bg-[#0f0f0f] border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent text-white"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-2">E-posta *</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-3 bg-[#0f0f0f] border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent text-white"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-2">Şifre *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-4 py-3 bg-[#0f0f0f] border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent text-white"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-2">Şirket Adı *</label>
                <input
                  type="text"
                  required
                  value={form.tenantName}
                  onChange={(e) => setForm({ ...form, tenantName: e.target.value })}
                  className="w-full px-4 py-3 bg-[#0f0f0f] border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Telefon (Önerilir)</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-4 py-3 bg-[#0f0f0f] border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Doğum Tarihi (Önerilir)</label>
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                  className="w-full px-4 py-3 bg-[#0f0f0f] border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent text-white"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-2">OTP Tercihi (Önerilir)</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="otpPreference"
                      value="email"
                      checked={form.otpPreference === 'email'}
                      onChange={(e) => setForm({ ...form, otpPreference: e.target.value as 'email' | 'whatsapp' })}
                      className="text-[#6366f1]"
                    />
                    E-posta
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="otpPreference"
                      value="whatsapp"
                      checked={form.otpPreference === 'whatsapp'}
                      onChange={(e) => setForm({ ...form, otpPreference: e.target.value as 'email' | 'whatsapp' })}
                      className="text-[#6366f1]"
                    />
                    WhatsApp
                  </label>
                </div>
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.enable2fa}
                    onChange={(e) => setForm({ ...form, enable2fa: e.target.checked })}
                    className="w-5 h-5 text-[#6366f1]"
                  />
                  <span className="text-gray-300">İki Faktörlü Doğrulama Açık (Önerilir)</span>
                </label>
              </div>
            </div>

            {error && <div className="text-red-400 text-sm">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#6366f1] hover:bg-[#4f46e5] text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Kayıt yapılıyor...' : 'Kayıt Ol'}
            </button>

            <div className="text-center text-gray-400">
              Zaten hesabınız var mı?{' '}
              <Link to="/login" className="text-[#6366f1] hover:underline">Giriş Yap</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

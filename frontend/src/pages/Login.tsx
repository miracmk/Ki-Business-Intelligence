import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { useAuth } from '../store/auth'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const navigate = useNavigate()
  const { setAuth } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/auth/login', { email, password })
      const data = res.data
      // Direct login (2FA disabled): API returns accessToken immediately
      if (data.accessToken) {
        setAuth(data.user, data.accessToken, data.refreshToken)
        navigate('/app/dashboard', { replace: true })
        return
      }
      // 2FA required: API returns { userId, methods }
      sessionStorage.setItem('2fa', JSON.stringify(data))
      navigate('/app/login/2fa')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Giriş başarısız')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Aurora glass card */}
      <div
        className="w-full max-w-md rounded-3xl p-8 relative overflow-hidden"
        style={{
          background: 'var(--surface)',
          backdropFilter: 'blur(30px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(30px) saturate(1.8)',
          border: '1px solid var(--border-s)',
          boxShadow: 'var(--shadow-lg), 0 0 80px rgba(38,166,154,0.08)',
        }}
      >
        {/* Top gradient accent */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }}
        />

        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{
              background: 'linear-gradient(135deg, var(--accent), var(--forest))',
              boxShadow: '0 8px 24px rgba(38,166,154,0.30)',
            }}
          >
            <span className="text-white text-2xl font-bold">K</span>
          </div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-1)' }}>
            <span style={{ color: 'var(--accent)' }}>Ki</span> Business Intelligence
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>
            Hesabınıza giriş yapın
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
              E-posta
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="ornek@mail.com"
              required
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--text-1)',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
              Şifre
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--text-1)',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl text-sm text-red-400 bg-red-500/10 border border-red-500/20">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-all duration-200 disabled:opacity-50 mt-2"
            style={{
              background: 'linear-gradient(135deg, var(--accent), var(--forest))',
              boxShadow: '0 4px 16px rgba(38,166,154,0.30)',
            }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 6px 24px rgba(38,166,154,0.45)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(38,166,154,0.30)')}
          >
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>

        {/* Bottom note */}
        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-3)' }}>
          Ki Business Intelligence © 2025 — Powered by KIBI AI
        </p>
      </div>
    </div>
  )
}

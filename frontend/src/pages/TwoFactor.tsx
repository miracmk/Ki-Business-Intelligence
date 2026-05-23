import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { useAuth } from '../store/auth'

export default function TwoFactor() {
  const [data, setData] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'totp' | 'otp'>('totp')
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [selectedChannel, setSelectedChannel] = useState<'whatsapp' | 'email' | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { setAuth } = useAuth()

  useEffect(() => {
    const raw = sessionStorage.getItem('2fa')
    if (!raw) { navigate('/app/login'); return }
    const parsed = JSON.parse(raw)
    setData(parsed)
    if (parsed.methods.includes('totp')) {
      setActiveTab('totp')
    } else {
      setActiveTab('otp')
    }
  }, [navigate])

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  if (!data) return null

  const handleSendCode = async (channel: 'whatsapp' | 'email') => {
    setSending(true)
    setError('')
    try {
      await api.post('/auth/otp/send', { userId: data.userId, channel })
      setSelectedChannel(channel)
      setCountdown(60)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Kod gönderimi başarısız')
    } finally {
      setSending(false)
    }
  }

  const handleVerify = async () => {
    setLoading(true)
    setError('')
    try {
      let res
      if (activeTab === 'totp') {
        res = await api.post('/auth/totp/verify', { userId: data.userId, token: code })
      } else if (selectedChannel) {
        res = await api.post('/auth/otp/verify', { userId: data.userId, channel: selectedChannel, code })
      }
      if (res) {
        setAuth(res.data.user, res.data.accessToken, res.data.refreshToken)
        sessionStorage.removeItem('2fa')
        navigate('/app/dashboard')
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Doğrulama başarısız')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div className="w-full max-w-md p-8 bg-[#111111] rounded-2xl border border-[#2a2a2a]">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">İki Faktörlü Doğrulama</h1>
          <p className="text-gray-500">Hesabınızı doğrulayın</p>
        </div>

        {(data.methods.includes('totp') && (data.methods.includes('whatsapp') || data.methods.includes('email'))) && (
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveTab('totp')}
              className={`flex-1 py-2 rounded-lg transition-colors ${
                activeTab === 'totp' ? 'bg-[#6366f1] text-white' : 'bg-[#222222] text-gray-400'
              }`}
            >
              Authenticator
            </button>
            <button
              onClick={() => setActiveTab('otp')}
              className={`flex-1 py-2 rounded-lg transition-colors ${
                activeTab === 'otp' ? 'bg-[#6366f1] text-white' : 'bg-[#222222] text-gray-400'
              }`}
            >
              Kod ile
            </button>
          </div>
        )}

        <div className="space-y-4">
          {activeTab === 'totp' && data.methods.includes('totp') && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Authenticator Kodu</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
                className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-center text-2xl tracking-[0.5em] focus:ring-2 focus:ring-[#6366f1]"
                placeholder="000000"
              />
            </div>
          )}

          {activeTab === 'otp' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                {data.methods.includes('whatsapp') && (
                  <button
                    onClick={() => handleSendCode('whatsapp')}
                    disabled={sending || countdown > 0}
                    className={`flex-1 py-2 rounded-lg transition-colors disabled:opacity-50 ${
                      selectedChannel === 'whatsapp' ? 'bg-green-700' : 'bg-green-600 hover:bg-green-700'
                    } text-white`}
                  >
                    {countdown > 0 && selectedChannel === 'whatsapp' ? `${countdown}s` : "WhatsApp'a Gönder"}
                  </button>
                )}
                {data.methods.includes('email') && (
                  <button
                    onClick={() => handleSendCode('email')}
                    disabled={sending || countdown > 0}
                    className={`flex-1 py-2 rounded-lg transition-colors disabled:opacity-50 ${
                      selectedChannel === 'email' ? 'bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'
                    } text-white`}
                  >
                    {countdown > 0 && selectedChannel === 'email' ? `${countdown}s` : "E-posta'ya Gönder"}
                  </button>
                )}
              </div>
              {selectedChannel && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Doğrulama Kodu</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={6}
                    className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-center text-2xl tracking-[0.5em] focus:ring-2 focus:ring-[#6366f1]"
                    placeholder="000000"
                  />
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-900/20 border border-red-900 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleVerify}
            disabled={loading || !code || (activeTab === 'otp' && !selectedChannel)}
            className="w-full py-3 bg-[#6366f1] hover:bg-[#4f46e5] text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Doğrulanıyor...' : 'Onayla'}
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { useAuthStore } from '../store'

export default function Login2FA() {
  const loginData = useAuthStore((s) => s.loginData)
  const setTokens = useAuthStore((s) => s.setTokens)
  const [code, setCode] = useState('')
  const [selectedChannel, setSelectedChannel] = useState<'whatsapp' | 'email' | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  if (!loginData) {
    navigate('/login')
    return null
  }

  const handleSendCode = async (channel: 'whatsapp' | 'email') => {
    setSending(true)
    setError('')
    try {
      await api.post('/auth/otp/send', { userId: loginData.userId, channel })
      setSelectedChannel(channel)
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
      if (loginData.methods.includes('totp')) {
        res = await api.post('/auth/totp/verify', { userId: loginData.userId, token: code })
      } else if (selectedChannel) {
        res = await api.post('/auth/otp/verify', { userId: loginData.userId, channel: selectedChannel, code })
      }
      if (res) {
        setTokens(res.data.accessToken, res.data.refreshToken)
        navigate('/dashboard')
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Doğrulama başarısız')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f0f]">
      <div className="w-full max-w-md p-8 bg-[#1a1a1a] rounded-2xl shadow-xl">
        <h1 className="text-2xl font-bold mb-6 text-center text-white">İki Faktörlü Doğrulama</h1>
        <div className="space-y-6">
          {loginData.methods.includes('totp') && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Authenticator Kodu</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-4 py-3 bg-[#0f0f0f] border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent text-white"
                placeholder="6 haneli kod"
              />
            </div>
          )}
          {(loginData.methods.includes('whatsapp') || loginData.methods.includes('email')) && (
            <div className="space-y-4">
              <div className="flex gap-2">
                {loginData.methods.includes('whatsapp') && (
                  <button
                    onClick={() => handleSendCode('whatsapp')}
                    disabled={sending}
                    className={`flex-1 py-2 text-white rounded-lg transition-colors disabled:opacity-50 ${selectedChannel === 'whatsapp' ? 'bg-green-700' : 'bg-green-600 hover:bg-green-700'}`}
                  >
                    WhatsApp ile Gönder
                  </button>
                )}
                {loginData.methods.includes('email') && (
                  <button
                    onClick={() => handleSendCode('email')}
                    disabled={sending}
                    className={`flex-1 py-2 text-white rounded-lg transition-colors disabled:opacity-50 ${selectedChannel === 'email' ? 'bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                  >
                    E-posta ile Gönder
                  </button>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Doğrulama Kodu</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0f0f0f] border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent text-white"
                  placeholder="Kodu girin"
                />
              </div>
            </div>
          )}
          {error && <div className="text-red-400 text-sm">{error}</div>}
          <button
            onClick={handleVerify}
            disabled={loading || !code || (!loginData.methods.includes('totp') && !selectedChannel)}
            className="w-full py-3 bg-[#6366f1] hover:bg-[#4f46e5] text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Doğrulanıyor...' : 'Onayla'}
          </button>
        </div>
      </div>
    </div>
  )
}

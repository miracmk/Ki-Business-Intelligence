import { useEffect, useState } from 'react'
import { Wallet, ArrowUpRight, ArrowDownRight, ExternalLink, RefreshCw, Plus, AlertTriangle, Calendar, Users, MessageSquare } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../store/auth'

interface WalletData {
  id: string
  email: string
  walletId: string
  balanceKiCoin: string
  balanceUsd: string
  lastSyncAt: string | null
}

interface Transaction {
  id: string
  type: string
  amountKiCoin: string
  amountUsd: string
  description: string
  balanceAfter: string
  createdAt: string
}

interface Package {
  id: string
  tier: number
  name: string
  displayName: string
  description: string
  guaranteedTokensInput: number
  guaranteedTokensOutput: number
  minUsers: number
  maxUsers: number
  basePriceUsd: string
  tokenMarkup: string
  isPayAsYouGo: boolean
  paygTokenMultiplier: string
  allowedModelTier: string
  monthlyMessageLimit: number | null
  perMessagePriceUsd: string
  overageMessagePriceUsd: string
  extraSubUserPriceUsd: string
  maxDebtTokens: number
}

interface BillingStatus {
  planName: string
  nextBillingAt: string | null
  billingCycleStart: string | null
  extraSubUsers: number
  debtTokens: number
  isBillingRestricted: boolean
  messagesUsedThisMonth: number
  monthlyMessageLimit: number | null
  basePriceUsd: number
  perMessagePriceUsd: number
  overageMessagePriceUsd: number
  extraSubUserPriceUsd: number
}

const TIER_COLORS: Record<number, string> = {
  1: 'rgba(59,130,246,0.15)',
  2: 'rgba(38,166,154,0.15)',
  3: 'rgba(139,92,246,0.15)',
  4: 'rgba(245,158,11,0.15)',
}
const TIER_BORDER: Record<number, string> = {
  1: 'rgba(59,130,246,0.3)',
  2: 'rgba(38,166,154,0.3)',
  3: 'rgba(139,92,246,0.3)',
  4: 'rgba(245,158,11,0.3)',
}
const TIER_TEXT: Record<number, string> = {
  1: '#60a5fa',
  2: 'var(--accent)',
  3: '#a78bfa',
  4: '#fbbf24',
}

function RegisterModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [email, setEmail]       = useState('')
  const [walletId, setWalletId] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const submit = async () => {
    if (!email || !walletId) return
    setLoading(true)
    setError('')
    try {
      await api.post('/wallet/register', { email, walletId })
      onSuccess()
      onClose()
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Kayıt başarısız')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md rounded-2xl"
        style={{ background: 'var(--surface-modal)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Ki Wallet Bağla</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Entity'ye kayıtlı e-posta ve Wallet ID ile eşleştirin</p>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>E-posta Adresi</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email"
              placeholder="kibusiness.global@gmail.com"
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>Wallet ID</label>
            <input value={walletId} onChange={e => setWalletId(e.target.value)}
              placeholder="0x... veya cüzdan adresiniz"
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none font-mono"
              style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }} />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex gap-3 px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm"
            style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>İptal</button>
          <button onClick={submit} disabled={loading || !email || !walletId}
            className="flex-1 py-2 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: 'rgba(38,166,154,0.85)', color: '#fff' }}>
            {loading ? 'Bağlanıyor…' : 'Bağla'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function KiWallet() {
  const { user } = useAuth()
  const isMain = ['entity_main', 'admin', 'supervisor'].includes((user as any)?.role ?? '')

  const [wallet,         setWallet]         = useState<WalletData | null>(null)
  const [transactions,   setTransactions]   = useState<Transaction[]>([])
  const [packages,       setPackages]       = useState<Package[]>([])
  const [billingStatus,  setBillingStatus]  = useState<BillingStatus | null>(null)
  const [topUpUrl,       setTopUpUrl]       = useState<string | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [showRegister,   setShowRegister]   = useState(false)
  const [syncing,        setSyncing]        = useState(false)

  const loadWallet = async () => {
    try {
      const res = await api.get('/wallet')
      setWallet(res.data.wallet ?? null)
      setTopUpUrl(res.data.topUpUrl ?? null)
    } catch { /* non-fatal */ }
  }

  const loadTransactions = async () => {
    try {
      const res = await api.get('/wallet/transactions')
      setTransactions(res.data.transactions ?? [])
    } catch { /* non-fatal */ }
  }

  const loadPackages = async () => {
    try {
      const res = await api.get('/wallet/packages')
      setPackages(res.data.packages ?? [])
    } catch { /* non-fatal */ }
  }

  const loadBillingStatus = async () => {
    try {
      const res = await api.get('/wallet/billing-status')
      setBillingStatus(res.data)
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    Promise.all([loadWallet(), loadTransactions(), loadPackages(), loadBillingStatus()])
      .finally(() => setLoading(false))
  }, [])

  const refreshBalance = async () => {
    setSyncing(true)
    await Promise.all([loadWallet(), loadTransactions(), loadBillingStatus()])
    setSyncing(false)
  }

  const PLAN_LABELS: Record<string, string> = {
    free: 'Ücretsiz', basic: 'Başlangıç', premium: 'Premium',
    enterprise: 'Kurumsal', custom_models: 'Özel Modeller',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 rounded-full animate-spin border-2 border-t-transparent" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(38,166,154,0.15)' }}>
          <Wallet size={20} style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>Ki Wallet</h1>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>KIBI AI kullanım ödemeleri · Ki Coin bakiyesi</p>
        </div>
      </div>

      {/* Billing restriction warning */}
      {billingStatus?.isBillingRestricted && (
        <div className="rounded-2xl p-4 flex items-start gap-3"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <AlertTriangle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-400">Hesap Kısıtlandı</p>
            <p className="text-xs text-red-300 mt-0.5">
              Token borç limitinize ({(billingStatus.debtTokens ?? 0).toLocaleString('tr-TR')} / 100.000 token) ulaştınız.
              Ki Wallet bakiyenizi yükleyin ve yetkili ödeme yapıldığında kısıtlama kaldırılacaktır.
            </p>
          </div>
        </div>
      )}

      {/* Billing status card */}
      {billingStatus && (
        <div className="rounded-2xl p-5 space-y-4"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>FATURA DURUMU</p>
            {billingStatus.planName && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(38,166,154,0.15)', color: 'var(--accent)' }}>
                {PLAN_LABELS[billingStatus.planName] ?? billingStatus.planName}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Next billing */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <Calendar size={13} style={{ color: 'var(--text-3)' }} />
                <span className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-3)' }}>Sonraki Fatura</span>
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                {billingStatus.nextBillingAt
                  ? new Date(billingStatus.nextBillingAt).toLocaleDateString('tr-TR')
                  : '—'}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                ${billingStatus.basePriceUsd.toFixed(2)}/ay base
              </p>
            </div>

            {/* Messages */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <MessageSquare size={13} style={{ color: 'var(--text-3)' }} />
                <span className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-3)' }}>Mesaj Kullanımı</span>
              </div>
              {billingStatus.monthlyMessageLimit !== null ? (
                <>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                    {billingStatus.messagesUsedThisMonth} / {billingStatus.monthlyMessageLimit}
                  </p>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (billingStatus.messagesUsedThisMonth / billingStatus.monthlyMessageLimit) * 100)}%`,
                        background: billingStatus.messagesUsedThisMonth >= billingStatus.monthlyMessageLimit
                          ? 'rgba(239,68,68,0.8)' : 'var(--accent)',
                      }} />
                  </div>
                  {billingStatus.messagesUsedThisMonth >= billingStatus.monthlyMessageLimit && (
                    <p className="text-[10px] text-orange-400">Limit aşıldı — $0.03/mesaj ücretlendirilir</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                    {billingStatus.messagesUsedThisMonth} mesaj
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                    ${billingStatus.perMessagePriceUsd.toFixed(3)}/mesaj
                  </p>
                </>
              )}
            </div>

            {/* Extra sub-users */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <Users size={13} style={{ color: 'var(--text-3)' }} />
                <span className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-3)' }}>Ek Kullanıcı</span>
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                {billingStatus.extraSubUsers ?? 0} kişi
              </p>
              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                ${billingStatus.extraSubUserPriceUsd.toFixed(0)}/kişi/ay
              </p>
            </div>

            {/* Token debt */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <AlertTriangle size={13} style={{ color: (billingStatus.debtTokens ?? 0) > 0 ? 'rgb(251,191,36)' : 'var(--text-3)' }} />
                <span className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-3)' }}>Token Borcu</span>
              </div>
              <p className="text-sm font-semibold"
                style={{ color: (billingStatus.debtTokens ?? 0) > 0 ? 'rgb(251,191,36)' : 'var(--text-1)' }}>
                {(billingStatus.debtTokens ?? 0).toLocaleString('tr-TR')}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                maks. 100.000 token
              </p>
            </div>
          </div>
        </div>
      )}

      {!wallet ? (
        /* No wallet linked yet */
        <div className="rounded-2xl p-8 text-center space-y-4"
          style={{ background: 'var(--surface-2)', border: '2px dashed var(--border)' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: 'rgba(38,166,154,0.10)' }}>
            <Wallet size={28} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>Ki Wallet Bağlı Değil</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
              Pay-as-you-go veya KIBI tahsilatlarının Ki Wallet'tan yapılabilmesi için cüzdanınızı bağlayın.
            </p>
          </div>
          {isMain && (
            <button onClick={() => setShowRegister(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold mx-auto transition-all"
              style={{ background: 'rgba(38,166,154,0.85)', color: '#fff' }}>
              <Plus size={15} /> Ki Wallet Bağla
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Balance card */}
          <div className="rounded-2xl p-5 space-y-3"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>KI COIN BAKİYESİ</p>
              <button onClick={refreshBalance} disabled={syncing}
                className="p-1.5 rounded-lg transition-all disabled:opacity-50"
                style={{ color: 'var(--text-3)', background: 'var(--surface-3)' }}>
                <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              </button>
            </div>
            <div>
              <p className="text-3xl font-bold" style={{ color: 'var(--accent)' }}>
                {parseFloat(String(wallet.balanceKiCoin)).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                <span className="text-base font-normal ml-1" style={{ color: 'var(--text-3)' }}>Ki</span>
              </p>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
                ≈ ${parseFloat(String(wallet.balanceUsd)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} USD
              </p>
            </div>
            <div className="pt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>Wallet ID</p>
              <p className="text-xs font-mono mt-0.5 truncate" style={{ color: 'var(--text-2)' }}>{wallet.walletId}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{wallet.email}</p>
            </div>
            {wallet.lastSyncAt && (
              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                Son senkron: {new Date(wallet.lastSyncAt).toLocaleString('tr-TR')}
              </p>
            )}
            {topUpUrl && (
              <a href={topUpUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 justify-center w-full px-4 py-2 rounded-xl text-sm font-medium transition-all"
                style={{ background: 'rgba(38,166,154,0.15)', color: 'var(--accent)', border: '1px solid rgba(38,166,154,0.25)' }}>
                <ExternalLink size={13} /> Ki Wallet'a Para Yükle
              </a>
            )}
          </div>

          {/* Recent transactions */}
          <div className="rounded-2xl p-5 space-y-3"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>SON HAREKETLERİ</p>
            {transactions.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: 'var(--text-3)' }}>Henüz hareket yok</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {transactions.map(t => (
                  <div key={t.id} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${t.type === 'topup' ? 'text-green-400' : 'text-red-400'}`}
                      style={{ background: t.type === 'topup' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' }}>
                      {t.type === 'topup' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate" style={{ color: 'var(--text-2)' }}>{t.description || t.type}</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                        {new Date(t.createdAt).toLocaleDateString('tr-TR')}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-xs font-medium ${t.type === 'topup' ? 'text-green-400' : 'text-red-400'}`}>
                        {t.type === 'topup' ? '+' : '-'}{parseFloat(String(t.amountKiCoin)).toFixed(4)} Ki
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                        ${parseFloat(String(t.amountUsd)).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pricing Packages */}
      <div>
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-1)' }}>Fiyatlandırma Paketleri</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          {packages.map(pkg => (
            <div key={pkg.id} className="rounded-2xl p-4 flex flex-col"
              style={{ background: TIER_COLORS[pkg.tier] ?? 'var(--surface-2)', border: `1px solid ${TIER_BORDER[pkg.tier] ?? 'var(--border)'}` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: TIER_BORDER[pkg.tier], color: TIER_TEXT[pkg.tier] }}>
                  {pkg.name?.toUpperCase()}
                </span>
                {pkg.isPayAsYouGo && (
                  <span className="text-[10px] font-semibold" style={{ color: TIER_TEXT[pkg.tier] }}>PAYG</span>
                )}
              </div>

              <h3 className="text-sm font-bold" style={{ color: TIER_TEXT[pkg.tier] }}>{pkg.displayName}</h3>
              <p className="text-[10px] mt-1 flex-1" style={{ color: 'var(--text-3)' }}>{pkg.description}</p>

              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span style={{ color: 'var(--text-3)' }}>Kullanıcı</span>
                  <span style={{ color: 'var(--text-2)' }}>
                    {pkg.maxUsers >= 9999 ? 'Sınırsız' : `${pkg.minUsers}–${pkg.maxUsers}`}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span style={{ color: 'var(--text-3)' }}>Mesaj/ay</span>
                  <span style={{ color: 'var(--text-2)' }}>
                    {pkg.monthlyMessageLimit != null ? pkg.monthlyMessageLimit.toLocaleString('tr-TR') : '—'}
                  </span>
                </div>
                {pkg.isPayAsYouGo && (
                  <div className="flex justify-between text-[11px]">
                    <span style={{ color: 'var(--text-3)' }}>Mesaj fiyatı</span>
                    <span style={{ color: 'var(--text-2)' }}>
                      ${parseFloat(pkg.perMessagePriceUsd || '0').toFixed(3)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-[11px]">
                  <span style={{ color: 'var(--text-3)' }}>Aşım/mesaj</span>
                  <span style={{ color: 'var(--text-2)' }}>
                    ${parseFloat(pkg.overageMessagePriceUsd || '0.03').toFixed(3)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span style={{ color: 'var(--text-3)' }}>Ek kullanıcı</span>
                  <span style={{ color: 'var(--text-2)' }}>
                    ${parseFloat(pkg.extraSubUserPriceUsd || '25').toFixed(0)}/ay
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-2.5" style={{ borderTop: `1px solid ${TIER_BORDER[pkg.tier]}` }}>
                <p className="text-lg font-bold" style={{ color: TIER_TEXT[pkg.tier] }}>
                  ${parseFloat(pkg.basePriceUsd).toFixed(0)}
                  <span className="text-[11px] font-normal ml-1" style={{ color: 'var(--text-3)' }}>/ay</span>
                  {pkg.isPayAsYouGo && (
                    <span className="text-[10px] font-normal ml-1 block" style={{ color: 'var(--text-3)' }}>
                      + ${parseFloat(pkg.perMessagePriceUsd || '0').toFixed(3)}/mesaj
                    </span>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--text-3)' }}>
          * Limit aşımları $0.03/mesaj olarak Ki Wallet'tan tahsil edilir. Ek kullanıcı eklemek için Ki Wallet bakiyesi gerekir.
          Token borcu 100.000 tokeni aşarsa hesap kısıtlanır.
        </p>
      </div>

      {showRegister && <RegisterModal onClose={() => setShowRegister(false)} onSuccess={() => { loadWallet(); loadTransactions() }} />}
    </div>
  )
}

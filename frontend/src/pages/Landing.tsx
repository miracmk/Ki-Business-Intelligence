import { useNavigate } from 'react-router-dom'
import {
  Brain, Database, BarChart3, Shield, Zap, Users,
  Check, ArrowRight, MessageSquare, Bot, FileText,
  Globe, TrendingUp, Lock, ChevronRight,
} from 'lucide-react'

const FEATURES = [
  {
    icon: Brain,
    title: 'KIBI AI',
    desc: 'Doğal dil ile verilerinizi sorgulayın. "Bu ay en çok satan ürünlerim neler?" gibi sorular sorun, anında cevap alın.',
  },
  {
    icon: Database,
    title: 'CRM Entegrasyonu',
    desc: 'Zoho CRM, Salesforce ve diğer platformlarla sorunsuz entegrasyon. Tüm müşteri verileriniz tek bir yerde.',
  },
  {
    icon: BarChart3,
    title: 'Muhasebe & ERP',
    desc: 'Zoho Books, Xero ve diğer muhasebe sistemleriyle bağlantı kurun. Finansal verilerinizi anlık takip edin.',
  },
  {
    icon: Shield,
    title: 'Çok Kiracılı Güvenlik',
    desc: 'Entity bazlı tam izolasyon. Her şirketin verileri güvende, birbirinden tamamen ayrı.',
  },
  {
    icon: MessageSquare,
    title: 'WhatsApp Entegrasyonu',
    desc: 'WhatsApp Cloud API ile müşteri iletişiminizi platformunuza entegre edin.',
  },
  {
    icon: Zap,
    title: 'Anlık Senkronizasyon',
    desc: 'CRM ve muhasebe verileriniz otomatik senkronize edilir. Her zaman güncel bilgiye erişin.',
  },
]

const ROLES = [
  {
    icon: Shield,
    title: 'Platform Yöneticisi',
    color: 'var(--forest)',
    items: ['Tüm entity ve kullanıcı yönetimi', 'Platform ayarları ve konfigürasyon', 'Analytics ve raporlama', 'Destek genel görünüm'],
  },
  {
    icon: Users,
    title: 'Entity Yöneticisi',
    color: 'var(--accent)',
    items: ['CRM/ERP/Muhasebe tam erişim', 'Entegrasyon yönetimi', 'Alt kullanıcı ekleme ve yetkilendirme', 'Entity AI ve KIBI AI tam erişim'],
  },
  {
    icon: Bot,
    title: 'Entity Kullanıcısı',
    color: 'var(--mint)',
    items: ['Entity AI ile sohbet', 'KIBI AI rehberlik', 'Kendi alanıyla ilgili bilgi erişimi', 'Raporları görüntüleme'],
  },
]

const INTEGRATIONS = [
  { name: 'Zoho CRM', cat: 'CRM' },
  { name: 'Zoho Books', cat: 'Muhasebe' },
  { name: 'Salesforce', cat: 'CRM' },
  { name: 'HubSpot', cat: 'CRM' },
  { name: 'Xero', cat: 'Muhasebe' },
  { name: 'WhatsApp', cat: 'İletişim' },
  { name: 'Telegram', cat: 'İletişim' },
  { name: 'OpenRouter AI', cat: 'Yapay Zeka' },
]

const PLANS = [
  {
    name: 'Free',
    price: '₺0',
    period: '/ay',
    desc: 'Başlangıç için ideal',
    features: ['1 Entity', '1 CRM bağlantısı', 'KIBI AI (sınırlı)', 'E-posta desteği'],
    cta: 'Ücretsiz Başla',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '₺2.499',
    period: '/ay',
    desc: 'Büyüyen işletmeler için',
    features: ['5 Entity', 'Sınırsız CRM', 'KIBI AI tam erişim', 'Muhasebe entegrasyonu', 'WhatsApp entegrasyonu', 'Öncelikli destek'],
    cta: 'Pro\'ya Geç',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Özel',
    period: '',
    desc: 'Kurumsal çözümler',
    features: ['Sınırsız Entity', 'Özel AI modeli', 'Özel entegrasyonlar', 'SLA garantisi', '7/24 destek', 'Özel onboarding'],
    cta: 'İletişime Geç',
    highlight: false,
  },
]

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ color: 'var(--text-1)' }}>

      {/* ── Navbar ── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 px-6 py-3"
        style={{
          background: 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(20px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-sm"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}
            >K</div>
            <span className="font-bold text-base" style={{ color: 'var(--accent)' }}>Ki</span>
            <span className="text-sm font-medium hidden sm:inline" style={{ color: 'var(--text-2)' }}>Business Intelligence</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm" style={{ color: 'var(--text-2)' }}>
            <a href="#features" className="hover:text-[var(--accent)] transition-colors">Özellikler</a>
            <a href="#roles" className="hover:text-[var(--accent)] transition-colors">Roller</a>
            <a href="#integrations" className="hover:text-[var(--accent)] transition-colors">Entegrasyonlar</a>
            <a href="#pricing" className="hover:text-[var(--accent)] transition-colors">Fiyatlandırma</a>
          </nav>
          <button
            onClick={() => navigate('/app/login')}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))', boxShadow: '0 4px 12px rgba(38,166,154,0.30)' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 6px 20px rgba(38,166,154,0.45)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(38,166,154,0.30)')}
          >
            Platforma Giriş
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex items-center justify-center px-6 pt-24 pb-16">
        {/* Extra aurora orbs for hero */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute w-[600px] h-[600px] rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, var(--teal), transparent 70%)', top: '-10%', right: '-10%' }} />
          <div className="absolute w-[400px] h-[400px] rounded-full opacity-15"
            style={{ background: 'radial-gradient(circle, var(--forest), transparent 70%)', bottom: '10%', left: '-5%' }} />
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: text */}
            <div>
              <div
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-6"
                style={{ background: 'rgba(38,166,154,0.10)', border: '1px solid rgba(38,166,154,0.25)', color: 'var(--accent)' }}
              >
                <Zap size={14} />
                <span>KIBI AI ile güçlendirilmiş iş zekası</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6" style={{ color: 'var(--text-1)' }}>
                İş Verilerinizi{' '}
                <span style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  Zekaya
                </span>{' '}
                Dönüştürün
              </h1>

              <p className="text-lg mb-8 leading-relaxed" style={{ color: 'var(--text-2)' }}>
                CRM, ERP ve Muhasebe sistemlerinizi tek platformda birleştirin.
                KIBI AI ile verilerinizi doğal dilde sorgulayın, anlık içgörüler elde edin.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => navigate('/app/login')}
                  className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-white transition-all duration-200"
                  style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))', boxShadow: '0 6px 20px rgba(38,166,154,0.35)' }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 8px 28px rgba(38,166,154,0.50)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 6px 20px rgba(38,166,154,0.35)')}
                >
                  Platforma Giriş <ArrowRight size={18} />
                </button>
                <a
                  href="#features"
                  className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-semibold transition-all duration-200"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-1)', backdropFilter: 'blur(12px)' }}
                >
                  Özellikleri Keşfet <ChevronRight size={18} />
                </a>
              </div>

              {/* Stats */}
              <div className="flex flex-wrap gap-8 mt-10">
                {[
                  { label: 'Entity Desteği', value: 'Sınırsız' },
                  { label: 'AI Yanıt Süresi', value: '<2sn' },
                  { label: 'Entegrasyon', value: '8+' },
                ].map(s => (
                  <div key={s.label}>
                    <div className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{s.value}</div>
                    <div className="text-sm" style={{ color: 'var(--text-3)' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: glass card mockup */}
            <div className="relative hidden lg:block">
              {/* Main card */}
              <div
                className="rounded-2xl p-6 relative"
                style={{
                  background: 'var(--surface)',
                  backdropFilter: 'blur(28px) saturate(1.8)',
                  WebkitBackdropFilter: 'blur(28px) saturate(1.8)',
                  border: '1px solid var(--border-s)',
                  boxShadow: 'var(--shadow-lg)',
                }}
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}>
                    <Brain size={16} className="text-white" />
                  </div>
                  <span className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>KIBI AI Chat</span>
                  <div className="ml-auto w-2 h-2 rounded-full bg-green-400" />
                </div>

                {/* Chat bubbles */}
                {[
                  { role: 'user', text: 'Bu ay en çok satan ürünlerim neler?' },
                  { role: 'ai', text: '1. Laptop Stand — 248 adet\n2. Wireless Mouse — 189 adet\n3. USB Hub — 156 adet\nToplam gelir: ₺127.450' },
                  { role: 'user', text: 'Geçen aya göre büyüme oranı?' },
                ].map((msg, i) => (
                  <div key={i} className={`flex mb-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className="max-w-[85%] px-3.5 py-2.5 rounded-xl text-xs leading-relaxed whitespace-pre-line"
                      style={msg.role === 'user'
                        ? { background: 'linear-gradient(135deg, var(--accent), var(--forest))', color: '#fff' }
                        : { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}

                {/* Typing indicator */}
                <div className="flex justify-start">
                  <div className="px-3.5 py-2.5 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <div className="flex gap-1 items-center">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)', opacity: 0.6 + i * 0.2 }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating mini cards */}
              <div
                className="absolute -top-6 -right-8 px-4 py-3 rounded-xl text-sm"
                style={{
                  background: 'var(--surface)', backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow)',
                }}
              >
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} style={{ color: 'var(--accent)' }} />
                  <span className="font-bold text-xs" style={{ color: 'var(--text-1)' }}>+34% büyüme</span>
                </div>
              </div>

              <div
                className="absolute -bottom-4 -left-8 px-4 py-3 rounded-xl text-sm"
                style={{
                  background: 'var(--surface)', backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow)',
                }}
              >
                <div className="flex items-center gap-2">
                  <Lock size={14} style={{ color: 'var(--forest)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-2)' }}>Güvenli & İzole</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-1)' }}>
              Her Şey Tek Platformda
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--text-2)' }}>
              Dağınık sistemleri birleştirin, AI destekli içgörüler elde edin, işinizi büyütün.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="p-6 rounded-2xl transition-all duration-300 group"
                style={{
                  background: 'var(--surface)',
                  backdropFilter: 'blur(20px) saturate(1.5)',
                  WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow)',
                }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shadow-lg)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--shadow)')}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))', boxShadow: '0 4px 12px rgba(38,166,154,0.25)' }}
                >
                  <f.icon size={18} className="text-white" />
                </div>
                <h3 className="font-bold mb-2" style={{ color: 'var(--text-1)' }}>{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Roles ── */}
      <section id="roles" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-1)' }}>
              Herkes İçin Doğru Yetki
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--text-2)' }}>
              Rol tabanlı erişim sistemi ile herkes sadece ihtiyacı olan bilgiye erişir.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {ROLES.map(r => (
              <div
                key={r.title}
                className="p-6 rounded-2xl"
                style={{
                  background: 'var(--surface)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow)',
                }}
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: `${r.color}20`, border: `1px solid ${r.color}40` }}
                >
                  <r.icon size={22} style={{ color: r.color }} />
                </div>
                <h3 className="font-bold text-lg mb-4" style={{ color: 'var(--text-1)' }}>{r.title}</h3>
                <ul className="space-y-2.5">
                  {r.items.map(item => (
                    <li key={item} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--text-2)' }}>
                      <Check size={14} className="flex-shrink-0 mt-0.5" style={{ color: r.color }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Integrations ── */}
      <section id="integrations" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-1)' }}>
              Favori Araçlarınızla Bağlantı
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--text-2)' }}>
              Mevcut sistemlerinizi değiştirmenize gerek yok. Ki BI onlarla konuşur.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {INTEGRATIONS.map(ig => (
              <div
                key={ig.name}
                className="flex flex-col items-center gap-2 p-5 rounded-2xl text-center"
                style={{
                  background: 'var(--surface)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid var(--border)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                  style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}
                >
                  {ig.name.charAt(0)}
                </div>
                <div>
                  <div className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{ig.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{ig.cat}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-8">
            <div className="flex items-center justify-center gap-2" style={{ color: 'var(--text-3)' }}>
              <Globe size={16} />
              <span className="text-sm">Daha fazla entegrasyon yolda...</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-1)' }}>
              Şeffaf Fiyatlandırma
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--text-2)' }}>
              Gizli ücret yok. İhtiyacınıza uygun planı seçin.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 items-stretch">
            {PLANS.map(plan => (
              <div
                key={plan.name}
                className="flex flex-col p-6 rounded-2xl relative"
                style={{
                  background: plan.highlight
                    ? 'linear-gradient(160deg, rgba(38,166,154,0.12), rgba(45,138,107,0.08))'
                    : 'var(--surface)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: plan.highlight ? '1px solid var(--border-s)' : '1px solid var(--border)',
                  boxShadow: plan.highlight ? 'var(--shadow-lg)' : 'var(--shadow)',
                }}
              >
                {plan.highlight && (
                  <div
                    className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}
                  >
                    En Popüler
                  </div>
                )}

                <div className="mb-6">
                  <div className="font-bold text-lg mb-1" style={{ color: 'var(--text-1)' }}>{plan.name}</div>
                  <div className="text-sm mb-3" style={{ color: 'var(--text-3)' }}>{plan.desc}</div>
                  <div className="flex items-end gap-1">
                    <span className="text-3xl font-bold" style={{ color: plan.highlight ? 'var(--accent)' : 'var(--text-1)' }}>
                      {plan.price}
                    </span>
                    {plan.period && <span className="text-sm pb-0.5" style={{ color: 'var(--text-3)' }}>{plan.period}</span>}
                  </div>
                </div>

                <ul className="space-y-3 flex-1 mb-6">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--text-2)' }}>
                      <Check size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => navigate('/app/login')}
                  className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200"
                  style={plan.highlight
                    ? { background: 'linear-gradient(135deg, var(--accent), var(--forest))', color: '#fff', boxShadow: '0 4px 16px rgba(38,166,154,0.30)' }
                    : { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                  onMouseEnter={e => { if (plan.highlight) e.currentTarget.style.boxShadow = '0 6px 24px rgba(38,166,154,0.45)' }}
                  onMouseLeave={e => { if (plan.highlight) e.currentTarget.style.boxShadow = '0 4px 16px rgba(38,166,154,0.30)' }}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div
            className="rounded-3xl p-10 text-center relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(38,166,154,0.15), rgba(45,138,107,0.10))',
              border: '1px solid var(--border-s)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {/* Decorative orb */}
            <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(38,166,154,0.20), transparent 70%)' }} />

            <div className="relative z-10">
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
                style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))', boxShadow: '0 8px 24px rgba(38,166,154,0.35)' }}
              >
                <FileText size={28} className="text-white" />
              </div>

              <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-1)' }}>
                Hemen Başlayın
              </h2>
              <p className="text-lg mb-8 max-w-xl mx-auto" style={{ color: 'var(--text-2)' }}>
                Ki Business Intelligence ile iş verilerinizi anlık olarak analiz edin.
                Kurulum gerektirmez, dakikalar içinde hazır.
              </p>

              <button
                onClick={() => navigate('/app/login')}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-white text-base transition-all duration-200"
                style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))', boxShadow: '0 6px 20px rgba(38,166,154,0.40)' }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 10px 32px rgba(38,166,154,0.55)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 6px 20px rgba(38,166,154,0.40)')}
              >
                Platforma Giriş Yap <ArrowRight size={20} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 px-6" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--forest))' }}
            >K</div>
            <span className="font-semibold text-sm" style={{ color: 'var(--text-2)' }}>Ki Business Intelligence</span>
          </div>

          <div className="flex items-center gap-6 text-xs" style={{ color: 'var(--text-3)' }}>
            <span>© 2026 Ki Business Intelligence</span>
            <span>Powered by KIBI AI</span>
            <a
              href="mailto:destek@kibusiness.co"
              className="hover:text-[var(--accent)] transition-colors"
            >
              destek@kibusiness.co
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

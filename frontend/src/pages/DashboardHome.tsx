import { Users, MessageCircle, HardDrive, Brain } from 'lucide-react'

export default function DashboardHome() {
  const cards = [
    { label: 'CRM Kayıtları', value: '1,234', icon: Users, color: 'bg-blue-500' },
    { label: 'Açık Destek', value: '12', icon: MessageCircle, color: 'bg-orange-500' },
    { label: 'Depolama', value: '2.4 GB', icon: HardDrive, color: 'bg-green-500' },
    { label: 'AI Sohbet', value: '48', icon: Brain, color: 'bg-purple-500' },
  ]

  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-bold text-white">Hoş Geldiniz</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, i) => {
          const Icon = card.icon
          return (
            <div key={i} className="bg-[#1a1a1a] p-6 rounded-xl border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <div className={`${card.color} p-3 rounded-lg`}>
                  <Icon size={24} className="text-white" />
                </div>
              </div>
              <p className="text-gray-400 text-sm">{card.label}</p>
              <p className="text-2xl font-bold text-white mt-1">{card.value}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

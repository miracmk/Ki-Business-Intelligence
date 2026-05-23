import { useState } from 'react'
import { Send } from 'lucide-react'
import api from '../api'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    if (!input.trim()) return
    const userMessage: Message = { role: 'user', content: input }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const res = await api.post('/ai/chat', { message: input })
      const assistantMessage: Message = { role: 'assistant', content: res.data.response }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex gap-6">
      {/* Sessions Panel */}
      <div className="w-72 bg-[#1a1a1a] rounded-xl border border-gray-800 p-4">
        <h3 className="text-lg font-semibold mb-4">Oturumlar</h3>
        <div className="space-y-2">
          <div className="p-3 bg-gray-800 rounded-lg cursor-pointer">Yeni Sohbet</div>
        </div>
      </div>

      {/* Chat Panel */}
      <div className="flex-1 flex flex-col bg-[#1a1a1a] rounded-xl border border-gray-800">
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-400">
              Merhaba! Bir mesaj yazın.
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`max-w-[70%] p-4 rounded-lg ${
                msg.role === 'user' ? 'ml-auto bg-[#6366f1] text-white' : 'mr-auto bg-gray-800'
              }`}
            >
              {msg.content}
            </div>
          ))}
          {loading && (
            <div className="mr-auto bg-gray-800 p-4 rounded-lg">
              Yazıyor...
            </div>
          )}
        </div>
        <div className="p-4 border-t border-gray-800">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Mesajınızı yazın..."
              className="flex-1 px-4 py-3 bg-[#0f0f0f] border border-gray-700 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
            />
            <button
              onClick={handleSend}
              disabled={loading}
              className="px-6 py-3 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

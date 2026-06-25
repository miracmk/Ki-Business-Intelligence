import { useEffect, useState } from 'react'
import { Plus, RefreshCw, Lock, Ticket as TicketIcon, UserCheck } from 'lucide-react'
import api from '../lib/api'

interface EventItem { id: string; name: string; description?: string; venueId?: string; venueName?: string; startDate: string; endDate?: string; capacity?: number; status: string; registrationCount?: number }
interface Venue { id: string; name: string; capacity?: number }
interface Ticket { id: string; eventId: string; name: string; price: number; currency?: string; quantityTotal?: number; quantitySold?: number }
interface Registration { id: string; eventId: string; ticketId?: string; ticketName?: string; contactId?: string; contactName?: string; status: string; registeredAt?: string }
interface Contact { id: string; fullName?: string; email?: string }

const STATUS_LBL: Record<string, string> = { planned: 'Planlandı', published: 'Yayında', ongoing: 'Devam Ediyor', completed: 'Tamamlandı', cancelled: 'İptal' }
const STATUS_CLS: Record<string, string> = { planned: 'bg-gray-700 text-gray-300', published: 'bg-blue-900 text-blue-300', ongoing: 'bg-amber-900 text-amber-300', completed: 'bg-green-900 text-green-300', cancelled: 'bg-red-900 text-red-300' }

const iCls = 'w-full px-3 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-white text-sm focus:outline-none focus:border-[#6366f1]'

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-gray-400">{label}</label><div className="mt-1">{children}</div></div>
}

export default function Events() {
  const [entitled, setEntitled] = useState<boolean | null>(null)
  const [activating, setActivating] = useState(false)
  const [events, setEvents] = useState<EventItem[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const [showNewEvent, setShowNewEvent] = useState(false)
  const [eventForm, setEventForm] = useState({ name: '', description: '', venueId: '', startDate: '', capacity: 0 })
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [showNewTicket, setShowNewTicket] = useState(false)
  const [ticketForm, setTicketForm] = useState({ name: '', price: 0, quantityTotal: 0 })
  const [regForm, setRegForm] = useState({ ticketId: '', contactId: '' })

  const checkEntitlement = async () => {
    try {
      const { data } = await api.get('/entitlements')
      const row = (data.entitlements ?? []).find((e: any) => e.moduleKey === 'addon_event')
      setEntitled(!!row && ['active', 'trial'].includes(row.status))
    } catch { setEntitled(false) }
  }

  const loadAll = async () => {
    setLoading(true)
    try {
      const [e, v, c] = await Promise.all([
        api.get('/event-native/events').then(r => r.data.events ?? []),
        api.get('/event-native/venues').then(r => r.data.venues ?? []),
        api.get('/crm-native/contacts').then(r => r.data.contacts ?? []),
      ])
      setEvents(e); setVenues(v); setContacts(c)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  useEffect(() => { checkEntitlement() }, [])
  useEffect(() => { if (entitled) loadAll() }, [entitled])

  const activate = async () => {
    setActivating(true)
    try { await api.post('/entitlements/addon_event/activate', {}); await checkEntitlement() }
    catch (err) { console.error(err) }
    setActivating(false)
  }

  const createEvent = async () => {
    await api.post('/event-native/events', { ...eventForm, venueId: eventForm.venueId || null })
    setShowNewEvent(false); setEventForm({ name: '', description: '', venueId: '', startDate: '', capacity: 0 }); loadAll()
  }

  const openEvent = async (ev: EventItem) => {
    setSelectedEvent(ev)
    const [t, r] = await Promise.all([
      api.get(`/event-native/tickets?eventId=${ev.id}`).then(res => res.data.tickets ?? []),
      api.get(`/event-native/registrations?eventId=${ev.id}`).then(res => res.data.registrations ?? []),
    ])
    setTickets(t); setRegistrations(r)
  }

  const createTicket = async () => {
    if (!selectedEvent) return
    await api.post('/event-native/tickets', { eventId: selectedEvent.id, ...ticketForm })
    setShowNewTicket(false); setTicketForm({ name: '', price: 0, quantityTotal: 0 }); openEvent(selectedEvent)
  }

  const createRegistration = async () => {
    if (!selectedEvent) return
    await api.post('/event-native/registrations', { eventId: selectedEvent.id, ticketId: regForm.ticketId || null, contactId: regForm.contactId || null })
    setRegForm({ ticketId: '', contactId: '' }); openEvent(selectedEvent); loadAll()
  }

  const checkIn = async (id: string) => {
    await api.put(`/event-native/registrations/${id}/check-in`)
    if (selectedEvent) openEvent(selectedEvent)
  }

  if (entitled === null) return <div className="p-8 text-gray-400">Yükleniyor...</div>

  if (!entitled) {
    return (
      <div className="p-8">
        <div className="max-w-xl mx-auto mt-16 p-8 rounded-3xl border border-[#2a2a2a] bg-[#111111] text-center space-y-4">
          <Lock size={40} className="mx-auto text-[#6366f1]" />
          <h1 className="text-2xl font-bold text-white">Event Management</h1>
          <p className="text-gray-400">Etkinlik, biletleme, mekan ve katılımcı yönetimi — native add-on modülü.</p>
          <button onClick={activate} disabled={activating} className="px-6 py-3 rounded-2xl bg-[#6366f1] text-white font-medium disabled:opacity-50">
            {activating ? 'Etkinleştiriliyor...' : 'Modülü Etkinleştir'}
          </button>
        </div>
      </div>
    )
  }

  if (selectedEvent) {
    return (
      <div className="p-8 space-y-6">
        <button onClick={() => setSelectedEvent(null)} className="text-sm text-gray-400 hover:text-white">← Etkinliklere dön</button>
        <div>
          <h1 className="text-3xl font-bold text-white">{selectedEvent.name}</h1>
          <p className="text-gray-400">{new Date(selectedEvent.startDate).toLocaleString('tr-TR')}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Bilet Tipleri</h3>
              <button onClick={() => setShowNewTicket(true)} className="flex items-center gap-1 text-sm text-[#6366f1]"><Plus size={14} /> Ekle</button>
            </div>
            {showNewTicket && (
              <div className="p-4 rounded-2xl border border-[#2a2a2a] bg-[#111111] space-y-3">
                <F label="Bilet Adı"><input value={ticketForm.name} onChange={e => setTicketForm({ ...ticketForm, name: e.target.value })} className={iCls} /></F>
                <F label="Fiyat (TRY)"><input type="number" value={ticketForm.price} onChange={e => setTicketForm({ ...ticketForm, price: Number(e.target.value) })} className={iCls} /></F>
                <F label="Toplam Adet"><input type="number" value={ticketForm.quantityTotal} onChange={e => setTicketForm({ ...ticketForm, quantityTotal: Number(e.target.value) })} className={iCls} /></F>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowNewTicket(false)} className="px-3 py-1.5 rounded-xl border border-[#2a2a2a] text-gray-400 text-sm">İptal</button>
                  <button onClick={createTicket} disabled={!ticketForm.name} className="px-3 py-1.5 rounded-xl bg-[#6366f1] text-white text-sm disabled:opacity-50">Kaydet</button>
                </div>
              </div>
            )}
            {tickets.length === 0 ? <p className="text-gray-500 text-sm">Bilet tipi yok.</p> : tickets.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-2xl border border-[#2a2a2a] bg-[#111111]">
                <div className="flex items-center gap-2"><TicketIcon size={14} className="text-[#6366f1]" /><span className="text-white text-sm">{t.name}</span></div>
                <span className="text-sm text-gray-300">{t.price.toLocaleString('tr-TR')} {t.currency ?? 'TRY'} · {t.quantitySold ?? 0}/{t.quantityTotal ?? '∞'}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <h3 className="text-base font-semibold text-white">Yeni Katılımcı Kaydı</h3>
            <div className="p-4 rounded-2xl border border-[#2a2a2a] bg-[#111111] space-y-3">
              <F label="Kişi"><select value={regForm.contactId} onChange={e => setRegForm({ ...regForm, contactId: e.target.value })} className={iCls}><option value="">Seçin...</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.fullName || c.email}</option>)}</select></F>
              <F label="Bilet"><select value={regForm.ticketId} onChange={e => setRegForm({ ...regForm, ticketId: e.target.value })} className={iCls}><option value="">Seçin...</option>{tickets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></F>
              <button onClick={createRegistration} disabled={!regForm.contactId} className="w-full px-3 py-2 rounded-xl bg-[#6366f1] text-white text-sm disabled:opacity-50">Kayıt Oluştur</button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-semibold text-white">Katılımcılar ({registrations.length})</h3>
          <div className="overflow-x-auto rounded-3xl border border-[#2a2a2a] bg-[#111111]">
            <table className="min-w-full text-sm text-gray-300">
              <thead><tr><th className="px-6 py-4 text-left">Kişi</th><th className="px-6 py-4 text-left">Bilet</th><th className="px-6 py-4 text-left">Durum</th><th className="px-6 py-4 text-right">İşlem</th></tr></thead>
              <tbody>
                {registrations.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-500">Kayıt bulunamadı.</td></tr>
                ) : registrations.map(r => (
                  <tr key={r.id} className="border-t border-[#2a2a2a] hover:bg-[#1a1a1a]">
                    <td className="px-6 py-4 text-white">{r.contactName ?? '-'}</td>
                    <td className="px-6 py-4">{r.ticketName ?? '-'}</td>
                    <td className="px-6 py-4">{r.status === 'checked_in' ? 'Giriş Yaptı' : r.status === 'cancelled' ? 'İptal' : 'Kayıtlı'}</td>
                    <td className="px-6 py-4 text-right">
                      {r.status === 'registered' && (
                        <button onClick={() => checkIn(r.id)} className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-[#6366f1]" title="Giriş Yap"><UserCheck size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Etkinlikler</h1>
          <p className="text-gray-400">Etkinlik, bilet ve katılımcı yönetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111111] border border-[#2a2a2a] text-gray-300 hover:text-white">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Yenile
          </button>
          <button onClick={() => setShowNewEvent(true)} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#6366f1] text-white text-sm"><Plus size={16} /> Yeni Etkinlik</button>
        </div>
      </div>

      {showNewEvent && (
        <div className="p-6 rounded-3xl border border-[#2a2a2a] bg-[#111111] space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><F label="Etkinlik Adı"><input value={eventForm.name} onChange={e => setEventForm({ ...eventForm, name: e.target.value })} className={iCls} /></F></div>
            <F label="Mekan"><select value={eventForm.venueId} onChange={e => setEventForm({ ...eventForm, venueId: e.target.value })} className={iCls}><option value="">Seçin...</option>{venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></F>
            <F label="Başlangıç Tarihi"><input type="datetime-local" value={eventForm.startDate} onChange={e => setEventForm({ ...eventForm, startDate: e.target.value })} className={iCls} /></F>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowNewEvent(false)} className="px-4 py-2 rounded-2xl border border-[#2a2a2a] text-gray-400">İptal</button>
            <button onClick={createEvent} disabled={!eventForm.name || !eventForm.startDate} className="px-4 py-2 rounded-2xl bg-[#6366f1] text-white disabled:opacity-50">Oluştur</button>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {events.length === 0 ? <p className="text-gray-500 text-sm">Etkinlik bulunamadı.</p> : events.map(ev => (
          <button key={ev.id} onClick={() => openEvent(ev)} className="text-left p-5 rounded-3xl border border-[#2a2a2a] bg-[#111111] hover:bg-[#1a1a1a] space-y-2">
            <div className="flex items-center justify-between">
              <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_CLS[ev.status] ?? 'bg-gray-700 text-gray-300'}`}>{STATUS_LBL[ev.status] ?? ev.status}</span>
              <span className="text-xs text-gray-400">{ev.registrationCount ?? 0} katılımcı</span>
            </div>
            <p className="text-white font-semibold">{ev.name}</p>
            <p className="text-xs text-gray-400">{new Date(ev.startDate).toLocaleString('tr-TR')}</p>
            {ev.venueName && <p className="text-xs text-gray-500">{ev.venueName}</p>}
          </button>
        ))}
      </div>
    </div>
  )
}

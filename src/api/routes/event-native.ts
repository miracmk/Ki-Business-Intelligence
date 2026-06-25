// YFZ 34 Faz 5e: Event Management — native paid add-on (addon_event).
// Events/venues/tickets/registrations. Paid registrations create a soft-linked
// acc_invoices draft (consistent with the existing acc_invoices.order_id
// soft-link convention) — reuses Base Accounting (Faz 2) rather than inventing
// a separate billing path.
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { db } from '../../lib/db.js'
import { queryEntitySchema } from '../../lib/entity-provisioner.js'
import { hasActiveEntitlement } from '../../lib/entitlements.js'

const venueSchema = z.object({
  name: z.string().min(1),
  addressLine1: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  capacity: z.number().optional(),
})

const eventSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  venueId: z.string().uuid().optional().nullable(),
  startDate: z.string(),
  endDate: z.string().optional(),
  capacity: z.number().optional(),
  status: z.enum(['planned', 'published', 'ongoing', 'completed', 'cancelled']).optional(),
})

const ticketSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().min(1),
  price: z.number().optional(),
  currency: z.string().optional(),
  quantityTotal: z.number().optional(),
})

const registrationSchema = z.object({
  eventId: z.string().uuid(),
  ticketId: z.string().uuid().optional().nullable(),
  contactId: z.string().uuid().optional().nullable(),
})

async function resolveEntityContext(tenantId: string | null): Promise<{ entityId: string; schema: string } | null> {
  const isUUID = (s: string | null | undefined) =>
    !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  if (!isUUID(tenantId)) return null
  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.entityId, tenantId!),
    columns: { id: true, entityDbSchema: true, isProvisioned: true },
  })
  if (!entity?.isProvisioned || !entity.entityDbSchema) return null
  return { entityId: entity.id, schema: entity.entityDbSchema }
}

export const eventNativeRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const user = req.user as { tenantId: string | null; role?: string } | undefined
    if (!user) return
    if (user.role === 'admin' || user.role === 'supervisor') return
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    if (!(await hasActiveEntitlement(ctx.entityId, 'addon_event'))) {
      return reply.status(402).send({ error: 'Event Management add-on aktif değil. Lütfen modülü etkinleştirin.' })
    }
  })

  // ── Venues ─────────────────────────────────────────────────────────────────
  app.get('/venues', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const venues = await queryEntitySchema(ctx.schema, `
      SELECT id, name, address_line1 AS "addressLine1", city, country, capacity, created_at AS "createdAt"
      FROM erp_event_venues ORDER BY name ASC
    `)
    return { venues }
  })

  app.post('/venues', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = venueSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const d = body.data
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO erp_event_venues (name, address_line1, city, country, capacity)
      VALUES ($1, $2, $3, $4, $5) RETURNING id, name, capacity
    `, [d.name, d.addressLine1 ?? null, d.city ?? null, d.country ?? 'TR', d.capacity ?? null])
    return reply.status(201).send({ venue: rows[0] })
  })

  // ── Events ─────────────────────────────────────────────────────────────────
  app.get('/events', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const events = await queryEntitySchema(ctx.schema, `
      SELECT e.id, e.name, e.description, e.venue_id AS "venueId", v.name AS "venueName",
             e.start_date AS "startDate", e.end_date AS "endDate", e.capacity, e.status,
             (SELECT COUNT(*) FROM erp_event_registrations r WHERE r.event_id = e.id AND r.status != 'cancelled') AS "registrationCount"
      FROM erp_events e LEFT JOIN erp_event_venues v ON v.id = e.venue_id
      ORDER BY e.start_date DESC
    `)
    return { events }
  })

  app.post('/events', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = eventSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const d = body.data
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO erp_events (name, description, venue_id, start_date, end_date, capacity, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, start_date AS "startDate", status
    `, [d.name, d.description ?? null, d.venueId ?? null, d.startDate, d.endDate ?? null, d.capacity ?? null, d.status ?? 'planned'])
    return reply.status(201).send({ event: rows[0] })
  })

  app.put('/events/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const body = eventSchema.partial().safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const map: Record<string, string> = { name: 'name', description: 'description', venueId: 'venue_id', startDate: 'start_date', endDate: 'end_date', capacity: 'capacity', status: 'status' }
    const sets: string[] = []
    const params: unknown[] = []
    for (const [key, val] of Object.entries(body.data)) {
      if (val === undefined) continue
      params.push(val); sets.push(`${map[key]} = $${params.length}`)
    }
    if (sets.length === 0) return { ok: true }
    params.push(id)
    await queryEntitySchema(ctx.schema, `UPDATE erp_events SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params)
    return { ok: true }
  })

  // ── Tickets ────────────────────────────────────────────────────────────────
  app.get('/tickets', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { eventId } = req.query as Record<string, string>
    const conditions: string[] = []
    const params: unknown[] = []
    if (eventId) { params.push(eventId); conditions.push(`event_id = $${params.length}`) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const tickets = await queryEntitySchema(ctx.schema, `
      SELECT id, event_id AS "eventId", name, price, currency,
             quantity_total AS "quantityTotal", quantity_sold AS "quantitySold"
      FROM erp_event_tickets ${where} ORDER BY price ASC
    `, params)
    return { tickets }
  })

  app.post('/tickets', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = ticketSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const d = body.data
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO erp_event_tickets (event_id, name, price, currency, quantity_total)
      VALUES ($1, $2, $3, $4, $5) RETURNING id, name, price
    `, [d.eventId, d.name, d.price ?? 0, d.currency ?? 'TRY', d.quantityTotal ?? null])
    return reply.status(201).send({ ticket: rows[0] })
  })

  // ── Registrations (paid tickets create a draft acc_invoices row) ──────────
  app.get('/registrations', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { eventId } = req.query as Record<string, string>
    const conditions: string[] = []
    const params: unknown[] = []
    if (eventId) { params.push(eventId); conditions.push(`r.event_id = $${params.length}`) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const registrations = await queryEntitySchema(ctx.schema, `
      SELECT r.id, r.event_id AS "eventId", r.ticket_id AS "ticketId", t.name AS "ticketName",
             r.contact_id AS "contactId", c.full_name AS "contactName", r.invoice_id AS "invoiceId",
             r.status, r.registered_at AS "registeredAt", r.checked_in_at AS "checkedInAt"
      FROM erp_event_registrations r
      LEFT JOIN erp_event_tickets t ON t.id = r.ticket_id
      LEFT JOIN crm_contacts c ON c.id = r.contact_id
      ${where} ORDER BY r.registered_at DESC
    `, params)
    return { registrations }
  })

  app.post('/registrations', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = registrationSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const d = body.data

    let invoiceId: string | null = null
    if (d.ticketId) {
      const [ticket] = await queryEntitySchema(ctx.schema, `SELECT price, currency, name FROM erp_event_tickets WHERE id = $1`, [d.ticketId])
      if (ticket && Number(ticket.price) > 0 && d.contactId) {
        const invoiceNumber = `INV-${nanoid(8).toUpperCase()}`
        const [invoice] = await queryEntitySchema(ctx.schema, `
          INSERT INTO acc_invoices (invoice_type, invoice_number, contact_id, total, currency, notes)
          VALUES ('sale', $1, $2, $3, $4, $5) RETURNING id
        `, [invoiceNumber, d.contactId, ticket.price, ticket.currency, `Etkinlik bileti: ${ticket.name}`])
        invoiceId = invoice.id
      }
      await queryEntitySchema(ctx.schema, `UPDATE erp_event_tickets SET quantity_sold = quantity_sold + 1 WHERE id = $1`, [d.ticketId])
    }

    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO erp_event_registrations (event_id, ticket_id, contact_id, invoice_id)
      VALUES ($1, $2, $3, $4) RETURNING id, event_id AS "eventId", invoice_id AS "invoiceId"
    `, [d.eventId, d.ticketId ?? null, d.contactId ?? null, invoiceId])
    return reply.status(201).send({ registration: rows[0] })
  })

  app.put('/registrations/:id/check-in', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await queryEntitySchema(ctx.schema, `UPDATE erp_event_registrations SET status = 'checked_in', checked_in_at = NOW() WHERE id = $1`, [id])
    return { ok: true }
  })
}

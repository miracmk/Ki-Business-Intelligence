// YFZ 34 Faz 5a: Customer Service Management — native paid add-on (addon_customer_service).
// Tickets/SLA policies/messages live in every Base entity schema (no extra
// provisioning cost — see db/migrations/0018_support_tables.sql), but every
// handler here is gated behind the entitlement; Base itself doesn't include this.
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { db } from '../../lib/db.js'
import { queryEntitySchema } from '../../lib/entity-provisioner.js'
import { hasActiveEntitlement } from '../../lib/entitlements.js'

const slaPolicySchema = z.object({
  name: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  firstResponseHours: z.number().optional(),
  resolutionHours: z.number().optional(),
  isActive: z.boolean().optional(),
})

const ticketSchema = z.object({
  contactId: z.string().uuid().optional().nullable(),
  subject: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'waiting_customer', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  slaPolicyId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
})

const messageSchema = z.object({
  senderType: z.enum(['customer', 'agent']),
  content: z.string().min(1),
})

const SLA_COLUMN_MAP: Record<string, string> = {
  name: 'name', priority: 'priority', firstResponseHours: 'first_response_hours',
  resolutionHours: 'resolution_hours', isActive: 'is_active',
}
const TICKET_COLUMN_MAP: Record<string, string> = {
  contactId: 'contact_id', subject: 'subject', description: 'description', category: 'category',
  status: 'status', priority: 'priority', assignedToUserId: 'assigned_to_user_id',
  slaPolicyId: 'sla_policy_id', tags: 'tags',
}

function buildInsert(map: Record<string, string>, data: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const cols: string[] = []
  const params: unknown[] = []
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue
    cols.push(map[key])
    params.push(Array.isArray(val) ? JSON.stringify(val) : val)
  }
  for (const [col, val] of Object.entries(extra)) { cols.push(col); params.push(val) }
  return { cols, placeholders: cols.map((_, i) => `$${i + 1}`), params }
}

function buildUpdate(map: Record<string, string>, data: Record<string, unknown>) {
  const sets: string[] = []
  const params: unknown[] = []
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue
    params.push(Array.isArray(val) ? JSON.stringify(val) : val)
    sets.push(`${map[key]} = $${params.length}`)
  }
  return { sets, params }
}

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

export const customerServiceRoutes: FastifyPluginAsync = async (app) => {
  // Shared entitlement gate — every handler in this file requires addon_customer_service.
  app.addHook('preHandler', async (req, reply) => {
    const user = req.user as { tenantId: string | null; role?: string } | undefined
    if (!user) return // app.authenticate (per-route) runs first and will already 401 if missing
    const isAdmin = user.role === 'admin' || user.role === 'supervisor'
    if (isAdmin) return
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    if (!(await hasActiveEntitlement(ctx.entityId, 'addon_customer_service'))) {
      return reply.status(402).send({ error: 'Customer Service Management add-on aktif değil. Lütfen modülü etkinleştirin.' })
    }
  })

  // ── SLA Policies ───────────────────────────────────────────────────────────
  app.get('/sla-policies', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const policies = await queryEntitySchema(ctx.schema, `
      SELECT id, name, priority, first_response_hours AS "firstResponseHours",
             resolution_hours AS "resolutionHours", is_active AS "isActive", created_at AS "createdAt"
      FROM support_sla_policies ORDER BY priority DESC
    `)
    return { policies }
  })

  app.post('/sla-policies', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = slaPolicySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const { cols, placeholders, params } = buildInsert(SLA_COLUMN_MAP, body.data)
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO support_sla_policies (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
      RETURNING id, name, priority, first_response_hours AS "firstResponseHours", resolution_hours AS "resolutionHours"
    `, params)
    return reply.status(201).send({ policy: rows[0] })
  })

  // ── Tickets ────────────────────────────────────────────────────────────────
  app.get('/tickets', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { status, priority } = req.query as Record<string, string>
    const conditions: string[] = []
    const params: unknown[] = []
    if (status) { params.push(status); conditions.push(`status = $${params.length}`) }
    if (priority) { params.push(priority); conditions.push(`priority = $${params.length}`) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const tickets = await queryEntitySchema(ctx.schema, `
      SELECT id, ticket_number AS "ticketNumber", contact_id AS "contactId", subject, description, category,
             status, priority, assigned_to_user_id AS "assignedToUserId", sla_policy_id AS "slaPolicyId",
             first_response_due_at AS "firstResponseDueAt", resolution_due_at AS "resolutionDueAt",
             resolved_at AS "resolvedAt", closed_at AS "closedAt", tags,
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM support_tickets ${where} ORDER BY created_at DESC
    `, params)
    return { tickets }
  })

  app.post('/tickets', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = ticketSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    let dueAtCols: Record<string, unknown> = {}
    if (body.data.slaPolicyId) {
      const [policy] = await queryEntitySchema(ctx.schema, `SELECT first_response_hours, resolution_hours FROM support_sla_policies WHERE id = $1`, [body.data.slaPolicyId])
      if (policy) {
        dueAtCols = {
          first_response_due_at: new Date(Date.now() + Number(policy.first_response_hours) * 3600_000),
          resolution_due_at: new Date(Date.now() + Number(policy.resolution_hours) * 3600_000),
        }
      }
    }
    const ticketNumber = `TKT-${nanoid(8).toUpperCase()}`
    const { cols, placeholders, params } = buildInsert(TICKET_COLUMN_MAP, body.data, { ticket_number: ticketNumber, ...dueAtCols })
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO support_tickets (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
      RETURNING id, ticket_number AS "ticketNumber", subject, status, priority
    `, params)
    return reply.status(201).send({ ticket: rows[0] })
  })

  app.put('/tickets/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const body = ticketSchema.partial().safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const { sets, params } = buildUpdate(TICKET_COLUMN_MAP, body.data)
    if (sets.length === 0) return { ok: true }
    let extraSet = ''
    if (body.data.status === 'resolved') extraSet = `, resolved_at = NOW()`
    else if (body.data.status === 'closed') extraSet = `, closed_at = NOW()`
    params.push(id)
    await queryEntitySchema(ctx.schema, `UPDATE support_tickets SET ${sets.join(', ')}, updated_at = NOW()${extraSet} WHERE id = $${params.length}`, params)
    return { ok: true }
  })

  app.delete('/tickets/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await queryEntitySchema(ctx.schema, `UPDATE support_tickets SET status = 'closed', closed_at = NOW() WHERE id = $1`, [id])
    return { ok: true }
  })

  // ── Ticket messages (conversation thread) ─────────────────────────────────
  app.get('/tickets/:id/messages', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const messages = await queryEntitySchema(ctx.schema, `
      SELECT id, sender_type AS "senderType", sender_user_id AS "senderUserId", content, created_at AS "createdAt"
      FROM support_ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC
    `, [id])
    return { messages }
  })

  app.post('/tickets/:id/messages', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const user = req.user as { sub: string }
    const body = messageSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const senderUserId = body.data.senderType === 'agent' ? user.sub : null
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO support_ticket_messages (ticket_id, sender_type, sender_user_id, content)
      VALUES ($1, $2, $3, $4) RETURNING id, sender_type AS "senderType", content, created_at AS "createdAt"
    `, [id, body.data.senderType, senderUserId, body.data.content])
    if (body.data.senderType === 'agent') {
      await queryEntitySchema(ctx.schema, `UPDATE support_tickets SET first_responded_at = COALESCE(first_responded_at, NOW()), updated_at = NOW() WHERE id = $1`, [id])
    }
    return reply.status(201).send({ message: rows[0] })
  })
}

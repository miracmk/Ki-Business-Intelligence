// YFZ 34 Faz 5b: Fulfillment Service Management — native paid add-on (addon_fulfillment).
// Couriers/shipments/warehouse picks. Same entitlement-gated pattern as
// customer-service.ts. Depends on erp_orders/erp_warehouses (Base ERP, Faz 4).
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '../../lib/db.js'
import { queryEntitySchema } from '../../lib/entity-provisioner.js'
import { hasActiveEntitlement } from '../../lib/entitlements.js'
import { encryptJson } from '../../lib/crypto.js'

const courierSchema = z.object({
  name: z.string().min(1),
  carrierCode: z.string().optional(),
  apiCredentials: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
})

const shipmentSchema = z.object({
  orderId: z.string().uuid(),
  courierId: z.string().uuid().optional().nullable(),
  trackingNumber: z.string().optional(),
  carrier: z.string().optional(),
  status: z.enum(['picking', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'failed']).optional(),
  notes: z.string().optional(),
})

const pickSchema = z.object({
  shipmentId: z.string().uuid().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
  status: z.enum(['pending', 'picking', 'picked', 'packed']).optional(),
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

export const fulfillmentNativeRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const user = req.user as { tenantId: string | null; role?: string } | undefined
    if (!user) return
    if (user.role === 'admin' || user.role === 'supervisor') return
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    if (!(await hasActiveEntitlement(ctx.entityId, 'addon_fulfillment'))) {
      return reply.status(402).send({ error: 'Fulfillment Service Management add-on aktif değil. Lütfen modülü etkinleştirin.' })
    }
  })

  // ── Couriers ───────────────────────────────────────────────────────────────
  app.get('/couriers', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const couriers = await queryEntitySchema(ctx.schema, `
      SELECT id, name, carrier_code AS "carrierCode", is_active AS "isActive", created_at AS "createdAt"
      FROM erp_couriers ORDER BY name ASC
    `)
    return { couriers }
  })

  app.post('/couriers', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = courierSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO erp_couriers (name, carrier_code, api_credentials, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, carrier_code AS "carrierCode", is_active AS "isActive"
    `, [
      body.data.name, body.data.carrierCode ?? null,
      body.data.apiCredentials ? encryptJson(body.data.apiCredentials) : null,
      body.data.isActive ?? true,
    ])
    return reply.status(201).send({ courier: rows[0] })
  })

  app.delete('/couriers/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await queryEntitySchema(ctx.schema, `UPDATE erp_couriers SET is_active = FALSE WHERE id = $1`, [id])
    return { ok: true }
  })

  // ── Shipments ──────────────────────────────────────────────────────────────
  app.get('/shipments', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { status } = req.query as Record<string, string>
    const conditions: string[] = []
    const params: unknown[] = []
    if (status) { params.push(status); conditions.push(`status = $${params.length}`) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const shipments = await queryEntitySchema(ctx.schema, `
      SELECT s.id, s.order_id AS "orderId", o.order_number AS "orderNumber", s.courier_id AS "courierId",
             s.tracking_number AS "trackingNumber", s.carrier, s.status,
             s.shipped_at AS "shippedAt", s.delivered_at AS "deliveredAt", s.notes,
             s.created_at AS "createdAt", s.updated_at AS "updatedAt"
      FROM erp_shipments s LEFT JOIN erp_orders o ON o.id = s.order_id
      ${where} ORDER BY s.created_at DESC
    `, params)
    return { shipments }
  })

  app.post('/shipments', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = shipmentSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const d = body.data
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO erp_shipments (order_id, courier_id, tracking_number, carrier, status, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, order_id AS "orderId", status, tracking_number AS "trackingNumber"
    `, [d.orderId, d.courierId ?? null, d.trackingNumber ?? null, d.carrier ?? null, d.status ?? 'picking', d.notes ?? null])
    return reply.status(201).send({ shipment: rows[0] })
  })

  app.put('/shipments/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const body = shipmentSchema.partial().safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const d = body.data
    const sets: string[] = []
    const params: unknown[] = []
    const map: Record<string, string> = { courierId: 'courier_id', trackingNumber: 'tracking_number', carrier: 'carrier', status: 'status', notes: 'notes' }
    for (const [key, val] of Object.entries(d)) {
      if (val === undefined || key === 'orderId') continue
      params.push(val); sets.push(`${map[key]} = $${params.length}`)
    }
    if (sets.length === 0) return { ok: true }
    let extraSet = ''
    if (d.status === 'shipped') extraSet = `, shipped_at = NOW()`
    else if (d.status === 'delivered') extraSet = `, delivered_at = NOW()`
    params.push(id)
    await queryEntitySchema(ctx.schema, `UPDATE erp_shipments SET ${sets.join(', ')}, updated_at = NOW()${extraSet} WHERE id = $${params.length}`, params)
    return { ok: true }
  })

  // ── Warehouse picks ────────────────────────────────────────────────────────
  app.get('/picks', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const picks = await queryEntitySchema(ctx.schema, `
      SELECT id, shipment_id AS "shipmentId", warehouse_id AS "warehouseId", status,
             picked_by AS "pickedBy", picked_at AS "pickedAt", created_at AS "createdAt"
      FROM erp_warehouse_picks ORDER BY created_at DESC
    `)
    return { picks }
  })

  app.post('/picks', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = pickSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO erp_warehouse_picks (shipment_id, warehouse_id, status)
      VALUES ($1, $2, $3) RETURNING id, shipment_id AS "shipmentId", status
    `, [body.data.shipmentId ?? null, body.data.warehouseId ?? null, body.data.status ?? 'pending'])
    return reply.status(201).send({ pick: rows[0] })
  })

  app.put('/picks/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const user = req.user as { sub: string }
    const body = pickSchema.partial().safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    if (!body.data.status) return { ok: true }
    const pickedAtSet = body.data.status === 'picked' ? `, picked_at = NOW(), picked_by = $2` : ''
    const params = pickedAtSet ? [body.data.status, user.sub, id] : [body.data.status, id]
    await queryEntitySchema(ctx.schema, `UPDATE erp_warehouse_picks SET status = $1${pickedAtSet} WHERE id = $${params.length}`, params)
    return { ok: true }
  })
}

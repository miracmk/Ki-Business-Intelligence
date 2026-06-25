// YFZ 34 Faz 5c: E-Commerce Management — native paid add-on (addon_ecommerce).
// Connection/listing/order management for marketplace selling (Amazon, eBay,
// Walmart, Trendyol, Hepsiburada). Real marketplace API sync (push stock/price,
// pull orders) is a FUTURE extension point — each provider would get its own
// adapter behind the MarketplaceAdapter interface below, mirroring how
// src/adapters/ already works for accounting/CRM providers. This phase ships the
// connection/listing/order data model + manual CRUD + a simulated connection test
// (same precedent as accounting.ts's payment-integrations test endpoint).
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { db } from '../../lib/db.js'
import { queryEntitySchema } from '../../lib/entity-provisioner.js'
import { hasActiveEntitlement } from '../../lib/entitlements.js'
import { encryptJson } from '../../lib/crypto.js'

export interface MarketplaceAdapter {
  provider: string
  testConnection(credentials: Record<string, unknown>): Promise<{ ok: boolean; error?: string }>
}

// Stub registry — real adapters (amazon-sp-api, trendyol, hepsiburada, ebay, walmart)
// get added here once seller credentials/sandboxes are available to implement against.
const MARKETPLACE_PROVIDERS = ['amazon', 'ebay', 'walmart', 'trendyol', 'hepsiburada'] as const

const connectionSchema = z.object({
  provider: z.enum(MARKETPLACE_PROVIDERS),
  name: z.string().min(1),
  credentials: z.record(z.unknown()).optional(),
})

const listingSchema = z.object({
  connectionId: z.string().uuid(),
  productId: z.string().uuid().optional().nullable(),
  marketplaceSku: z.string().optional(),
  priceOverride: z.number().optional(),
  stockOverride: z.number().optional(),
  isActive: z.boolean().optional(),
})

const marketplaceOrderSchema = z.object({
  connectionId: z.string().uuid(),
  externalOrderId: z.string().min(1),
  externalStatus: z.string().optional(),
  rawData: z.record(z.unknown()).optional(),
  // Minimal normalization input — creates a matching erp_orders row
  total: z.number().optional(),
  currency: z.string().optional(),
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

export const ecommerceNativeRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const user = req.user as { tenantId: string | null; role?: string } | undefined
    if (!user) return
    if (user.role === 'admin' || user.role === 'supervisor') return
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    if (!(await hasActiveEntitlement(ctx.entityId, 'addon_ecommerce'))) {
      return reply.status(402).send({ error: 'E-Commerce Management add-on aktif değil. Lütfen modülü etkinleştirin.' })
    }
  })

  // ── Marketplace connections ────────────────────────────────────────────────
  app.get('/connections', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const connections = await queryEntitySchema(ctx.schema, `
      SELECT id, provider, name, is_active AS "isActive", last_sync_at AS "lastSyncAt", created_at AS "createdAt"
      FROM erp_marketplace_connections ORDER BY created_at DESC
    `)
    return { connections }
  })

  app.post('/connections/test', { onRequest: [app.authenticate] }, async (req, reply) => {
    const body = connectionSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    // Simulated — real per-provider adapter test lands when marketplace credentials/sandboxes exist.
    return { ok: true, message: `${body.data.provider} bağlantısı test edildi (simulated)` }
  })

  app.post('/connections', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = connectionSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO erp_marketplace_connections (provider, name, credentials, is_active)
      VALUES ($1, $2, $3, TRUE) RETURNING id, provider, name, is_active AS "isActive"
    `, [body.data.provider, body.data.name, body.data.credentials ? encryptJson(body.data.credentials) : null])
    return reply.status(201).send({ connection: rows[0] })
  })

  app.delete('/connections/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await queryEntitySchema(ctx.schema, `UPDATE erp_marketplace_connections SET is_active = FALSE WHERE id = $1`, [id])
    return { ok: true }
  })

  // ── Listings ───────────────────────────────────────────────────────────────
  app.get('/listings', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const listings = await queryEntitySchema(ctx.schema, `
      SELECT l.id, l.connection_id AS "connectionId", c.provider, c.name AS "connectionName",
             l.product_id AS "productId", p.name AS "productName", l.marketplace_sku AS "marketplaceSku",
             l.price_override AS "priceOverride", l.stock_override AS "stockOverride",
             l.is_active AS "isActive", l.last_synced_at AS "lastSyncedAt"
      FROM erp_marketplace_listings l
      LEFT JOIN erp_marketplace_connections c ON c.id = l.connection_id
      LEFT JOIN erp_products p ON p.id = l.product_id
      ORDER BY l.created_at DESC
    `)
    return { listings }
  })

  app.post('/listings', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = listingSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const d = body.data
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO erp_marketplace_listings (connection_id, product_id, marketplace_sku, price_override, stock_override, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, connection_id AS "connectionId", marketplace_sku AS "marketplaceSku"
    `, [d.connectionId, d.productId ?? null, d.marketplaceSku ?? null, d.priceOverride ?? null, d.stockOverride ?? null, d.isActive ?? true])
    return reply.status(201).send({ listing: rows[0] })
  })

  app.delete('/listings/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await queryEntitySchema(ctx.schema, `DELETE FROM erp_marketplace_listings WHERE id = $1`, [id])
    return { ok: true }
  })

  // ── Marketplace orders (manual import → normalized into Base ERP erp_orders) ─
  app.get('/orders', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const orders = await queryEntitySchema(ctx.schema, `
      SELECT mo.id, mo.connection_id AS "connectionId", c.provider, mo.order_id AS "orderId",
             o.order_number AS "orderNumber", mo.external_order_id AS "externalOrderId",
             mo.external_status AS "externalStatus", mo.imported_at AS "importedAt"
      FROM erp_marketplace_orders mo
      LEFT JOIN erp_marketplace_connections c ON c.id = mo.connection_id
      LEFT JOIN erp_orders o ON o.id = mo.order_id
      ORDER BY mo.imported_at DESC
    `)
    return { orders }
  })

  app.post('/orders', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = marketplaceOrderSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const d = body.data

    // Normalize into Base ERP: a marketplace order becomes a real erp_orders row
    // (order_type='sale'), the same table native ERP CRUD (Faz 4) and Fulfillment (Faz 5b) use.
    const [order] = await queryEntitySchema(ctx.schema, `
      INSERT INTO erp_orders (order_type, order_number, status, total, currency, source_type, external_id)
      VALUES ('sale', $1, 'confirmed', $2, $3, 'marketplace', $4)
      RETURNING id
    `, [`SO-${nanoid(8).toUpperCase()}`, d.total ?? 0, d.currency ?? 'TRY', d.externalOrderId])

    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO erp_marketplace_orders (connection_id, order_id, external_order_id, external_status, raw_data)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, external_order_id AS "externalOrderId", order_id AS "orderId"
    `, [d.connectionId, order.id, d.externalOrderId, d.externalStatus ?? null, d.rawData ? JSON.stringify(d.rawData) : null])
    return reply.status(201).send({ order: rows[0] })
  })
}

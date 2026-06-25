// YFZ 34 Faz 4: native Base ERP CRUD — products/suppliers/orders/warehouses, written
// directly to entity-schema erp_* tables via queryEntitySchema. Same pattern as
// accounting.ts (Faz 2) and crm-native.ts (Faz 3). Deliberately EXCLUDES
// erp_staff/erp_staff_attendance/erp_payroll — those become the Personnel Management
// native add-on (Faz 5f), gated behind its own entitlement rather than bundled
// into free Base ERP. See KIBIPR.md §6/§14.2/§14.4.
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { db } from '../../lib/db.js'
import { queryEntitySchema } from '../../lib/entity-provisioner.js'

const productSchema = z.object({
  sku: z.string().optional(),
  barcode: z.string().optional(),
  name: z.string().min(1),
  shortName: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  brand: z.string().optional(),
  supplierId: z.string().uuid().optional().nullable(),
  unit: z.string().optional(),
  costPrice: z.number().optional(),
  salePrice: z.number().optional(),
  minSalePrice: z.number().optional(),
  currency: z.string().optional(),
  taxRate: z.number().optional(),
  discountRate: z.number().optional(),
  stockQuantity: z.number().optional(),
  reservedQuantity: z.number().optional(),
  reorderPoint: z.number().optional(),
  maxStockLevel: z.number().optional(),
  leadTimeDays: z.number().optional(),
  warehouseId: z.string().uuid().optional().nullable(),
  warehouseLocation: z.string().optional(),
  isActive: z.boolean().optional(),
  isTrackable: z.boolean().optional(),
  isSellable: z.boolean().optional(),
  isPurchasable: z.boolean().optional(),
  isService: z.boolean().optional(),
  imageUrl: z.string().optional(),
  images: z.array(z.string()).optional(),
  weightKg: z.number().optional(),
  dimensionsCm: z.object({ l: z.number().optional(), w: z.number().optional(), h: z.number().optional() }).optional(),
  customFields: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
})

const supplierSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  website: z.string().optional(),
  taxNumber: z.string().optional(),
  taxOffice: z.string().optional(),
  mersisNumber: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  paymentTerms: z.string().optional(),
  currency: z.string().optional(),
  creditLimit: z.number().optional(),
  bankName: z.string().optional(),
  bankIban: z.string().optional(),
  bankAccountNo: z.string().optional(),
  category: z.string().optional(),
  rating: z.number().min(1).max(5).optional(),
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
})

const orderSchema = z.object({
  orderType: z.enum(['purchase', 'sale']),
  contactId: z.string().uuid().optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  status: z.string().optional(),
  orderDate: z.string().optional(),
  expectedDate: z.string().optional(),
  actualDate: z.string().optional(),
  paymentDueDate: z.string().optional(),
  subtotal: z.number().optional(),
  discountAmount: z.number().optional(),
  taxAmount: z.number().optional(),
  shippingAmount: z.number().optional(),
  otherCharges: z.number().optional(),
  total: z.number().optional(),
  paidAmount: z.number().optional(),
  currency: z.string().optional(),
  exchangeRate: z.number().optional(),
  trackingNumber: z.string().optional(),
  carrier: z.string().optional(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

const warehouseSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  warehouseType: z.enum(['main', 'secondary', 'virtual', 'transit']).optional(),
  addressLine1: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  managerUserId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
})

const COLUMN_MAP: Record<string, Record<string, string>> = {
  erp_products: {
    sku: 'sku', barcode: 'barcode', name: 'name', shortName: 'short_name', description: 'description',
    category: 'category', subcategory: 'subcategory', brand: 'brand', supplierId: 'supplier_id', unit: 'unit',
    costPrice: 'cost_price', salePrice: 'sale_price', minSalePrice: 'min_sale_price', currency: 'currency',
    taxRate: 'tax_rate', discountRate: 'discount_rate', stockQuantity: 'stock_quantity',
    reservedQuantity: 'reserved_quantity', reorderPoint: 'reorder_point', maxStockLevel: 'max_stock_level',
    leadTimeDays: 'lead_time_days', warehouseId: 'warehouse_id', warehouseLocation: 'warehouse_location',
    isActive: 'is_active', isTrackable: 'is_trackable', isSellable: 'is_sellable', isPurchasable: 'is_purchasable',
    isService: 'is_service', imageUrl: 'image_url', images: 'images', weightKg: 'weight_kg',
    dimensionsCm: 'dimensions_cm', customFields: 'custom_fields', tags: 'tags',
  },
  erp_suppliers: {
    name: 'name', contactName: 'contact_name', email: 'email', phone: 'phone', website: 'website',
    taxNumber: 'tax_number', taxOffice: 'tax_office', mersisNumber: 'mersis_number',
    addressLine1: 'address_line1', addressLine2: 'address_line2', city: 'city', country: 'country',
    paymentTerms: 'payment_terms', currency: 'currency', creditLimit: 'credit_limit', bankName: 'bank_name',
    bankIban: 'bank_iban', bankAccountNo: 'bank_account_no', category: 'category', rating: 'rating',
    tags: 'tags', isActive: 'is_active',
  },
  erp_orders: {
    orderType: 'order_type', contactId: 'contact_id', companyId: 'company_id', supplierId: 'supplier_id',
    status: 'status', orderDate: 'order_date', expectedDate: 'expected_date', actualDate: 'actual_date',
    paymentDueDate: 'payment_due_date', subtotal: 'subtotal', discountAmount: 'discount_amount',
    taxAmount: 'tax_amount', shippingAmount: 'shipping_amount', otherCharges: 'other_charges', total: 'total',
    paidAmount: 'paid_amount', currency: 'currency', exchangeRate: 'exchange_rate',
    trackingNumber: 'tracking_number', carrier: 'carrier', assignedToUserId: 'assigned_to_user_id',
    warehouseId: 'warehouse_id', notes: 'notes', internalNotes: 'internal_notes', tags: 'tags',
  },
  erp_warehouses: {
    name: 'name', code: 'code', warehouseType: 'warehouse_type', addressLine1: 'address_line1',
    city: 'city', country: 'country', managerUserId: 'manager_user_id', isActive: 'is_active',
  },
}

function selectCols(table: keyof typeof COLUMN_MAP, extra: string[] = []): string {
  const fieldCols = Object.entries(COLUMN_MAP[table]).map(([camel, snake]) => `${snake} AS "${camel}"`)
  return ['id', ...fieldCols, ...extra].join(', ')
}

function buildInsert(table: keyof typeof COLUMN_MAP, data: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const map = COLUMN_MAP[table]
  const cols: string[] = []
  const params: unknown[] = []
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue
    cols.push(map[key])
    params.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val)
  }
  for (const [col, val] of Object.entries(extra)) { cols.push(col); params.push(val) }
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  return { cols, placeholders, params }
}

function buildUpdate(table: keyof typeof COLUMN_MAP, data: Record<string, unknown>) {
  const map = COLUMN_MAP[table]
  const sets: string[] = []
  const params: unknown[] = []
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue
    params.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val)
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

const SALE_STATUSES_CLOSING = ['delivered']
const PURCHASE_STATUSES_CLOSING = ['received']

export const erpNativeRoutes: FastifyPluginAsync = async (app) => {

  // ── Products ───────────────────────────────────────────────────────────────
  app.get('/products', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { category, search, lowStock } = req.query as Record<string, string>
    const conditions = ['deleted_at IS NULL']
    const params: unknown[] = []
    if (category) { params.push(category); conditions.push(`category = $${params.length}`) }
    if (search) { params.push(`%${search}%`); conditions.push(`(name ILIKE $${params.length} OR sku ILIKE $${params.length} OR barcode ILIKE $${params.length})`) }
    if (lowStock === '1') conditions.push(`reorder_point IS NOT NULL AND available_quantity <= reorder_point`)
    const products = await queryEntitySchema(ctx.schema, `
      SELECT ${selectCols('erp_products', ['available_quantity AS "availableQuantity"', 'created_at AS "createdAt"', 'updated_at AS "updatedAt"'])}
      FROM erp_products WHERE ${conditions.join(' AND ')} ORDER BY name ASC
    `, params)
    return { products }
  })

  app.post('/products', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = productSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const { cols, placeholders, params } = buildInsert('erp_products', body.data)
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO erp_products (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
      RETURNING ${selectCols('erp_products', ['available_quantity AS "availableQuantity"'])}
    `, params)
    return reply.status(201).send({ product: rows[0] })
  })

  app.put('/products/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const body = productSchema.partial().safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const { sets, params } = buildUpdate('erp_products', body.data)
    if (sets.length === 0) return { ok: true }
    params.push(id)
    await queryEntitySchema(ctx.schema, `UPDATE erp_products SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params)
    return { ok: true }
  })

  app.delete('/products/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await queryEntitySchema(ctx.schema, `UPDATE erp_products SET deleted_at = NOW() WHERE id = $1`, [id])
    return { ok: true }
  })

  // ── Suppliers ──────────────────────────────────────────────────────────────
  app.get('/suppliers', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { search } = req.query as Record<string, string>
    const conditions: string[] = []
    const params: unknown[] = []
    if (search) { params.push(`%${search}%`); conditions.push(`name ILIKE $${params.length}`) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const suppliers = await queryEntitySchema(ctx.schema, `
      SELECT ${selectCols('erp_suppliers', ['created_at AS "createdAt"', 'updated_at AS "updatedAt"'])}
      FROM erp_suppliers ${where} ORDER BY name ASC
    `, params)
    return { suppliers }
  })

  app.post('/suppliers', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = supplierSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const { cols, placeholders, params } = buildInsert('erp_suppliers', body.data)
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO erp_suppliers (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
      RETURNING ${selectCols('erp_suppliers')}
    `, params)
    return reply.status(201).send({ supplier: rows[0] })
  })

  app.put('/suppliers/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const body = supplierSchema.partial().safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const { sets, params } = buildUpdate('erp_suppliers', body.data)
    if (sets.length === 0) return { ok: true }
    params.push(id)
    await queryEntitySchema(ctx.schema, `UPDATE erp_suppliers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params)
    return { ok: true }
  })

  app.delete('/suppliers/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await queryEntitySchema(ctx.schema, `UPDATE erp_suppliers SET is_active = FALSE WHERE id = $1`, [id])
    return { ok: true }
  })

  // ── Orders ─────────────────────────────────────────────────────────────────
  app.get('/orders', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { orderType, status } = req.query as Record<string, string>
    const conditions: string[] = []
    const params: unknown[] = []
    if (orderType) { params.push(orderType); conditions.push(`order_type = $${params.length}`) }
    if (status) { params.push(status); conditions.push(`status = $${params.length}`) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const orders = await queryEntitySchema(ctx.schema, `
      SELECT ${selectCols('erp_orders', ['order_number AS "orderNumber"', 'created_at AS "createdAt"', 'updated_at AS "updatedAt"', 'cancelled_at AS "cancelledAt"', 'delivered_at AS "deliveredAt"'])}
      FROM erp_orders ${where} ORDER BY order_date DESC
    `, params)
    return { orders }
  })

  app.post('/orders', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = orderSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const orderNumber = `${body.data.orderType === 'purchase' ? 'PO' : 'SO'}-${nanoid(8).toUpperCase()}`
    const { cols, placeholders, params } = buildInsert('erp_orders', body.data, { order_number: orderNumber })
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO erp_orders (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
      RETURNING ${selectCols('erp_orders', ['order_number AS "orderNumber"'])}
    `, params)
    return reply.status(201).send({ order: rows[0] })
  })

  app.put('/orders/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const body = orderSchema.partial().safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const { sets, params } = buildUpdate('erp_orders', body.data)
    if (sets.length === 0) return { ok: true }
    let extraSet = ''
    if (body.data.status === 'cancelled') extraSet = `, cancelled_at = NOW()`
    else if (body.data.status && [...SALE_STATUSES_CLOSING, ...PURCHASE_STATUSES_CLOSING].includes(body.data.status)) extraSet = `, delivered_at = NOW()`
    params.push(id)
    await queryEntitySchema(ctx.schema, `UPDATE erp_orders SET ${sets.join(', ')}, updated_at = NOW()${extraSet} WHERE id = $${params.length}`, params)
    return { ok: true }
  })

  app.delete('/orders/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await queryEntitySchema(ctx.schema, `UPDATE erp_orders SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`, [id])
    return { ok: true }
  })

  // ── Warehouses (lightweight reference data) ───────────────────────────────
  app.get('/warehouses', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const warehouses = await queryEntitySchema(ctx.schema, `
      SELECT ${selectCols('erp_warehouses', ['created_at AS "createdAt"'])} FROM erp_warehouses ORDER BY name ASC
    `)
    return { warehouses }
  })

  app.post('/warehouses', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = warehouseSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const { cols, placeholders, params } = buildInsert('erp_warehouses', body.data)
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO erp_warehouses (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
      RETURNING ${selectCols('erp_warehouses')}
    `, params)
    return reply.status(201).send({ warehouse: rows[0] })
  })
}

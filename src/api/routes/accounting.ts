import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { nanoid } from 'nanoid'
import { db } from '../../lib/db.js'
import { accountingConnections, accountingRecords, accountingSyncState, paymentIntegrations, bankIntegrations } from '../../../db/schema.js'
import { encryptJson } from '../../lib/crypto.js'
import { createAccountingAdapter } from '../../adapters/index.js'
import { syncAccounting } from '../../engine/accounting-sync/sync.js'
import { eq } from 'drizzle-orm'
import { redis } from '../../lib/redis.js'
import { env } from '../../../config/env.js'
import { queryEntitySchema } from '../../lib/entity-provisioner.js'

const connectSchema = z.object({
  name: z.string().min(1),
  accountingType: z.enum(['quickbooks', 'xero', 'zoho_books', 'wave', 'freshbooks', 'sage_accounting', 'dynamics_finance', 'iyzico', 'parasut']),
  credentials: z.record(z.unknown()),
})

const testConnectSchema = z.object({
  accountingType: z.enum(['quickbooks', 'xero', 'zoho_books', 'wave', 'freshbooks', 'sage_accounting', 'dynamics_finance', 'iyzico', 'parasut']),
  credentials: z.record(z.unknown()),
})

// ── YFZ 34 Faz 2: native CRUD now targets entity-schema acc_* tables (consolidated
// off the old, disconnected public-schema acc_* set). See KIBIPR.md §6 / §14.2. ──

const contactSchema = z.object({
  contactType: z.enum(['customer', 'vendor', 'both']),
  name: z.string().min(1),
  shortName: z.string().optional(),
  taxNumber: z.string().optional(),
  taxOffice: z.string().optional(),
  mersisNumber: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  website: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  currency: z.string().optional(),
  creditLimit: z.number().optional(),
  paymentTerms: z.string().optional(),
  balance: z.number().optional(),
  bankName: z.string().optional(),
  bankIban: z.string().optional(),
  crmContactId: z.string().uuid().optional().nullable(),
  crmCompanyId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
})

const invoiceSchema = z.object({
  invoiceType: z.enum(['sale', 'purchase', 'credit_note', 'debit_note']),
  contactId: z.string().uuid(),
  orderId: z.string().uuid().optional().nullable(),
  status: z.enum(['draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'cancelled']).optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  deliveryDate: z.string().optional(),
  subtotal: z.number().optional(),
  discountAmount: z.number().optional(),
  taxAmount: z.number().optional(),
  withholdingTax: z.number().optional(),
  stampTax: z.number().optional(),
  total: z.number().optional(),
  paidAmount: z.number().optional(),
  currency: z.string().optional(),
  exchangeRate: z.number().optional(),
  efaturaUuid: z.string().optional(),
  efaturaStatus: z.string().optional(),
  efaturaType: z.string().optional(),
  notes: z.string().optional(),
  terms: z.string().optional(),
  filePath: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

const paymentSchema = z.object({
  paymentType: z.enum(['received', 'sent']),
  amount: z.number(),
  currency: z.string().optional(),
  exchangeRate: z.number().optional(),
  paymentDate: z.string().optional(),
  paymentMethod: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  contactId: z.string().uuid().optional().nullable(),
  invoiceId: z.string().uuid().optional().nullable(),
  bankAccountId: z.string().uuid().optional().nullable(),
  isReconciled: z.boolean().optional(),
})

const expenseSchema = z.object({
  category: z.string().min(1),
  subcategory: z.string().optional(),
  description: z.string().optional(),
  amount: z.number(),
  taxAmount: z.number().optional(),
  currency: z.string().optional(),
  expenseDate: z.string().optional(),
  paymentMethod: z.string().optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'paid']).optional(),
  contactId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  isBillable: z.boolean().optional(),
  projectCode: z.string().optional(),
  costCenter: z.string().optional(),
  receiptUrl: z.string().optional(),
  receiptNumber: z.string().optional(),
  accountCode: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

const integrationSchema = z.object({
  provider: z.string(),
  name: z.string(),
  credentials: z.record(z.unknown()),
  webhookSecret: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
})

// camelCase field → snake_case column, per entity-schema table (db/entity-schema-template.sql)
const COLUMN_MAP: Record<string, Record<string, string>> = {
  acc_contacts: {
    contactType: 'contact_type', name: 'name', shortName: 'short_name', taxNumber: 'tax_number',
    taxOffice: 'tax_office', mersisNumber: 'mersis_number', email: 'email', phone: 'phone',
    website: 'website', addressLine1: 'address_line1', addressLine2: 'address_line2', city: 'city',
    country: 'country', postalCode: 'postal_code', currency: 'currency', creditLimit: 'credit_limit',
    paymentTerms: 'payment_terms', balance: 'balance', bankName: 'bank_name', bankIban: 'bank_iban',
    crmContactId: 'crm_contact_id', crmCompanyId: 'crm_company_id', tags: 'tags', isActive: 'is_active',
  },
  acc_invoices: {
    invoiceType: 'invoice_type', contactId: 'contact_id', orderId: 'order_id', status: 'status',
    issueDate: 'issue_date', dueDate: 'due_date', deliveryDate: 'delivery_date', subtotal: 'subtotal',
    discountAmount: 'discount_amount', taxAmount: 'tax_amount', withholdingTax: 'withholding_tax',
    stampTax: 'stamp_tax', total: 'total', paidAmount: 'paid_amount', currency: 'currency',
    exchangeRate: 'exchange_rate', efaturaUuid: 'efatura_uuid', efaturaStatus: 'efatura_status',
    efaturaType: 'efatura_type', notes: 'notes', terms: 'terms', filePath: 'file_path', tags: 'tags',
  },
  acc_payments: {
    paymentType: 'payment_type', amount: 'amount', currency: 'currency', exchangeRate: 'exchange_rate',
    paymentDate: 'payment_date', paymentMethod: 'payment_method', reference: 'reference', notes: 'notes',
    contactId: 'contact_id', invoiceId: 'invoice_id', bankAccountId: 'bank_account_id', isReconciled: 'is_reconciled',
  },
  acc_expenses: {
    category: 'category', subcategory: 'subcategory', description: 'description', amount: 'amount',
    taxAmount: 'tax_amount', currency: 'currency', expenseDate: 'expense_date', paymentMethod: 'payment_method',
    status: 'status', contactId: 'contact_id', supplierId: 'supplier_id', isBillable: 'is_billable',
    projectCode: 'project_code', costCenter: 'cost_center', receiptUrl: 'receipt_url',
    receiptNumber: 'receipt_number', accountCode: 'account_code', tags: 'tags',
  },
}

function selectCols(table: keyof typeof COLUMN_MAP, extra: string[] = []): string {
  const fieldCols = Object.entries(COLUMN_MAP[table]).map(([camel, snake]) => `${snake} AS "${camel}"`)
  return ['id', ...fieldCols, ...extra].join(', ')
}

// Builds INSERT column/placeholder/param lists. `extra` carries server-set raw snake_case
// columns (e.g. invoice_number) that aren't part of the user-writable camelCase map.
function buildInsert(table: keyof typeof COLUMN_MAP, data: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const map = COLUMN_MAP[table]
  const cols: string[] = []
  const params: unknown[] = []
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue
    cols.push(map[key])
    params.push(Array.isArray(val) ? JSON.stringify(val) : val)
  }
  for (const [col, val] of Object.entries(extra)) {
    cols.push(col)
    params.push(val)
  }
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  return { cols, placeholders, params }
}

function buildUpdate(table: keyof typeof COLUMN_MAP, data: Record<string, unknown>) {
  const map = COLUMN_MAP[table]
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

export const accountingRoutes: FastifyPluginAsync = async (app) => {

  // ── OAuth start — Zoho Books / QuickBooks / Xero ──────────────────────────
  app.post('/oauth/start', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    const isUUID = (s: string | null | undefined) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Entity bağlantısı gerekli' })
    if (!['entity_main', 'admin', 'supervisor'].includes(user.role)) return reply.status(403).send({ error: 'Yetkisiz' })

    const { provider, name, clientId, clientSecret, region = 'com', organizationId = '' } = req.body as {
      provider: string; name?: string; clientId: string; clientSecret: string; region?: string; organizationId?: string
    }
    if (!provider || !clientId || !clientSecret) {
      return reply.status(400).send({ error: 'provider, clientId, clientSecret gerekli' })
    }

    const state = nanoid(32)
    await redis.setex(`ki:acc:oauth:state:${state}`, 600, JSON.stringify({
      tenantId: user.tenantId, userId: user.sub,
      provider, name: name || provider, clientId, clientSecret, region, organizationId,
    }))

    const callbackUrl = `${env.APP_URL}/webhooks/accounting/${provider}/callback`
    let authUrl = ''

    if (provider === 'zoho_books') {
      authUrl = `https://accounts.zoho.${region}/oauth/v2/auth?` + new URLSearchParams({
        response_type: 'code', client_id: clientId,
        scope: 'ZohoBooks.fullaccess.all', redirect_uri: callbackUrl,
        state, access_type: 'offline', prompt: 'consent',
      })
    } else if (provider === 'quickbooks') {
      authUrl = `https://appcenter.intuit.com/connect/oauth2?` + new URLSearchParams({
        client_id: clientId, scope: 'com.intuit.quickbooks.accounting',
        redirect_uri: callbackUrl, response_type: 'code', state,
      })
    } else if (provider === 'xero') {
      authUrl = `https://login.xero.com/identity/connect/authorize?` + new URLSearchParams({
        response_type: 'code', client_id: clientId, redirect_uri: callbackUrl,
        scope: 'openid profile email accounting.transactions accounting.contacts offline_access',
        state,
      })
    } else {
      return reply.status(400).send({ error: 'Bu provider OAuth ile desteklenmiyor' })
    }

    return reply.send({ authUrl, state })
  })

  app.get('/connections', { onRequest: [app.authenticate] }, async (req) => {
    const user = req.user as { sub: string; tenantId: string }
    const conns = await db.query.accountingConnections.findMany({
      where: (t, { eq }) => eq(t.tenantId, user.tenantId),
      columns: { id: true, name: true, accountingType: true, isActive: true, lastSyncAt: true, createdAt: true, credentials: false },
    })
    return { connections: conns }
  })

  app.post('/connections/test', { onRequest: [app.authenticate] }, async (req, reply) => {
    const body = testConnectSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const { accountingType, credentials } = body.data
    try {
      const adapter = createAccountingAdapter({ type: accountingType, ...credentials })
      const result = await adapter.validateConnection()
      return reply.send(result)
    } catch (e: any) {
      return reply.send({ ok: false, error: e.message })
    }
  })

  app.post('/connections', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    const body = connectSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const { name, accountingType, credentials } = body.data
    const adapter = createAccountingAdapter({ type: accountingType, ...credentials })
    const check = await adapter.validateConnection()
    if (!check.ok) return reply.status(422).send({ error: `Bağlantı başarısız: ${check.error}` })
    const [conn] = await db.insert(accountingConnections).values({
      tenantId: user.tenantId,
      name,
      accountingType: accountingType as any,
      credentials: encryptJson({ type: accountingType, ...credentials }),
    }).returning()
    return reply.status(201).send({ connection: { id: conn!.id, name, accountingType } })
  })

  app.delete('/connections/:id', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string }
    await db.delete(accountingConnections).where(eq(accountingConnections.id, id))
    return { ok: true }
  })

  app.post('/connections/:id/sync', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string }
    syncAccounting(id).then(() => console.log('[AccountingSync] Done')).catch(console.error)
    return { message: 'Sync başlatıldı' }
  })

  app.get('/connections/:id/invoices', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string }
    const { page = '1', limit = '50' } = req.query as Record<string, string>
    const records = await db.query.accountingRecords.findMany({
      where: (t, { and, eq }) => and(eq(t.connectionId, id), eq(t.recordType, 'invoice')),
      limit: Math.min(Number(limit), 200),
      offset: (Number(page) - 1) * Number(limit),
      orderBy: (t, { desc }) => [desc(t.lastSyncedAt)],
    })
    return { invoices: records.map((r) => r.data), count: records.length }
  })

  app.get('/connections/:id/payments', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string }
    const records = await db.query.accountingRecords.findMany({
      where: (t, { and, eq }) => and(eq(t.connectionId, id), eq(t.recordType, 'payment')),
      orderBy: (t, { desc }) => [desc(t.lastSyncedAt)],
    })
    return { payments: records.map((r) => r.data) }
  })

  app.get('/connections/:id/customers', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string }
    const records = await db.query.accountingRecords.findMany({
      where: (t, { and, eq }) => and(eq(t.connectionId, id), eq(t.recordType, 'customer')),
      orderBy: (t, { desc }) => [desc(t.lastSyncedAt)],
    })
    return { customers: records.map((r) => r.data) }
  })

  app.get('/connections/:id/sync-status', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string }
    const states = await db.query.accountingSyncState.findMany({ where: (t, { eq }) => eq(t.connectionId, id) })
    return { syncState: states }
  })

  // ── Contacts (entity-schema acc_contacts) ─────────────────────────────────
  app.get('/contacts', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })

    const { type, search } = req.query as Record<string, string>
    const conditions: string[] = []
    const params: unknown[] = []
    if (type) { params.push(type); conditions.push(`contact_type = $${params.length}`) }
    if (search) { params.push(`%${search}%`); conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length})`) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const contacts = await queryEntitySchema(ctx.schema, `
      SELECT ${selectCols('acc_contacts', ['created_at AS "createdAt"', 'updated_at AS "updatedAt"'])}
      FROM acc_contacts ${where} ORDER BY name ASC
    `, params)
    return { contacts }
  })

  app.post('/contacts', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = contactSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { cols, placeholders, params } = buildInsert('acc_contacts', body.data)
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO acc_contacts (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
      RETURNING ${selectCols('acc_contacts')}
    `, params)
    return reply.status(201).send({ contact: rows[0] })
  })

  app.put('/contacts/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const body = contactSchema.partial().safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { sets, params } = buildUpdate('acc_contacts', body.data)
    if (sets.length === 0) return { ok: true }
    params.push(id)
    await queryEntitySchema(ctx.schema, `
      UPDATE acc_contacts SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}
    `, params)
    return { ok: true }
  })

  app.delete('/contacts/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await queryEntitySchema(ctx.schema, `DELETE FROM acc_contacts WHERE id = $1`, [id])
    return { ok: true }
  })

  app.get('/contacts/:id/balance', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const rows = await queryEntitySchema(ctx.schema, `SELECT balance FROM acc_contacts WHERE id = $1`, [id])
    return { balance: rows[0]?.balance ?? 0 }
  })

  // ── Invoices (entity-schema acc_invoices) ─────────────────────────────────
  app.get('/invoices', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })

    const { type, status, from, to } = req.query as Record<string, string>
    const conditions: string[] = []
    const params: unknown[] = []
    if (type) { params.push(type); conditions.push(`invoice_type = $${params.length}`) }
    if (status) { params.push(status); conditions.push(`status = $${params.length}`) }
    if (from) { params.push(from); conditions.push(`issue_date >= $${params.length}`) }
    if (to) { params.push(to); conditions.push(`issue_date <= $${params.length}`) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const invoices = await queryEntitySchema(ctx.schema, `
      SELECT ${selectCols('acc_invoices', [
        'invoice_number AS "invoiceNumber"', 'remaining_amount AS "remainingAmount"',
        'created_at AS "createdAt"', 'updated_at AS "updatedAt"', 'cancelled_at AS "cancelledAt"',
      ])}
      FROM acc_invoices ${where} ORDER BY issue_date DESC
    `, params)
    return { invoices }
  })

  app.post('/invoices', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = invoiceSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const invoiceNumber = `INV-${nanoid(8).toUpperCase()}`
    const { cols, placeholders, params } = buildInsert('acc_invoices', body.data, { invoice_number: invoiceNumber })
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO acc_invoices (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
      RETURNING ${selectCols('acc_invoices', ['invoice_number AS "invoiceNumber"', 'remaining_amount AS "remainingAmount"'])}
    `, params)
    return reply.status(201).send({ invoice: rows[0] })
  })

  app.put('/invoices/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const body = invoiceSchema.partial().safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { sets, params } = buildUpdate('acc_invoices', body.data)
    if (sets.length === 0) return { ok: true }
    params.push(id)
    await queryEntitySchema(ctx.schema, `
      UPDATE acc_invoices SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}
    `, params)
    return { ok: true }
  })

  app.delete('/invoices/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await queryEntitySchema(ctx.schema, `DELETE FROM acc_invoices WHERE id = $1`, [id])
    return { ok: true }
  })

  app.post('/invoices/:id/send', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await queryEntitySchema(ctx.schema, `UPDATE acc_invoices SET status = 'sent', updated_at = NOW() WHERE id = $1`, [id])
    return { ok: true, message: 'Invoice email gönderildi (simulated)' }
  })

  app.post('/invoices/:id/payment-link', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string }
    return { ok: true, link: `https://payments.kibusiness.local/invoice/${id}` }
  })

  app.post('/invoices/upload', { onRequest: [app.authenticate] }, async (req, reply) => {
    if (!req.isMultipart || !req.isMultipart()) return reply.status(400).send({ error: 'PDF dosyası gerekli' })
    const data = await req.file()
    if (!data) return reply.status(400).send({ error: 'Dosya alınamadı' })
    const uploadsDir = path.resolve(process.cwd(), 'uploads')
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
    const filename = `invoice-${Date.now()}-${data.filename}`
    const filePath = path.join(uploadsDir, filename)
    const writeStream = fs.createWriteStream(filePath)
    await data.file.pipe(writeStream)
    return { ok: true, filePath }
  })

  app.get('/invoices/:id/pdf', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const rows = await queryEntitySchema(ctx.schema, `SELECT file_path AS "filePath" FROM acc_invoices WHERE id = $1`, [id])
    if (!rows[0]?.filePath) return reply.status(404).send({ error: 'PDF bulunamadı' })
    return reply.send({ filePath: rows[0].filePath })
  })

  // ── Payments (entity-schema acc_payments) ─────────────────────────────────
  app.get('/payments', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const payments = await queryEntitySchema(ctx.schema, `
      SELECT ${selectCols('acc_payments', ['payment_number AS "paymentNumber"', 'created_at AS "createdAt"'])}
      FROM acc_payments ORDER BY payment_date DESC
    `)
    return { payments }
  })

  app.post('/payments', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = paymentSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { cols, placeholders, params } = buildInsert('acc_payments', body.data)
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO acc_payments (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
      RETURNING ${selectCols('acc_payments', ['payment_number AS "paymentNumber"'])}
    `, params)
    return reply.status(201).send({ payment: rows[0] })
  })

  // ── Expenses (entity-schema acc_expenses) ─────────────────────────────────
  app.get('/expenses', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })

    const { category, from, to } = req.query as Record<string, string>
    const conditions: string[] = []
    const params: unknown[] = []
    if (category) { params.push(category); conditions.push(`category = $${params.length}`) }
    if (from) { params.push(from); conditions.push(`expense_date >= $${params.length}`) }
    if (to) { params.push(to); conditions.push(`expense_date <= $${params.length}`) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const expenses = await queryEntitySchema(ctx.schema, `
      SELECT ${selectCols('acc_expenses', ['total_amount AS "totalAmount"', 'created_at AS "createdAt"', 'updated_at AS "updatedAt"'])}
      FROM acc_expenses ${where} ORDER BY expense_date DESC
    `, params)
    return { expenses }
  })

  app.post('/expenses', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = expenseSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { cols, placeholders, params } = buildInsert('acc_expenses', body.data)
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO acc_expenses (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
      RETURNING ${selectCols('acc_expenses', ['total_amount AS "totalAmount"'])}
    `, params)
    return reply.status(201).send({ expense: rows[0] })
  })

  app.put('/expenses/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const body = expenseSchema.partial().safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { sets, params } = buildUpdate('acc_expenses', body.data)
    if (sets.length === 0) return { ok: true }
    params.push(id)
    await queryEntitySchema(ctx.schema, `
      UPDATE acc_expenses SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}
    `, params)
    return { ok: true }
  })

  app.delete('/expenses/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await queryEntitySchema(ctx.schema, `DELETE FROM acc_expenses WHERE id = $1`, [id])
    return { ok: true }
  })

  // ── Reports (entity-schema, fully parameterized — closes the prior string-
  // interpolation SQL pattern as a side-effect of the schema cutover) ────────
  app.get('/reports/income-statement', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { from, to } = req.query as Record<string, string>

    const invWhere: string[] = [`invoice_type = 'sale'`]
    const invParams: unknown[] = []
    if (from) { invParams.push(from); invWhere.push(`issue_date >= $${invParams.length}`) }
    if (to) { invParams.push(to); invWhere.push(`issue_date <= $${invParams.length}`) }

    const expWhere: string[] = []
    const expParams: unknown[] = []
    if (from) { expParams.push(from); expWhere.push(`expense_date >= $${expParams.length}`) }
    if (to) { expParams.push(to); expWhere.push(`expense_date <= $${expParams.length}`) }

    const [revRows] = await Promise.all([
      queryEntitySchema(ctx.schema, `SELECT COALESCE(SUM(total),0) AS revenue, COALESCE(SUM(discount_amount),0) AS discounts FROM acc_invoices WHERE ${invWhere.join(' AND ')}`, invParams),
    ])
    const expRows = await queryEntitySchema(ctx.schema, `SELECT COALESCE(SUM(amount),0) AS expenses FROM acc_expenses${expWhere.length ? ' WHERE ' + expWhere.join(' AND ') : ''}`, expParams)

    const revenue = Number(revRows[0]?.revenue ?? 0)
    const expenseTotal = Number(expRows[0]?.expenses ?? 0)
    return { revenue, expenses: expenseTotal, grossProfit: revenue - expenseTotal, netProfit: revenue - expenseTotal, breakdown: { revenue, expenses: expenseTotal } }
  })

  app.get('/reports/balance-sheet', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const rows = await queryEntitySchema(ctx.schema, `SELECT COALESCE(SUM(balance),0) AS assets FROM acc_contacts`)
    const assets = Number(rows[0]?.assets ?? 0)
    return { assets: { cash: assets, receivables: 0, inventory: 0 }, liabilities: { payables: 0, debt: 0 }, equity: assets }
  })

  app.get('/reports/cash-flow', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { from, to } = req.query as Record<string, string>

    const where: string[] = []
    const params: unknown[] = []
    if (from) { params.push(from); where.push(`payment_date >= $${params.length}`) }
    if (to) { params.push(to); where.push(`payment_date <= $${params.length}`) }
    const dateClause = where.length ? ` AND ${where.join(' AND ')}` : ''

    const income = await queryEntitySchema(ctx.schema, `SELECT COALESCE(SUM(amount),0) AS total FROM acc_payments WHERE payment_type = 'received'${dateClause}`, params)
    const outgoing = await queryEntitySchema(ctx.schema, `SELECT COALESCE(SUM(amount),0) AS total FROM acc_payments WHERE payment_type = 'sent'${dateClause}`, params)

    const net = Number(income[0]?.total ?? 0) - Number(outgoing[0]?.total ?? 0)
    return { operating: net, investing: 0, financing: 0, net }
  })

  app.get('/reports/profitability', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { from, to } = req.query as Record<string, string>

    const invWhere: string[] = []
    const invParams: unknown[] = []
    if (from) { invParams.push(from); invWhere.push(`issue_date >= $${invParams.length}`) }
    if (to) { invParams.push(to); invWhere.push(`issue_date <= $${invParams.length}`) }

    const expWhere: string[] = []
    const expParams: unknown[] = []
    if (from) { expParams.push(from); expWhere.push(`expense_date >= $${expParams.length}`) }
    if (to) { expParams.push(to); expWhere.push(`expense_date <= $${expParams.length}`) }

    const revRows = await queryEntitySchema(ctx.schema, `SELECT COALESCE(SUM(total),0) AS revenue FROM acc_invoices${invWhere.length ? ' WHERE ' + invWhere.join(' AND ') : ''}`, invParams)
    const expRows = await queryEntitySchema(ctx.schema, `SELECT COALESCE(SUM(amount),0) AS expenses FROM acc_expenses${expWhere.length ? ' WHERE ' + expWhere.join(' AND ') : ''}`, expParams)

    const revenue = Number(revRows[0]?.revenue ?? 0)
    const expenses = Number(expRows[0]?.expenses ?? 0)
    return { revenue, expenses, grossMargin: revenue ? (revenue - expenses) / revenue : 0, netMargin: revenue ? (revenue - expenses) / revenue : 0, ROA: 0 }
  })

  app.get('/payment-integrations', { onRequest: [app.authenticate] }, async (req) => {
    const user = req.user as { tenantId: string }
    const integrations = await db.query.paymentIntegrations.findMany({ where: (t, { eq }) => eq(t.tenantId, user.tenantId) })
    return { integrations }
  })

  app.post('/payment-integrations', { onRequest: [app.authenticate] }, async (req) => {
    const user = req.user as { tenantId: string }
    const body = integrationSchema.safeParse(req.body)
    if (!body.success) return { error: body.error.flatten() }
    const [integration] = await db.insert(paymentIntegrations).values({
      tenantId: user.tenantId,
      ...body.data,
      isActive: true,
    } as any).returning()
    return { integration }
  })

  app.delete('/payment-integrations/:id', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string }
    await db.delete(paymentIntegrations).where(eq(paymentIntegrations.id, id))
    return { ok: true }
  })

  app.post('/payment-integrations/:id/test', { onRequest: [app.authenticate] }, async (req) => {
    return { ok: true, message: 'Test başarıyla geçti (simulated)' }
  })

  app.get('/bank-integrations', { onRequest: [app.authenticate] }, async (req) => {
    const user = req.user as { tenantId: string }
    const banks = await db.query.bankIntegrations.findMany({ where: (t, { eq }) => eq(t.tenantId, user.tenantId) })
    return { banks }
  })

  app.post('/bank-integrations', { onRequest: [app.authenticate] }, async (req) => {
    const user = req.user as { tenantId: string }
    const body = z.object({ provider: z.string(), bankName: z.string(), country: z.string(), credentials: z.record(z.unknown()), accountIdExternal: z.string().optional(), lastSyncAt: z.string().optional(), isActive: z.boolean().optional() }).safeParse(req.body)
    if (!body.success) return { error: body.error.flatten() }
    const [bank] = await db.insert(bankIntegrations).values({
      tenantId: user.tenantId,
      ...body.data,
      lastSyncAt: body.data.lastSyncAt ? new Date(body.data.lastSyncAt) : undefined,
      isActive: body.data.isActive ?? true,
    } as any).returning()
    return { bank }
  })

  app.delete('/bank-integrations/:id', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string }
    await db.delete(bankIntegrations).where(eq(bankIntegrations.id, id))
    return { ok: true }
  })
}

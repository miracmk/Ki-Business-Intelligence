import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { nanoid } from 'nanoid'
import { db } from '../../lib/db.js'
import { accountingConnections, accountingRecords, accountingSyncState, accContacts, accInvoices, accInvoiceLines, accPayments, accExpenses, paymentIntegrations, bankIntegrations } from '../../../db/schema.js'
import { encryptJson } from '../../lib/crypto.js'
import { createAccountingAdapter } from '../../adapters/index.js'
import { syncAccounting } from '../../engine/accounting-sync/sync.js'
import { eq, and, or, desc, asc, sql } from 'drizzle-orm'
import { redis } from '../../lib/redis.js'
import { env } from '../../../config/env.js'

const connectSchema = z.object({
  name: z.string().min(1),
  accountingType: z.enum(['quickbooks', 'xero', 'zoho_books', 'wave', 'freshbooks', 'sage_accounting', 'dynamics_finance', 'iyzico', 'parasut']),
  credentials: z.record(z.unknown()),
})

const testConnectSchema = z.object({
  accountingType: z.enum(['quickbooks', 'xero', 'zoho_books', 'wave', 'freshbooks', 'sage_accounting', 'dynamics_finance', 'iyzico', 'parasut']),
  credentials: z.record(z.unknown()),
})

const contactSchema = z.object({
  contactType: z.enum(['individual', 'corporate']),
  name: z.string().min(1),
  taxNumber: z.string().optional(),
  taxOffice: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  country: z.string().optional(),
  currencyCode: z.string().optional(),
  balance: z.number().optional(),
  crmContactId: z.string().optional(),
})

const invoiceSchema = z.object({
  invoiceType: z.enum(['sale', 'purchase']),
  contactId: z.string().uuid(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  currencyCode: z.string().optional(),
  subtotal: z.number().optional(),
  taxTotal: z.number().optional(),
  discountTotal: z.number().optional(),
  total: z.number().optional(),
  paidAmount: z.number().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
  externalId: z.string().optional(),
})

const paymentSchema = z.object({
  paymentType: z.enum(['received', 'sent']),
  amount: z.number(),
  currencyCode: z.string().optional(),
  paymentMethod: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
  contactId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
})

const expenseSchema = z.object({
  expenseDate: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  amount: z.number().optional(),
  currencyCode: z.string().optional(),
  contactId: z.string().uuid().optional(),
  accountCode: z.string().optional(),
  receiptPath: z.string().optional(),
  status: z.string().optional(),
})

const integrationSchema = z.object({
  provider: z.string(),
  name: z.string(),
  credentials: z.record(z.unknown()),
  webhookSecret: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
})

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

  app.get('/contacts', { onRequest: [app.authenticate] }, async (req) => {
    const user = req.user as { tenantId: string }
    const { type, search } = req.query as Record<string, string>
    const contacts = await db.query.accContacts.findMany({
      where: (t, { and, eq, or }) => {
        const conditions = [eq(t.tenantId, user.tenantId)] as any[]
        if (type) conditions.push(eq(t.contactType, type as any))
        if (search) {
          conditions.push(or(eq(t.name, search), eq(t.email, search), eq(t.phone, search)))
        }
        return and(...conditions as any)
      },
      orderBy: (t, { asc }) => [asc(t.name)],
    })
    return { contacts }
  })

  app.post('/contacts', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string }
    const body = contactSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const [contact] = await db.insert(accContacts).values({
      tenantId: user.tenantId,
      ...body.data,
    } as any).returning()
    return reply.status(201).send({ contact })
  })

  app.put('/contacts/:id', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = contactSchema.partial().safeParse(req.body)
    if (!body.success) return { error: body.error.flatten() }
    await db.update(accContacts).set({ ...body.data as any, updatedAt: new Date() }).where(eq(accContacts.id, id))
    return { ok: true }
  })

  app.delete('/contacts/:id', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string }
    await db.delete(accContacts).where(eq(accContacts.id, id))
    return { ok: true }
  })

  app.get('/contacts/:id/balance', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string }
    const contact = await db.query.accContacts.findFirst({ where: (t, { eq }) => eq(t.id, id) })
    return { balance: contact?.balance ?? 0 }
  })

  app.get('/invoices', { onRequest: [app.authenticate] }, async (req) => {
    const user = req.user as { tenantId: string }
    const { type, status, from, to } = req.query as Record<string, string>
    const invoices = await db.query.accInvoices.findMany({
      where: (t, { and, eq }) => {
        const conditions = [eq(t.tenantId, user.tenantId)] as any[]
        if (type) conditions.push(eq(t.invoiceType, type as any))
        if (status) conditions.push(eq(t.status, status))
        if (from) conditions.push(sql`${t.issueDate} >= ${from}`)
        if (to) conditions.push(sql`${t.issueDate} <= ${to}`)
        return and(...conditions as any)
      },
      orderBy: (t, { desc }) => [desc(t.issueDate)],
    })
    return { invoices }
  })

  app.post('/invoices', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string }
    const body = invoiceSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const invoiceNumber = `INV-${nanoid(8).toUpperCase()}`
    const [invoice] = await db.insert(accInvoices).values({
      tenantId: user.tenantId,
      invoiceNumber,
      ...body.data,
    } as any).returning()
    return reply.status(201).send({ invoice })
  })

  app.put('/invoices/:id', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = invoiceSchema.partial().safeParse(req.body)
    if (!body.success) return { error: body.error.flatten() }
    await db.update(accInvoices).set({ ...body.data as any, updatedAt: new Date() }).where(eq(accInvoices.id, id))
    return { ok: true }
  })

  app.delete('/invoices/:id', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string }
    await db.delete(accInvoices).where(eq(accInvoices.id, id))
    return { ok: true }
  })

  app.post('/invoices/:id/send', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string }
    await db.update(accInvoices).set({ status: 'sent', updatedAt: new Date() }).where(eq(accInvoices.id, id))
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
    const { id } = req.params as { id: string }
    const invoice = await db.query.accInvoices.findFirst({ where: (t, { eq }) => eq(t.id, id) })
    if (!invoice?.filePath) return reply.status(404).send({ error: 'PDF bulunamadı' })
    return reply.send({ filePath: invoice.filePath })
  })

  app.get('/payments', { onRequest: [app.authenticate] }, async (req) => {
    const user = req.user as { tenantId: string }
    const payments = await db.query.accPayments.findMany({ where: (t, { eq }) => eq(t.tenantId, user.tenantId) })
    return { payments }
  })

  app.post('/payments', { onRequest: [app.authenticate] }, async (req) => {
    const user = req.user as { tenantId: string }
    const body = paymentSchema.safeParse(req.body)
    if (!body.success) return { error: body.error.flatten() }
    const [payment] = await db.insert(accPayments).values({
      tenantId: user.tenantId,
      ...body.data,
    } as any).returning()
    return { payment }
  })

  app.get('/expenses', { onRequest: [app.authenticate] }, async (req) => {
    const user = req.user as { tenantId: string }
    const { category, from, to } = req.query as Record<string, string>
    const expenses = await db.query.accExpenses.findMany({
      where: (t, { and, eq }) => {
        const conditions = [eq(t.tenantId, user.tenantId)] as any[]
        if (category) conditions.push(eq(t.category, category))
        if (from) conditions.push(sql`${t.expenseDate} >= ${from}`)
        if (to) conditions.push(sql`${t.expenseDate} <= ${to}`)
        return and(...conditions as any)
      },
      orderBy: (t, { desc }) => [desc(t.expenseDate)],
    })
    return { expenses }
  })

  app.post('/expenses', { onRequest: [app.authenticate] }, async (req) => {
    const user = req.user as { tenantId: string }
    const body = expenseSchema.safeParse(req.body)
    if (!body.success) return { error: body.error.flatten() }
    const [expense] = await db.insert(accExpenses).values({
      tenantId: user.tenantId,
      ...body.data,
    } as any).returning()
    return { expense }
  })

  app.put('/expenses/:id', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = expenseSchema.partial().safeParse(req.body)
    if (!body.success) return { error: body.error.flatten() }
    await db.update(accExpenses).set(body.data as any).where(eq(accExpenses.id, id))
    return { ok: true }
  })

  app.delete('/expenses/:id', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string }
    await db.delete(accExpenses).where(eq(accExpenses.id, id))
    return { ok: true }
  })

  app.get('/reports/income-statement', { onRequest: [app.authenticate] }, async (req) => {
    const user = req.user as { tenantId: string }
    const { from, to, currency } = req.query as Record<string, string>
    const where = [sql`tenant_id = ${user.tenantId}`]
    if (from) where.push(sql`issue_date >= ${from}`)
    if (to) where.push(sql`issue_date <= ${to}`)

    const data = await db.execute(sql.raw(`SELECT COALESCE(SUM(total),0) AS revenue, COALESCE(SUM(discount_total),0) AS discounts FROM acc_invoices WHERE tenant_id = '${user.tenantId}' ${from ? `AND issue_date >= '${from}'` : ''} ${to ? `AND issue_date <= '${to}'` : ''}`))
    const expenses = await db.execute(sql.raw(`SELECT COALESCE(SUM(amount),0) AS expenses FROM acc_expenses WHERE tenant_id = '${user.tenantId}' ${from ? `AND expense_date >= '${from}'` : ''} ${to ? `AND expense_date <= '${to}'` : ''}`))
    const revenue = Number(data.rows[0]?.revenue ?? 0)
    const expenseTotal = Number(expenses.rows[0]?.expenses ?? 0)
    return { revenue, expenses: expenseTotal, grossProfit: revenue - expenseTotal, netProfit: revenue - expenseTotal, breakdown: { revenue, expenses: expenseTotal } }
  })

  app.get('/reports/balance-sheet', { onRequest: [app.authenticate] }, async (req) => {
    const date = (req.query as Record<string, string>).date ?? new Date().toISOString().slice(0, 10)
    const assets = await db.execute(sql.raw(`SELECT COALESCE(SUM(balance),0) AS assets FROM acc_contacts WHERE tenant_id = '${(req.user as any).tenantId}'`))
    return { assets: { cash: Number(assets.rows[0]?.assets ?? 0), receivables: 0, inventory: 0 }, liabilities: { payables: 0, debt: 0 }, equity: Number(assets.rows[0]?.assets ?? 0) }
  })

  app.get('/reports/cash-flow', { onRequest: [app.authenticate] }, async (req) => {
    const { from, to } = req.query as Record<string, string>
    const income = await db.execute(sql.raw(`SELECT COALESCE(SUM(amount),0) AS operating FROM acc_payments WHERE tenant_id = '${(req.user as any).tenantId}' AND payment_type = 'received' ${from ? `AND payment_date >= '${from}'` : ''} ${to ? `AND payment_date <= '${to}'` : ''}`))
    const expenses = await db.execute(sql.raw(`SELECT COALESCE(SUM(amount),0) AS operating FROM acc_payments WHERE tenant_id = '${(req.user as any).tenantId}' AND payment_type = 'sent' ${from ? `AND payment_date >= '${from}'` : ''} ${to ? `AND payment_date <= '${to}'` : ''}`))
    return { operating: Number(income.rows[0]?.operating ?? 0) - Number(expenses.rows[0]?.operating ?? 0), investing: 0, financing: 0, net: Number(income.rows[0]?.operating ?? 0) - Number(expenses.rows[0]?.operating ?? 0) }
  })

  app.get('/reports/profitability', { onRequest: [app.authenticate] }, async (req) => {
    const { from, to } = req.query as Record<string, string>
    const data = await db.execute(sql.raw(`SELECT COALESCE(SUM(total),0) AS revenue FROM acc_invoices WHERE tenant_id = '${(req.user as any).tenantId}' ${from ? `AND issue_date >= '${from}'` : ''} ${to ? `AND issue_date <= '${to}'` : ''}`))
    const expense = await db.execute(sql.raw(`SELECT COALESCE(SUM(amount),0) AS expenses FROM acc_expenses WHERE tenant_id = '${(req.user as any).tenantId}' ${from ? `AND expense_date >= '${from}'` : ''} ${to ? `AND expense_date <= '${to}'` : ''}`))
    const revenue = Number(data.rows[0]?.revenue ?? 0)
    const expenses = Number(expense.rows[0]?.expenses ?? 0)
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

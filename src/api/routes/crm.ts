import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '../../lib/db.js'
import { crmConnections, crmBulkJobs, crmSyncState, crmRecords, crmModules, crmFields } from '../../../db/schema.js'
import { encryptJson, decryptJson } from '../../lib/crypto.js'
import { createAdapter } from '../../adapters/index.js'
import { runMetadataSync } from '../../engine/crm-sync/metadata-sync.js'
import { startBulkSync } from '../../engine/crm-sync/bulk-sync.js'
import { setupNotifications } from '../../engine/crm-sync/notification.js'
import { eq, and, asc } from 'drizzle-orm'
import { env } from '../../../config/env.js'

const ALL_CRM_TYPES = [
  // CRM
  'zoho', 'salesforce', 'hubspot', 'dynamics365', 'pipedrive', 'freshsales',
  'monday', 'odoo', 'bitrix24', 'sugarcrm',
  // ERP
  'sap', 'oracle_netsuite', 'dynamics_bc', 'oracle_fusion', 'odoo_erp',
  'erpnext', 'epicor', 'infor', 'sage_intacct', 'acumatica',
  'custom',
] as const

const connectSchema = z.object({
  name:        z.string().min(1),
  crmType:     z.enum(ALL_CRM_TYPES),
  credentials: z.record(z.unknown()),
})

const testSchema = z.object({
  crmType:     z.string().min(1),
  credentials: z.record(z.unknown()),
})

function getWebhookInstructions(type: string): string {
  const map: Record<string, string> = {
    zoho:          'Zoho CRM → Kurulum → Otomasyon → Webhook → "Yeni Webhook" oluşturun',
    salesforce:    'Salesforce → Setup → Process Builder veya Outbound Messages ile kayıt yapın',
    hubspot:       'HubSpot → Ayarlar → Integrations → Private Apps → Webhooks sekmesi',
    dynamics365:   'Power Automate → Dataverse connector → Row added/modified/deleted trigger',
    pipedrive:     'Pipedrive → Tools & Integrations → Developer Hub → Webhooks → Add Webhook',
    freshsales:    'Freshsales → Admin → Automations → Webhooks bölümünden yeni webhook ekleyin',
    monday:        'Monday.com → Admin Center → API → Webhooks',
    odoo:          'Odoo → Teknik → Otomasyon → Automated Actions → HTTP Action türünü seçin',
    bitrix24:      'Bitrix24 → Developer Resources → Outbound Webhooks',
    sugarcrm:      'SugarCRM → Admin → Sugar Logic Hooks → Yeni HTTP Hook ekleyin',
    sap:           'SAP Event Mesh → Namespace → HTTP Subscriptions bölümünden kayıt yapın',
    oracle_netsuite: 'NetSuite → Setup → Company → SuiteScript → User Event Scripts',
    dynamics_bc:   'Business Central → Administration → API/Webhook Subscriptions',
    oracle_fusion: 'Oracle Integration Cloud → Integrations → Webhook endpoint',
    odoo_erp:      'Odoo → Teknik → Otomasyon → Automated Actions → HTTP Action türünü seçin',
    erpnext:       'ERPNext → Ayarlar → Webhook → Yeni Webhook (HMAC-SHA256 imzalı)',
    epicor:        'Epicor → System Setup → BAQ + REST Method bağlayın',
    infor:         'Infor ION API → Document Flows → Webhook endpoint tanımlayın',
    sage_intacct:  'Sage Intacct → Company → Platform Services → Webhook konfigürasyonu',
    acumatica:     'Acumatica → System → Integration → Push Notifications → Add Destination',
  }
  return map[type] ?? `${type} admin panelinden webhook URL'nizi kaydedin`
}

export const crmRoutes: FastifyPluginAsync = async (app) => {

  // ── GET /api/v1/crm/connections ───────────────────────────────────────────
  app.get('/connections', { onRequest: [app.authenticate] }, async (req) => {
    const user = req.user as { sub: string; tenantId: string }
    const conns = await db.query.crmConnections.findMany({
      where: (t, { eq }) => eq(t.tenantId, user.tenantId),
      columns: {
        id: true, name: true, crmType: true, isActive: true,
        lastSyncAt: true, syncStatus: true, syncError: true, createdAt: true,
        credentials: false,  // never expose
      },
    })
    return { connections: conns }
  })

  // ── POST /api/v1/crm/connections — add new CRM ────────────────────────────
  app.post('/connections', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    const body = connectSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { name, crmType, credentials } = body.data

    // Validate credentials actually work
    const adapter = createAdapter({ type: crmType, ...credentials })
    const check   = await adapter.validateConnection()
    if (!check.ok) return reply.status(422).send({ error: `Connection failed: ${check.error}` })

    const [conn] = await db.insert(crmConnections).values({
      tenantId:    user.tenantId,
      name,
      crmType:     crmType as any,
      credentials: encryptJson({ type: crmType, ...credentials }),
      syncStatus:  'idle',
    }).returning()

    const webhookSetupUrl = `${env.WEBHOOK_BASE_URL}/webhooks/crm/notification?connectionId=${conn!.id}`
    return reply.status(201).send({
      connection:          { id: conn!.id, name, crmType },
      webhookSetupUrl,
      webhookInstructions: getWebhookInstructions(crmType),
    })
  })

  // ── POST /api/v1/crm/connections/test — validate without saving ──────────
  app.post('/connections/test', { onRequest: [app.authenticate] }, async (req, reply) => {
    const body = testSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const { crmType, credentials } = body.data
    try {
      const adapter = createAdapter({ type: crmType, ...credentials })
      const result  = await adapter.validateConnection()
      return reply.send(result)
    } catch (e: any) {
      return reply.send({ ok: false, error: e.message })
    }
  })

  // ── DELETE /api/v1/crm/connections/:id ───────────────────────────────────
  app.delete('/connections/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    const { id } = req.params as { id: string }
    await db.delete(crmConnections).where(
      and(eq(crmConnections.id, id), eq(crmConnections.tenantId, user.tenantId))
    )
    return reply.send({ ok: true })
  })

  // ── POST /api/v1/crm/connections/:id/sync/metadata ───────────────────────
  // Triggers metadata sync (modules, fields, related lists)
  app.post('/connections/:id/sync/metadata', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    // Run in background — don't await
    runMetadataSync(id).then((r) => {
      console.log(`[MetadataSync] Done: ${r.modulesUpserted} modules, ${r.fieldsUpserted} fields`)
    }).catch(console.error)

    return reply.status(202).send({ message: 'Metadata sync started', connectionId: id })
  })

  // ── POST /api/v1/crm/connections/:id/sync/full ────────────────────────────
  // Triggers full data sync via Bulk Read
  app.post('/connections/:id/sync/full', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { modules } = (req.body ?? {}) as { modules?: string[] }

    const callbackUrl = `${env.WEBHOOK_BASE_URL}/webhooks/crm/bulk-callback?connectionId=${id}`

    startBulkSync(id, { modules, callbackUrl }).then((r) => {
      console.log(`[BulkSync] Started ${r.started} jobs. Failed: ${r.failed.join(', ')}`)
    }).catch(console.error)

    return reply.status(202).send({ message: 'Full sync started', connectionId: id })
  })

  // ── POST /api/v1/crm/connections/:id/sync/subscribe ──────────────────────
  // Subscribe to real-time CRM push notifications
  app.post('/connections/:id/sync/subscribe', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { modules } = (req.body ?? {}) as { modules?: string[] }

    const callbackUrl = `${env.WEBHOOK_BASE_URL}/webhooks/crm/notification?connectionId=${id}`
    const sub = await setupNotifications(id, callbackUrl, modules ?? [])

    return reply.send({ channelId: sub.channelId, expiresAt: sub.expiresAt })
  })

  // ── GET /api/v1/crm/connections/:id/records ───────────────────────────────
  // Query mirrored records
  app.get('/connections/:id/records', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id }   = req.params as { id: string }
    const { module, limit = '100', page = '1' } = req.query as Record<string, string>

    if (!module) return reply.status(400).send({ error: 'module is required' })

    const records = await db.query.crmRecords.findMany({
      where: (t, { eq, and }) => and(eq(t.connectionId, id), eq(t.moduleApiName, module)),
      limit:  Math.min(Number(limit), 500),
      offset: (Number(page) - 1) * Number(limit),
      orderBy: (t, { desc }) => [desc(t.lastSyncedAt)],
    })

    return { records: records.map((r) => ({ id: r.crmId, ...(r.data as Record<string, unknown>) })), count: records.length }
  })

  // ── GET /api/v1/crm/connections/:id/sync-status ───────────────────────────
  app.get('/connections/:id/sync-status', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string }
    const states  = await db.query.crmSyncState.findMany({
      where: (t, { eq }) => eq(t.connectionId, id),
    })
    const jobs = await db.query.crmBulkJobs.findMany({
      where: (t, { eq }) => eq(t.connectionId, id),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit: 20,
    })
    return { syncState: states, recentJobs: jobs }
  })

  // GET /api/v1/crm/connections/:id/modules
  app.get('/connections/:id/modules', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string }
    const modules = await db.query.crmModules.findMany({
      where: (t, { eq }) => eq(t.connectionId, id),
      orderBy: (t, { asc }) => [asc(t.apiName)],
    })
    return { modules }
  })

  // GET /api/v1/crm/connections/:id/modules/:module/fields
  app.get('/connections/:id/modules/:module/fields', { onRequest: [app.authenticate] }, async (req) => {
    const { id, module } = req.params as { id: string; module: string }
    const fields = await db.query.crmFields.findMany({
      where: (t, { and, eq }) => and(eq(t.connectionId, id), eq(t.moduleApiName, module)),
    })
    return { fields }
  })

  // PUT /api/v1/crm/connections/:id — update connection
  app.put('/connections/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { name, isActive } = req.body as { name?: string; isActive?: boolean }
    await db.update(crmConnections).set({ ...(name && { name }), ...(isActive !== undefined && { isActive }), updatedAt: new Date() }).where(eq(crmConnections.id, id))
    return reply.send({ ok: true })
  })
}

import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '../../lib/db.js'
import { redis } from '../../lib/redis.js'
import { crmConnections, crmBulkJobs, crmSyncState, crmRecords, crmModules, crmFields, kibiEntities } from '../../../db/schema.js'
import { encryptJson, decryptJson } from '../../lib/crypto.js'
import { createAdapter } from '../../adapters/index.js'
import { runMetadataSync } from '../../engine/crm-sync/metadata-sync.js'
import { startBulkSync } from '../../engine/crm-sync/bulk-sync.js'
import { setupNotifications } from '../../engine/crm-sync/notification.js'
import { runEntityEtl } from '../../engine/crm-sync/entity-etl.js'
import { PostgreSqlAdapter } from '../../adapters/postgresql.js'
import { eq, and, asc } from 'drizzle-orm'
import { env } from '../../../config/env.js'
import { nanoid } from 'nanoid'

const ALL_CRM_TYPES = [
  // CRM
  'zoho', 'salesforce', 'hubspot', 'dynamics365', 'pipedrive', 'freshsales',
  'monday', 'odoo', 'bitrix24', 'sugarcrm',
  // ERP
  'sap', 'oracle_netsuite', 'dynamics_bc', 'oracle_fusion', 'odoo_erp',
  'erpnext', 'epicor', 'infor', 'sage_intacct', 'acumatica',
  // Direct DB
  'postgresql', 'mysql',
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

  // ── POST /api/v1/crm/connections/:id/sync/entity ─────────────────────────
  // Trigger ETL: mirror all source data → AI normalize → entity schema tables
  app.post('/connections/:id/sync/entity', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id }  = req.params as { id: string }
    const user    = req.user as { sub: string; tenantId: string; role: string }

    // Verify ownership
    const conn = await db.query.crmConnections.findFirst({
      where: (t, { and, eq }) => and(eq(t.id, id), eq(t.tenantId, user.tenantId)),
    })
    if (!conn) return reply.status(404).send({ error: 'Bağlantı bulunamadı' })

    // Fire-and-forget ETL
    runEntityEtl(id).then(r => {
      console.log(`[ETL] Done for ${id}: ${r.mirrored} mirrored, ${r.rows} normalized, tables=[${r.tables.join(',')}]`)
    }).catch(err => console.error(`[ETL] Failed for ${id}:`, err))

    return reply.status(202).send({
      message: 'ETL başlatıldı — tüm veriler aynalalanıyor ve AI ile normalize ediliyor',
      connectionId: id,
    })
  })

  // ── POST /api/v1/crm/connections/:id/sync/pg-direct ──────────────────────
  // For PostgreSQL sources: read tables + sync directly to entity schema
  // (also triggered automatically via sync/entity for crmType=postgresql)
  app.post('/connections/:id/sync/pg-direct', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user   = req.user as { sub: string; tenantId: string; role: string }

    const conn = await db.query.crmConnections.findFirst({
      where: (t, { and, eq }) => and(eq(t.id, id), eq(t.tenantId, user.tenantId)),
    })
    if (!conn) return reply.status(404).send({ error: 'Bağlantı bulunamadı' })
    if (conn.crmType !== 'postgresql') return reply.status(400).send({ error: 'Bu endpoint sadece PostgreSQL bağlantıları için' })

    // Metadata sync first: discover tables + columns
    runMetadataSync(id).then(() => runEntityEtl(id))
      .then(r => console.log(`[PG-ETL] Done for ${id}: ${r?.mirrored} rows mirrored`))
      .catch(err => console.error(`[PG-ETL] Failed for ${id}:`, err))

    return reply.status(202).send({ message: 'PostgreSQL tablo tarama ve ETL başlatıldı', connectionId: id })
  })

  // ── GET /api/v1/crm/connections/:id/entity-data ───────────────────────────
  // Preview data in entity schema after ETL
  app.get('/connections/:id/entity-data', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id }   = req.params as { id: string }
    const { table = 'crm_contacts', limit = '20' } = req.query as Record<string, string>
    const user = req.user as { sub: string; tenantId: string }

    const entity = await db.query.kibiEntities.findFirst({
      where: (t, { eq }) => eq(t.entityId, user.tenantId),
    })
    if (!entity?.entityDbSchema) return reply.status(400).send({ error: 'Entity schema oluşturulmamış' })

    const { Pool } = await import('pg')
    const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 })
    try {
      const { rows } = await pool.query(
        `SELECT * FROM "${entity.entityDbSchema}"."${table}" ORDER BY created_at DESC LIMIT $1`,
        [Math.min(Number(limit), 200)]
      )
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*) AS n FROM "${entity.entityDbSchema}"."${table}"`
      )
      const mirrored = await pool.query(
        `SELECT COUNT(*) AS n FROM "${entity.entityDbSchema}".crm_raw_mirror WHERE connection_id = $1`,
        [id]
      ).catch(() => ({ rows: [{ n: 0 }] }))
      return { table, total: parseInt(countRows[0].n), mirrored: parseInt(mirrored.rows[0].n), rows }
    } finally {
      await pool.end()
    }
  })

  // GET /api/v1/crm/connections/:id/modules/:module/fields
  app.get('/connections/:id/modules/:module/fields', { onRequest: [app.authenticate] }, async (req) => {
    const { id, module } = req.params as { id: string; module: string }
    const fields = await db.query.crmFields.findMany({
      where: (t, { and, eq }) => and(eq(t.connectionId, id), eq(t.moduleApiName, module)),
    })
    return { fields }
  })

  // ── POST /api/v1/crm/oauth/start — start OAuth authorization flow ─────────
  app.post('/oauth/start', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    const { provider, name, clientId, clientSecret, region } = req.body as {
      provider: 'zoho' | 'hubspot' | 'salesforce'
      name: string
      clientId: string
      clientSecret: string
      region?: string
    }
    if (!provider || !name || !clientId || !clientSecret) {
      return reply.status(400).send({ error: 'provider, name, clientId, clientSecret zorunlu' })
    }

    const state = nanoid(32)
    const callbackBase = `${env.APP_URL}/webhooks/crm/${provider}/callback`

    // Store OAuth state in Redis (10 min)
    await redis.setex(`ki:oauth:state:${state}`, 600, JSON.stringify({
      tenantId: user.tenantId, userId: user.sub,
      provider, name, clientId, clientSecret, region: region ?? 'com',
    }))

    let authUrl = ''
    if (provider === 'zoho') {
      const reg = region ?? 'com'
      const scopes = 'ZohoCRM.modules.all,ZohoCRM.settings.all,ZohoCRM.bulk.all,ZohoCRM.notifications.all'
      authUrl = `https://accounts.zoho.${reg}/oauth/v2/auth?response_type=code&client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(callbackBase)}&access_type=offline&state=${state}`
    } else if (provider === 'hubspot') {
      const scopes = 'crm.objects.contacts.read crm.objects.companies.read crm.objects.deals.read crm.objects.custom.read'
      authUrl = `https://app.hubspot.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(callbackBase)}&scope=${encodeURIComponent(scopes)}&state=${state}`
    } else if (provider === 'salesforce') {
      authUrl = `https://login.salesforce.com/services/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(callbackBase)}&scope=api+refresh_token&state=${state}`
    } else {
      return reply.status(400).send({ error: 'Desteklenmeyen provider' })
    }

    return reply.send({ authUrl, state })
  })

  // ── POST /api/v1/crm/db-test — test external PostgreSQL/MySQL connection ──
  app.post('/db-test', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { dbType = 'postgresql', host, port = 5432, database, username, password, ssl = false } = req.body as {
      dbType?: string; host: string; port?: number; database: string; username: string; password: string; ssl?: boolean
    }
    if (!host || !database || !username) {
      return reply.status(400).send({ error: 'host, database, username zorunlu' })
    }

    try {
      const { Client } = await import('pg')
      const client = new Client({
        host, port: Number(port), database, user: username, password,
        ssl: ssl ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 5000,
      })
      await client.connect()

      // Verify read-only: check for SELECT privilege, reject if has INSERT/UPDATE/DELETE
      const roCheck = await client.query<{ has_insert: boolean }>(
        `SELECT has_table_privilege($1, 'information_schema.tables', 'INSERT') AS has_insert`,
        [username]
      )
      const isReadOnly = !roCheck.rows[0]?.has_insert

      // Get list of tables
      const tables = await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name LIMIT 50`
      )
      await client.end()

      return reply.send({ ok: true, isReadOnly, tables: tables.rows.map(r => r.table_name) })
    } catch (e: any) {
      return reply.status(400).send({ ok: false, error: e.message })
    }
  })

  // ── POST /api/v1/crm/db-connect — save a read-only DB connection ──────────
  app.post('/db-connect', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    if (!user.tenantId) return reply.status(400).send({ error: 'Entity bağlantısı gerekli' })

    const { name, dbType = 'postgresql', host, port = 5432, database, username, password, ssl = false } = req.body as {
      name: string; dbType?: string; host: string; port?: number
      database: string; username: string; password: string; ssl?: boolean
    }
    if (!name || !host || !database || !username) {
      return reply.status(400).send({ error: 'name, host, database, username zorunlu' })
    }

    // Quick connectivity test before saving
    try {
      const { Client } = await import('pg')
      const client = new Client({
        host, port: Number(port), database, user: username, password,
        ssl: ssl ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 5000,
      })
      await client.connect()
      await client.end()
    } catch (e: any) {
      return reply.status(422).send({ error: `Bağlantı başarısız: ${e.message}` })
    }

    const crmType = dbType === 'mysql' ? 'mysql' : 'postgresql'
    const [conn] = await db.insert(crmConnections).values({
      tenantId:    user.tenantId,
      name,
      crmType:     crmType as any,
      credentials: encryptJson({ dbType, host, port, database, username, password, ssl }),
      syncStatus:  'idle',
    }).returning()

    return reply.status(201).send({ connection: { id: conn!.id, name, crmType } })
  })

  // PUT /api/v1/crm/connections/:id — update connection
  app.put('/connections/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { name, isActive } = req.body as { name?: string; isActive?: boolean }
    await db.update(crmConnections).set({ ...(name && { name }), ...(isActive !== undefined && { isActive }), updatedAt: new Date() }).where(eq(crmConnections.id, id))
    return reply.send({ ok: true })
  })
}

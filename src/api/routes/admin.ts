import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '../../lib/db.js'
import { sql, eq, and, desc, asc } from 'drizzle-orm'
import { tenants, kibiEntities, kibiTokenUsage, kibiSupportTickets, kibiModelConfigs, kibiInternalUsers, users, platformMetrics, crmConnections, platformConfigs } from '../../../db/schema.js'
import { learnFromTicket } from '../../engine/kibi/support-pipeline.js'
import { encrypt, decrypt } from '../../lib/crypto.js'
import { invalidateModelCache, seedDefaultModelConfigs } from '../../engine/ai/model-config.js'

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    await app.authenticate(req, reply)
    const role = (req.user as any)?.role
    if (role !== 'admin' && role !== 'supervisor') return reply.status(403).send({ error: 'Forbidden' })
  })

  app.get('/metrics', async () => {
    const latest = await db.query.platformMetrics.findFirst({ orderBy: (t, { desc }) => [desc(t.metricDate)] })
    const topEntities = await db.execute(sql.raw(`SELECT e.client_id, t.name AS tenant_name, SUM(u.total_tokens) AS tokens, SUM(u.cost_usd) AS cost FROM kibi_token_usage u JOIN kibi_entities e ON u.entity_id = e.id JOIN tenants t ON e.entity_id = t.id GROUP BY e.client_id, t.name ORDER BY tokens DESC LIMIT 10`))
    const openTickets = await db.execute(sql.raw(`SELECT COUNT(*) AS count FROM kibi_support_tickets WHERE status = 'open'`))
    const crmCount = await db.execute(sql.raw(`SELECT COUNT(*) AS count FROM crm_connections`))
    const crmTypeDistribution = await db.execute(sql.raw(`SELECT crm_type, COUNT(*) AS count FROM crm_connections GROUP BY crm_type ORDER BY count DESC`))
    const paidEntities = await db.execute(sql.raw(`SELECT COUNT(*) AS count FROM tenants WHERE COALESCE(settings->>'plan','free') <> 'free'`))
    const freeEntities = await db.execute(sql.raw(`SELECT COUNT(*) AS count FROM tenants WHERE COALESCE(settings->>'plan','free') = 'free'`))

    return {
      metrics: latest,
      topTokenUsers: topEntities.rows,
      openTickets: Number((openTickets.rows[0] as any)?.count ?? 0),
      crmConnections: Number((crmCount.rows[0] as any)?.count ?? 0),
      crmTypeDistribution: crmTypeDistribution.rows,
      paidEntities: Number(paidEntities.rows[0]?.count ?? 0),
      freeEntities: Number(freeEntities.rows[0]?.count ?? 0),
    }
  })

  app.get('/entities', async (req) => {
    const { page = '1', limit = '20', search, plan } = req.query as Record<string, string>
    const filters: string[] = []
    if (search) {
      filters.push(`(e.company_name ILIKE '%${search}%' OR e.client_id ILIKE '%${search}%' OR u.email ILIKE '%${search}%')`)
    }
    if (plan) {
      filters.push(`t.settings->>'plan' = '${plan}'`)
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    const offset = (Number(page) - 1) * Number(limit)
    const rows = await db.execute(sql.raw(`SELECT e.*, t.name AS tenant_name, u.email AS owner_email FROM kibi_entities e JOIN tenants t ON e.entity_id = t.id LEFT JOIN tenant_memberships m ON m.tenant_id = t.id LEFT JOIN users u ON u.id = m.user_id ${where} ORDER BY e.created_at DESC LIMIT ${Number(limit)} OFFSET ${offset}`))
    return { entities: rows.rows }
  })

  app.get('/entities/:entityId', async (req) => {
    const { entityId } = req.params as { entityId: string }
    const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.id, entityId) })
    if (!entity) return { entity: null }

    const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, entity.entityId) })
    const connections = await db.query.crmConnections.findMany({ where: (t, { eq }) => eq(t.tenantId, entity.entityId) })
    const tokenUsage = await db.execute(sql.raw(`SELECT date_trunc('day', used_at) AS day, SUM(total_tokens) AS tokens FROM kibi_token_usage WHERE entity_id = '${entityId}' AND used_at >= now() - interval '30 days' GROUP BY day ORDER BY day`))
    const tickets = await db.query.kibiSupportTickets.findMany({ where: (t, { eq }) => eq(t.entityId, entityId), orderBy: (t, { desc }) => [desc(t.openedAt)], limit: 5 })
    const modelConfig = await db.query.kibiModelConfigs.findMany({ where: (t, { and, eq }) => and(eq(t.scope, 'entity'), eq(t.scopeId, entityId)) })

    return { entity, tenant, connections, tokenUsage: tokenUsage.rows, tickets, modelConfig }
  })

  app.post('/entities/:entityId/access', async (req) => {
    const { entityId } = req.params as { entityId: string }
    const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.id, entityId) })
    if (!entity) return { error: 'Not found' }
    return { ok: true, message: 'Admin access granted for entity data' }
  })

  app.get('/token-usage', async (req) => {
    const { entityId, from, to, groupBy = 'entity' } = req.query as Record<string, string>
    const conditions: string[] = []
    if (entityId) conditions.push(`entity_id = '${entityId}'`)
    if (from) conditions.push(`used_at >= '${from}'`)
    if (to) conditions.push(`used_at <= '${to}'`)
    const conditionSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const groupField = groupBy === 'model' ? 'model_name' : groupBy === 'role' ? 'model_role' : 'entity_id'
    const rows = await db.execute(sql.raw(`SELECT ${groupField} AS group_key, SUM(total_tokens) AS total_tokens, SUM(cost_usd) AS total_cost FROM kibi_token_usage ${conditionSql} GROUP BY ${groupField} ORDER BY total_tokens DESC`))
    return { usage: rows.rows }
  })

  app.get('/support/tickets', async (req) => {
    const { status, priority, entityId } = req.query as Record<string, string>
    const conditions: string[] = []
    if (status) conditions.push(`status = '${status}'`)
    if (priority) conditions.push(`priority = '${priority}'`)
    if (entityId) conditions.push(`entity_id = '${entityId}'`)
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = await db.execute(sql.raw(`SELECT * FROM kibi_support_tickets ${where} ORDER BY opened_at DESC LIMIT 200`))
    return { tickets: rows.rows }
  })

  app.put('/support/tickets/:id/assign', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { internalUserId } = req.body as { internalUserId: string }
    await db.update(kibiSupportTickets).set({ escalatedTo: internalUserId, status: 'escalated' }).where(eq(kibiSupportTickets.id, id))
    return reply.send({ ok: true })
  })

  app.post('/support/tickets/:id/learn', async (req, reply) => {
    const { id } = req.params as { id: string }
    await learnFromTicket(id)
    return reply.send({ ok: true })
  })

  app.get('/models', async () => {
    const configs = await db.query.kibiModelConfigs.findMany({ where: (t, { eq }) => eq(t.scope, 'platform') })
    return { models: configs }
  })

  app.put('/models/:role', async (req, reply) => {
    const { role } = req.params as { role: string }
    const { primaryModel, fallback1, fallback2, fallback3, provider, apiKey, temperature, maxTokens, isActive } = req.body as any
    const patch = {
      primaryModel: primaryModel ?? '',
      fallback1:    fallback1    ?? null,
      fallback2:    fallback2    ?? null,
      fallback3:    fallback3    ?? null,
      provider:     provider     ?? 'openrouter',
      apiKey:       apiKey       ?? null,
      temperature:  temperature  !== undefined ? String(temperature) : '0.4',
      maxTokens:    maxTokens    ?? 1500,
      isActive:     isActive     ?? true,
      updatedAt:    new Date(),
    }
    const existing = await db.query.kibiModelConfigs.findFirst({
      where: (t, { and, eq }) => and(eq(t.scope, 'platform'), eq(t.modelRole, role as any)),
    })
    if (existing) {
      await db.update(kibiModelConfigs).set(patch)
        .where(and(eq(kibiModelConfigs.scope, 'platform'), eq(kibiModelConfigs.modelRole, role as any)))
    } else {
      await db.insert(kibiModelConfigs).values({ scope: 'platform', modelRole: role as any, ...patch })
    }
    invalidateModelCache(role)
    return reply.send({ ok: true })
  })

  app.post('/models/seed', async (_req, reply) => {
    const count = await seedDefaultModelConfigs()
    return reply.send({ ok: true, seeded: count })
  })

  // ── Platform Settings ─────────────────────────────────────────────────────
  // GET /admin/platform-settings  — admin + supervisor (values redacted for secrets)
  app.get('/platform-settings', async (req) => {
    const role = (req.user as any)?.role
    const rows = await db.select().from(platformConfigs).orderBy(asc(platformConfigs.category), asc(platformConfigs.key))
    return {
      configs: rows.map(r => ({
        key:       r.key,
        label:     r.label,
        category:  r.category,
        isSecret:  r.isSecret,
        isSet:     r.value !== '',
        // Supervisors and admins both see masked values; only admin can decrypt via PUT
        value:     (role === 'admin' && r.value && !r.isSecret) ? (() => { try { return decrypt(r.value) } catch { return '' } })() : '',
        updatedAt: r.updatedAt,
      })),
    }
  })

  // PUT /admin/platform-settings/:key  — admin only
  app.put('/platform-settings/:key', async (req, reply) => {
    const role = (req.user as any)?.role
    if (role !== 'admin') return reply.status(403).send({ error: 'Sadece admin düzenleyebilir' })

    const { key } = req.params as { key: string }
    const body = z.object({
      value:    z.string(),
      label:    z.string().min(1),
      category: z.string().min(1),
      isSecret: z.boolean().default(true),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { value, label, category, isSecret } = body.data
    const stored = value ? encrypt(value) : ''
    await db.insert(platformConfigs)
      .values({ key, value: stored, label, category, isSecret, updatedAt: new Date() })
      .onConflictDoUpdate({ target: platformConfigs.key, set: { value: stored, label, category, isSecret, updatedAt: new Date() } })
    return { ok: true }
  })

  // DELETE /admin/platform-settings/:key  — admin only
  app.delete('/platform-settings/:key', async (req, reply) => {
    if ((req.user as any)?.role !== 'admin') return reply.status(403).send({ error: 'Sadece admin silebilir' })
    const { key } = req.params as { key: string }
    await db.delete(platformConfigs).where(eq(platformConfigs.key, key))
    return { ok: true }
  })

  // ── Platform Connection Manager ─────────────────────────────────────────────
  // GET /admin/platform-connections/:category  — admin only, returns decrypted JSON array
  app.get('/platform-connections/:category', async (req, reply) => {
    if ((req.user as any)?.role !== 'admin') return reply.status(403).send({ error: 'Sadece admin görüntüleyebilir' })
    const { category } = req.params as { category: string }
    const rows = await db.select().from(platformConfigs).where(eq(platformConfigs.key, `platform_connections_${category}`))
    if (!rows.length || !rows[0].value) return reply.send({ connections: [] })
    try {
      return reply.send({ connections: JSON.parse(decrypt(rows[0].value)) })
    } catch {
      return reply.send({ connections: [] })
    }
  })

  // PUT /admin/platform-connections/:category  — admin only, replaces full array
  app.put('/platform-connections/:category', async (req, reply) => {
    if ((req.user as any)?.role !== 'admin') return reply.status(403).send({ error: 'Sadece admin düzenleyebilir' })
    const { category } = req.params as { category: string }
    const { connections } = req.body as { connections: unknown[] }
    const key = `platform_connections_${category}`
    const stored = encrypt(JSON.stringify(connections))
    await db.insert(platformConfigs)
      .values({ key, value: stored, label: `${category} Connections`, category, isSecret: true, updatedAt: new Date() })
      .onConflictDoUpdate({ target: platformConfigs.key, set: { value: stored, updatedAt: new Date() } })
    return reply.send({ ok: true })
  })

  // GET /admin/platform-comms/:channel  — admin only
  app.get('/platform-comms/:channel', async (req, reply) => {
    if ((req.user as any)?.role !== 'admin') return reply.status(403).send({ error: 'Sadece admin görüntüleyebilir' })
    const { channel } = req.params as { channel: string }
    const rows = await db.select().from(platformConfigs).where(eq(platformConfigs.key, `platform_comms_${channel}`))
    if (!rows.length || !rows[0].value) return reply.send({ config: null, isSet: false })
    try {
      return reply.send({ config: JSON.parse(decrypt(rows[0].value)), isSet: true })
    } catch {
      return reply.send({ config: null, isSet: false })
    }
  })

  // PUT /admin/platform-comms/:channel  — admin only
  app.put('/platform-comms/:channel', async (req, reply) => {
    if ((req.user as any)?.role !== 'admin') return reply.status(403).send({ error: 'Sadece admin düzenleyebilir' })
    const { channel } = req.params as { channel: string }
    const config = req.body as Record<string, string>
    const key = `platform_comms_${channel}`
    const stored = encrypt(JSON.stringify(config))
    await db.insert(platformConfigs)
      .values({ key, value: stored, label: `${channel} Config`, category: 'comms', isSecret: true, updatedAt: new Date() })
      .onConflictDoUpdate({ target: platformConfigs.key, set: { value: stored, updatedAt: new Date() } })
    return reply.send({ ok: true })
  })

  // DELETE /admin/platform-comms/:channel  — admin only
  app.delete('/platform-comms/:channel', async (req, reply) => {
    if ((req.user as any)?.role !== 'admin') return reply.status(403).send({ error: 'Sadece admin silebilir' })
    const { channel } = req.params as { channel: string }
    await db.delete(platformConfigs).where(eq(platformConfigs.key, `platform_comms_${channel}`))
    return reply.send({ ok: true })
  })

  app.post('/seed', async (req, reply) => {
    const adminExists = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.role, 'admin') })
    if (adminExists) return reply.status(400).send({ error: 'Admin already exists' })

    const { email, name, phone } = req.body as { email: string; name: string; phone: string }
    const password = 'Admin123!' // temporary default; set via recovery flow after first login
    const hash = await import('argon2').then((m) => m.hash(password, { type: m.argon2id }))
    const [user] = await db.insert(users).values({ email, name, phone, passwordHash: hash, role: 'admin' }).returning()
    if (!user) return reply.status(500).send({ error: 'Unable to create admin' })
    await db.insert(kibiInternalUsers).values({ userId: user.id, internalRole: 'admin', isActive: true })
    return reply.send({ ok: true, email, password })
  })
}

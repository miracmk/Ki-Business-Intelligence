import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '../../lib/db.js'
import { sql, eq, and, desc, asc } from 'drizzle-orm'
import { tenants, kibiEntities, kibiTokenUsage, kibiSupportTickets, kibiSupportMessages, kibiModelConfigs, kibiInternalUsers, users, platformMetrics, crmConnections, platformConfigs, platformVectorDocs, aiPipelineLogs, kibiWallets, kbDocuments, kbChunks, kibiPricingPackages } from '../../../db/schema.js'
import { learnFromTicket } from '../../engine/kibi/support-pipeline.js'
import { searchKnowledge } from '../../engine/kibi/qdrant-search.js'
import { routeReplyToExternal } from '../../engine/kibi/ticket-router.js'
import { encrypt, decrypt } from '../../lib/crypto.js'
import { invalidateModelCache, seedDefaultModelConfigs } from '../../engine/ai/model-config.js'
import { PROVIDERS, getConfigKey, pingProviderModel } from '../../engine/ai/providers.js'
import { invalidateProviderKeyCache, aiComplete, CONVERSATION_MODELS } from '../../engine/ai/gateway.js'
import { redis } from '../../lib/redis.js'
import { qdrant, embedConfigured, invalidateEmbeddingModelCache, vectorSearch } from '../../lib/qdrant.js'
import { env } from '../../../config/env.js'
import { KIBI_AI_KB_COLLECTION, indexDocument, deleteDocumentFromIndex } from '../../engine/knowledge/indexer.js'
import { detectFileType, extractText } from '../../engine/knowledge/file-extractor.js'
import { normalizedFileName } from '../../engine/knowledge/chunking.js'
import { createWriteStream, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

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
    const rows = await db.execute(sql.raw(`SELECT e.*, t.name AS tenant_name, t.is_active AS tenant_is_active, u.email AS owner_email, u.phone AS owner_phone, w.balance_usd, w.balance_ki_coin FROM kibi_entities e JOIN tenants t ON e.entity_id = t.id LEFT JOIN tenant_memberships m ON m.tenant_id = t.id AND m.role = 'entity_main' LEFT JOIN users u ON u.id = m.user_id LEFT JOIN kibi_wallets w ON w.entity_id = e.id ${where} ORDER BY e.created_at DESC LIMIT ${Number(limit)} OFFSET ${offset}`))
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
    const q = req.query as Record<string, string>
    const page     = Math.max(1, Number(q.page) || 1)
    const limit    = Math.min(100, Number(q.limit) || 50)
    const offset   = (page - 1) * limit

    const tickets = await db.query.kibiSupportTickets.findMany({
      where: (t, { and, eq }) => {
        const conds: any[] = []
        if (q.status)   conds.push(eq(t.status,   q.status as any))
        if (q.priority) conds.push(eq(t.priority, q.priority as any))
        if (q.entityId) conds.push(eq(t.entityId, q.entityId))
        return conds.length ? and(...conds) : undefined
      },
      orderBy: (t, { desc }) => [desc(t.openedAt)],
      limit,
      offset,
    })

    // Enrich with entity name
    const entityIds = [...new Set(tickets.map(t => t.entityId))]
    const entities = entityIds.length
      ? await db.query.kibiEntities.findMany({ where: (t, { inArray }) => inArray(t.id, entityIds) })
      : []
    const entityMap = Object.fromEntries(entities.map(e => [e.id, e.companyName]))

    return {
      tickets: tickets.map(t => ({ ...t, entityName: entityMap[t.entityId] ?? '-' })),
      page, limit,
    }
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

  // PUT /admin/entities/:entityId/plan — change plan for an entity
  app.put('/entities/:entityId/plan', async (req, reply) => {
    const { entityId } = req.params as { entityId: string }
    const { planName } = req.body as { planName: string }

    const validPlans = ['free', 'basic', 'premium', 'enterprise', 'custom_models']
    if (!validPlans.includes(planName)) {
      return reply.status(400).send({ error: 'Geçersiz plan. Geçerli değerler: free, basic, premium, enterprise, custom_models' })
    }

    const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.id, entityId) })
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı' })

    await db.update(kibiEntities)
      .set({ planName: planName as any, updatedAt: new Date() })
      .where(eq(kibiEntities.id, entityId))

    return reply.send({ ok: true, entityId, planName })
  })

  // PUT /admin/entities/:entityId/status — toggle entity active/passive
  app.put('/entities/:entityId/status', async (req, reply) => {
    const { entityId } = req.params as { entityId: string }
    const { isActive } = req.body as { isActive: boolean }

    const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.id, entityId) })
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı' })

    await db.update(tenants)
      .set({ isActive: Boolean(isActive) })
      .where(eq(tenants.id, entity.entityId))

    return reply.send({ ok: true, entityId, isActive })
  })

  // POST /admin/support/tickets/:id/ai-draft — KIBI AI platform-level draft (no entity tenantId required)
  app.post('/support/tickets/:id/ai-draft', async (req, reply) => {
    const { id } = req.params as { id: string }

    const ticket = await db.query.kibiSupportTickets.findFirst({
      where: (t, { eq }) => eq(t.id, id),
    })
    if (!ticket) return reply.status(404).send({ error: 'Ticket bulunamadı' })

    const [messages, entity] = await Promise.all([
      db.query.kibiSupportMessages.findMany({
        where: (t, { eq }) => eq(t.ticketId, id),
        orderBy: (t, { asc }) => [asc(t.createdAt)],
        limit: 20,
      }),
      db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.id, ticket.entityId) }),
    ])

    const history = messages
      .map(m => `${m.senderType === 'customer' ? 'Müşteri' : 'Destek'}: ${m.content ?? ''}`)
      .join('\n')

    const kb = await searchKnowledge({
      query: `${ticket.subject ?? ''} ${(ticket as any).resolutionSummary ?? ''}`.trim() || ticket.subject || '',
      collection: 'ki_support_kb',
      limit: 3,
    }).catch(() => ({ results: [], summary: 'KB araması başarısız.' }))

    const kbBlock = kb.results.length
      ? `\n\nBenzer geçmiş çözümler (KB):\n${kb.results.map((r, i) => `[${i + 1}] ${r.content}`).join('\n')}`
      : ''

    const prompt = `Sen KIBI platformunun destek yöneticisisin. Aşağıdaki destek ticket'ı için profesyonel, nazik ve çözüm odaklı bir Türkçe yanıt taslağı hazırla.

Entity: ${entity?.companyName ?? 'Bilinmiyor'}
Ticket Konusu: ${ticket.subject}
Kategori: ${(ticket as any).categoryL1 ?? 'Genel'}

Sohbet Geçmişi:
${history || '(Henüz mesaj yok)'}${kbBlock}

Eğer KB'deki çözümlerden biri uygunsa referans al, ama sadece yanıt metnini yaz, başka açıklama ekleme.`

    try {
      const result = await aiComplete(CONVERSATION_MODELS[0], [{ role: 'user', content: prompt }])
      return reply.send({ draft: result.content, kbReferences: kb.results })
    } catch (e: any) {
      return reply.status(500).send({ error: 'AI taslak oluşturulamadı: ' + e.message })
    }
  })

  // GET /admin/support/tickets/:id/messages — cross-entity message thread
  app.get('/support/tickets/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string }
    const ticket = await db.query.kibiSupportTickets.findFirst({ where: (t, { eq }) => eq(t.id, id) })
    if (!ticket) return reply.status(404).send({ error: 'Ticket bulunamadı' })
    const messages = await db.query.kibiSupportMessages.findMany({
      where: (t, { eq }) => eq(t.ticketId, id),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    })
    return reply.send({ messages })
  })

  // POST /admin/support/tickets/:id/messages — admin/supervisor send reply, cross-entity
  app.post('/support/tickets/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string }
    const ticket = await db.query.kibiSupportTickets.findFirst({ where: (t, { eq }) => eq(t.id, id) })
    if (!ticket) return reply.status(404).send({ error: 'Ticket bulunamadı' })

    const { content, senderType = 'agent' } = req.body as { content?: string; senderType?: string }
    if (!content) return reply.status(400).send({ error: 'content gerekli' })

    const [msg] = await db.insert(kibiSupportMessages).values({
      ticketId: id,
      senderType: senderType as any,
      content,
      channel: 'web',
    }).returning()

    const ticketPatch: Record<string, any> = {}
    if (senderType === 'agent') {
      if (ticket.status === 'open' || ticket.status === 'kibi_processing' || ticket.status === 'escalated') {
        ticketPatch.status = 'in_progress'
      }
      if (!ticket.firstResponseAt) ticketPatch.firstResponseAt = new Date()
    }
    if (Object.keys(ticketPatch).length > 0) {
      await db.update(kibiSupportTickets).set(ticketPatch).where(eq(kibiSupportTickets.id, id))
    }

    let delivery: { delivered: boolean; channel?: string; reason?: string } = { delivered: false, reason: 'not_external' }
    if (senderType === 'agent' && (ticket as any).externalContactId) {
      delivery = await routeReplyToExternal(id, content).catch((e) => {
        console.error('[Admin] outbound route failed:', e)
        return { delivered: false, reason: 'send_error' }
      })
    }

    return reply.status(201).send({ message: msg, delivery })
  })

  // GET /admin/support/tickets/:id/customer — entity profile + contact info for popup
  app.get('/support/tickets/:id/customer', async (req, reply) => {
    const { id } = req.params as { id: string }
    const ticket = await db.query.kibiSupportTickets.findFirst({ where: (t, { eq }) => eq(t.id, id) })
    if (!ticket) return reply.status(404).send({ error: 'Ticket bulunamadı' })

    const [entity, contactUser] = await Promise.all([
      db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.id, ticket.entityId) }),
      ticket.userId ? db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, ticket.userId as string) }) : null,
    ])

    return reply.send({
      entity: entity ? {
        companyName: entity.companyName,
        industry: entity.industry,
        sector: entity.sector,
        country: entity.country,
        website: entity.website,
        employeeCount: entity.employeeCount,
        companySize: entity.companySize,
        planName: entity.planName,
        mood: entity.mood,
        opportunityScore: entity.opportunityScore,
        lastContactAt: entity.lastContactAt,
        lastContactChannel: entity.lastContactChannel,
        taxNumber: entity.taxNumber,
        taxOffice: entity.taxOffice,
        addressLine1: entity.addressLine1,
        city: entity.city,
        state: entity.state,
        postalCode: entity.postalCode,
      } : null,
      contactUser: contactUser ? { email: contactUser.email, phone: contactUser.phone, name: contactUser.name } : null,
      contactChannel: ticket.contactChannel,
      externalContactId: ticket.externalContactId,
    })
  })

  // GET /admin/plans — plan definitions from DB (kibi_pricing_packages)
  app.get('/plans', async (_req, reply) => {
    const packages = await db.query.kibiPricingPackages.findMany({
      where: (t, { eq }) => eq(t.isActive, true),
      orderBy: (t, { asc }) => [asc(t.sortOrder)],
    })
    return reply.send({ plans: packages })
  })

  // PUT /admin/plans/:id — edit a pricing package (admin-only; the whole-plugin preHandler
  // above already requires admin/supervisor, this narrows write access further since
  // pricing changes affect every entity's billing).
  const planUpdateSchema = z.object({
    displayName:            z.string().min(1).optional(),
    basePriceUsd:           z.string().optional(),
    perMessagePriceUsd:     z.string().optional(),
    overageMessagePriceUsd: z.string().optional(),
    monthlyMessageLimit:    z.number().int().nullable().optional(),
    extraSubUserPriceUsd:   z.string().optional(),
    isActive:               z.boolean().optional(),
  })
  app.put('/plans/:id', async (req, reply) => {
    if ((req.user as any)?.role !== 'admin') return reply.status(403).send({ error: 'Sadece admin fiyatlandırma düzenleyebilir' })
    const { id } = req.params as { id: string }
    const body = planUpdateSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const [row] = await db.update(kibiPricingPackages)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(kibiPricingPackages.id, id))
      .returning()
    if (!row) return reply.status(404).send({ error: 'Plan bulunamadı' })
    return reply.send({ plan: row })
  })

  // ── AI Provider Management ────────────────────────────────────────────────────
  // Scope URL param → DB key scope (for platform_configs keys) + model scope (for kibi_model_configs)

  const SCOPE_MAP: Record<string, { keyScope: string; modelScope: string }> = {
    'kibi':                 { keyScope: 'kibi',                 modelScope: 'platform'               },
    'entity-free':          { keyScope: 'entity_free',          modelScope: 'entity_free'            },
    'entity-basic':         { keyScope: 'entity_basic',         modelScope: 'entity_basic'           },
    'entity-premium':       { keyScope: 'entity_premium',       modelScope: 'entity_premium'         },
    'entity-enterprise':    { keyScope: 'entity_enterprise',    modelScope: 'entity_enterprise'      },
    'entity-custom-models': { keyScope: 'entity_custom_models', modelScope: 'entity_custom_models'   },
  }

  function urlScopeToDb(s: string): string | null {
    return SCOPE_MAP[s]?.keyScope ?? null
  }

  function urlScopeToModelScope(s: string): string | null {
    return SCOPE_MAP[s]?.modelScope ?? null
  }

  // GET /admin/ai-providers/:scope — list all providers + isConfigured
  app.get('/ai-providers/:scope', async (req, reply) => {
    const { scope } = req.params as { scope: string }
    const dbScope = urlScopeToDb(scope)
    if (!dbScope) return reply.status(400).send({ error: 'Geçersiz scope' })

    // Load all configured keys for this scope
    const allRows = await db.select().from(platformConfigs)
    const configuredSet = new Set(
      allRows
        .filter(r => r.key.startsWith(`ai_provider_${dbScope}_`) && r.value !== '')
        .map(r => r.key.replace(`ai_provider_${dbScope}_`, ''))
    )

    const providers = PROVIDERS.map(p => ({
      id:          p.id,
      name:        p.name,
      docsUrl:     p.docsUrl,
      freeModels:  p.freeModels,
      isConfigured: configuredSet.has(p.id),
    }))

    return reply.send({ providers })
  })

  // PUT /admin/ai-providers/:scope/:providerId — save API key
  app.put('/ai-providers/:scope/:providerId', async (req, reply) => {
    if ((req.user as any)?.role !== 'admin') return reply.status(403).send({ error: 'Sadece admin düzenleyebilir' })
    const { scope, providerId } = req.params as { scope: string; providerId: string }
    const dbScope = urlScopeToDb(scope)
    if (!dbScope) return reply.status(400).send({ error: 'Geçersiz scope' })

    const { apiKey } = req.body as { apiKey: string }
    if (!apiKey?.trim()) return reply.status(400).send({ error: 'API key boş olamaz' })

    const configKey = getConfigKey(providerId, dbScope)
    const stored    = encrypt(apiKey.trim())
    const label     = `${PROVIDERS.find(p => p.id === providerId)?.name ?? providerId} (${dbScope})`

    await db.insert(platformConfigs)
      .values({ key: configKey, value: stored, label, category: 'ai', isSecret: true, updatedAt: new Date() })
      .onConflictDoUpdate({ target: platformConfigs.key, set: { value: stored, updatedAt: new Date() } })

    invalidateProviderKeyCache(configKey)
    return reply.send({ ok: true })
  })

  // DELETE /admin/ai-providers/:scope/:providerId — remove key
  app.delete('/ai-providers/:scope/:providerId', async (req, reply) => {
    if ((req.user as any)?.role !== 'admin') return reply.status(403).send({ error: 'Sadece admin silebilir' })
    const { scope, providerId } = req.params as { scope: string; providerId: string }
    const dbScope = urlScopeToDb(scope)
    if (!dbScope) return reply.status(400).send({ error: 'Geçersiz scope' })

    const configKey = getConfigKey(providerId, dbScope)
    await db.delete(platformConfigs).where(eq(platformConfigs.key, configKey))
    invalidateProviderKeyCache(configKey)
    return reply.send({ ok: true })
  })

  // GET /admin/ai-providers/:scope/models — fetch model lists (Redis 30min cache)
  app.get('/ai-providers/:scope/models', async (req, reply) => {
    const { scope } = req.params as { scope: string }
    const dbScope = urlScopeToDb(scope)
    if (!dbScope) return reply.status(400).send({ error: 'Geçersiz scope' })

    const allRows = await db.select().from(platformConfigs)
    const configuredProviders = allRows
      .filter(r => r.key.startsWith(`ai_provider_${dbScope}_`) && r.value !== '')
      .map(r => ({ id: r.key.replace(`ai_provider_${dbScope}_`, ''), encryptedKey: r.value }))

    // Also check legacy openrouter_api_key for kibi scope
    if (dbScope === 'kibi' && !configuredProviders.find(p => p.id === 'openrouter')) {
      const legacyRow = allRows.find(r => r.key === 'openrouter_api_key' && r.value !== '')
      if (legacyRow) configuredProviders.push({ id: 'openrouter', encryptedKey: legacyRow.value })
    }

    const results: Array<{ provider: string; models: Array<{ id: string; name: string }> }> = []

    for (const { id: providerId, encryptedKey } of configuredProviders) {
      const cacheKey = `ki:models:${dbScope}:${providerId}`
      const cached   = await redis.get(cacheKey).catch(() => null)
      if (cached) {
        try { results.push({ provider: providerId, models: JSON.parse(cached) }); continue }
        catch { /* continue to fetch */ }
      }

      const providerDef = PROVIDERS.find(p => p.id === providerId)
      if (!providerDef?.modelsPath) continue

      try {
        let apiKey: string
        try { apiKey = decrypt(encryptedKey) } catch { continue }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...providerDef.extraHeaders,
          ...(providerDef.authHeader === 'x-api-key'
            ? { 'x-api-key': apiKey }
            : { 'Authorization': `Bearer ${apiKey}` }),
        }

        const controller = new AbortController()
        const timer      = setTimeout(() => controller.abort(), 10_000)
        let modelsRes: Response
        try {
          modelsRes = await fetch(`${providerDef.baseUrl}${providerDef.modelsPath}`, { headers, signal: controller.signal })
        } finally {
          clearTimeout(timer)
        }

        if (!modelsRes.ok) { console.warn(`[AI-PROVIDERS] ${providerId} models fetch ${modelsRes.status}`); continue }

        const modelsData = await modelsRes.json() as any
        let models: Array<{ id: string; name: string }> = []

        if (providerId === 'openrouter') {
          models = (modelsData.data ?? [])
            .filter((m: any) => m.id.endsWith(':free'))
            .map((m: any) => ({ id: m.id, name: m.name ?? m.id }))
        } else if (providerId === 'anthropic') {
          // Anthropic returns { data: [{ id, display_name }] }
          models = (modelsData.data ?? []).map((m: any) => ({ id: m.id, name: m.display_name ?? m.id }))
        } else if (providerId === 'google') {
          // Google returns { models: [{ name: 'models/gemini-...' }] }
          models = (modelsData.models ?? modelsData.data ?? []).map((m: any) => {
            const id = (m.name ?? m.id ?? '').replace('models/', '')
            return { id, name: m.displayName ?? id }
          })
        } else {
          // OpenAI-compatible: { data: [{ id, object: 'model' }] }
          models = (modelsData.data ?? [])
            .filter((m: any) => m.object === 'model' || m.id)
            .map((m: any) => ({ id: m.id, name: m.id }))
        }

        await redis.set(cacheKey, JSON.stringify(models), 'EX', 1800)
        results.push({ provider: providerId, models })
      } catch (e) {
        console.warn(`[AI-PROVIDERS] ${providerId} models fetch failed:`, (e as Error).message)
      }
    }

    return reply.send({ providers: results })
  })

  // GET /admin/ai-providers/:scope/roles — read kibi_model_configs for scope
  app.get('/ai-providers/:scope/roles', async (req, reply) => {
    const { scope } = req.params as { scope: string }
    const modelScope = urlScopeToModelScope(scope)
    if (!modelScope) return reply.status(400).send({ error: 'Geçersiz scope' })

    const configs = await db.select().from(kibiModelConfigs)
      .where(eq(kibiModelConfigs.scope, modelScope))

    return reply.send({ roles: configs })
  })

  // PUT /admin/ai-providers/:scope/roles — save role assignments
  app.put('/ai-providers/:scope/roles', async (req, reply) => {
    if ((req.user as any)?.role !== 'admin') return reply.status(403).send({ error: 'Sadece admin düzenleyebilir' })
    const { scope } = req.params as { scope: string }
    const modelScope = urlScopeToModelScope(scope)
    if (!modelScope) return reply.status(400).send({ error: 'Geçersiz scope' })

    const { roles } = req.body as {
      roles: Record<string, { primary: string; fallback1?: string; fallback2?: string }>
    }
    if (!roles || typeof roles !== 'object') return reply.status(400).send({ error: 'roles zorunlu' })

    for (const [role, assignment] of Object.entries(roles)) {
      if (!assignment.primary) continue
      const existing = await db.query.kibiModelConfigs.findFirst({
        where: (t, { and, eq }) => and(eq(t.scope, modelScope), eq(t.modelRole, role as any)),
      })
      const patch = {
        primaryModel: assignment.primary,
        fallback1:    assignment.fallback1 || null,
        fallback2:    assignment.fallback2 || null,
        fallback3:    null,
        provider:     assignment.primary.split('::')[0] ?? 'openrouter',
        isActive:     true,
        updatedAt:    new Date(),
      }
      if (existing) {
        await db.update(kibiModelConfigs).set(patch)
          .where(and(eq(kibiModelConfigs.scope, modelScope), eq(kibiModelConfigs.modelRole, role as any)))
      } else {
        await db.insert(kibiModelConfigs).values({
          scope: modelScope, modelRole: role as any, ...patch,
        })
      }
      invalidateModelCache(role)
    }

    return reply.send({ ok: true })
  })

  // POST /admin/ai-providers/:scope/test-model — ping a specific model with a minimal request
  app.post('/ai-providers/:scope/test-model', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { scope } = req.params as { scope: string }
    const dbScope = urlScopeToDb(scope)
    if (!dbScope) return reply.status(400).send({ error: 'Geçersiz scope' })

    const { model } = req.body as { model: string }
    if (!model) return reply.status(400).send({ error: 'model zorunlu (format: provider::modelId)' })

    const [providerId, ...modelParts] = model.split('::')
    const modelId = modelParts.join('::')
    if (!providerId || !modelId) return reply.status(400).send({ error: 'Geçersiz model formatı (beklenen: provider::modelId)' })

    const providerDef = PROVIDERS.find(p => p.id === providerId)
    if (!providerDef) return reply.status(400).send({ error: `Bilinmeyen sağlayıcı: ${providerId}` })

    const allRows = await db.select().from(platformConfigs)
    const configKey = `ai_provider_${dbScope}_${providerId}`
    let encryptedKey = allRows.find(r => r.key === configKey)?.value ?? ''

    // Fallback: legacy openrouter key for kibi scope
    if (!encryptedKey && dbScope === 'kibi' && providerId === 'openrouter') {
      encryptedKey = allRows.find(r => r.key === 'openrouter_api_key')?.value ?? ''
    }
    if (!encryptedKey) return reply.status(400).send({ error: `${providerDef.name} için API key yapılandırılmamış` })

    let apiKey: string
    try { apiKey = decrypt(encryptedKey) } catch { return reply.status(500).send({ error: 'API key çözümlenemedi' }) }

    const result = await pingProviderModel(providerDef, modelId, apiKey)
    return reply.send(result)
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

  // ─── Platform Vector Docs (KIBI AI Knowledge Base) ──────────────────────────
  // YFZ 33: unified with the KIBI AI KB file-upload pipeline's collection — this used to
  // point at env.QDRANT_COLLECTION while the consulting pipeline searched 'ki_platform_knowledge',
  // a write/read mismatch that meant the Danışman never found any KB hits.

  const PLATFORM_QDRANT_COLLECTION = KIBI_AI_KB_COLLECTION

  // GET /api/v1/admin/platform-vector-docs
  app.get('/platform-vector-docs', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { role: string }
    if (!['admin', 'supervisor'].includes(user.role)) return reply.status(403).send({ error: 'Yetkisiz' })

    const docs = await db.select({
      id:          platformVectorDocs.id,
      title:       platformVectorDocs.title,
      content:     platformVectorDocs.content,
      sourceType:  platformVectorDocs.sourceType,
      isIndexed:   platformVectorDocs.isIndexed,
      qdrantId:    platformVectorDocs.qdrantId,
      vectorModel: platformVectorDocs.vectorModel,
      tags:        platformVectorDocs.tags,
      createdAt:   platformVectorDocs.createdAt,
    }).from(platformVectorDocs).orderBy(asc(platformVectorDocs.createdAt))

    return reply.send({ docs })
  })

  // POST /api/v1/admin/platform-vector-docs — create + embed + upsert to Qdrant
  app.post('/platform-vector-docs', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; role: string }
    if (!['admin'].includes(user.role)) return reply.status(403).send({ error: 'Yetkisiz' })

    const { title, content, tags } = req.body as { title?: string; content?: string; tags?: string[] }
    if (!title?.trim() || !content?.trim()) {
      return reply.status(400).send({ error: 'Başlık ve içerik zorunlu' })
    }

    const [doc] = await db.insert(platformVectorDocs).values({
      title:     title.trim(),
      content:   content.trim(),
      sourceType: 'manual',
      tags:      tags ?? [],
      createdBy: user.sub,
    }).returning()

    try {
      const [vector] = await embedConfigured([content.trim()])
      await qdrant.upsert(PLATFORM_QDRANT_COLLECTION, {
        wait: true,
        points: [{
          id:      doc!.id,
          vector:  vector!,
          payload: { title: doc!.title, source: 'platform', sourceType: 'manual' },
        }],
      })
      await db.update(platformVectorDocs)
        .set({ qdrantId: doc!.id, isIndexed: true })
        .where(eq(platformVectorDocs.id, doc!.id))
    } catch (e: any) {
      console.warn('[platform-vector-docs] Embedding error:', e.message)
    }

    return reply.status(201).send({ doc })
  })

  // PUT /api/v1/admin/platform-vector-docs/:id — update + reindex
  app.put('/platform-vector-docs/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { role: string }
    if (!['admin'].includes(user.role)) return reply.status(403).send({ error: 'Yetkisiz' })

    const { id } = req.params as { id: string }
    const { title, content, tags } = req.body as { title?: string; content?: string; tags?: string[] }

    const existing = await db.query.platformVectorDocs.findFirst({ where: (t, { eq }) => eq(t.id, id) })
    if (!existing) return reply.status(404).send({ error: 'Bulunamadı' })

    const newContent = content?.trim() ?? existing.content
    await db.update(platformVectorDocs)
      .set({
        title:     title?.trim() ?? existing.title,
        content:   newContent,
        tags:      tags ?? existing.tags,
        isIndexed: false,
        updatedAt: new Date(),
      })
      .where(eq(platformVectorDocs.id, id))

    try {
      const [vector] = await embedConfigured([newContent])
      await qdrant.upsert(PLATFORM_QDRANT_COLLECTION, {
        wait: true,
        points: [{ id, vector: vector!, payload: { title: title?.trim() ?? existing.title, source: 'platform' } }],
      })
      await db.update(platformVectorDocs).set({ isIndexed: true }).where(eq(platformVectorDocs.id, id))
    } catch (e: any) {
      console.warn('[platform-vector-docs] Re-embed error:', e.message)
    }

    return reply.send({ ok: true })
  })

  // DELETE /api/v1/admin/platform-vector-docs/:id
  app.delete('/platform-vector-docs/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { role: string }
    if (!['admin'].includes(user.role)) return reply.status(403).send({ error: 'Yetkisiz' })

    const { id } = req.params as { id: string }
    const existing = await db.query.platformVectorDocs.findFirst({ where: (t, { eq }) => eq(t.id, id) })
    if (!existing) return reply.status(404).send({ error: 'Bulunamadı' })

    await db.delete(platformVectorDocs).where(eq(platformVectorDocs.id, id))
    try {
      await qdrant.delete(PLATFORM_QDRANT_COLLECTION, { wait: true, points: [id] })
    } catch {}

    return reply.send({ ok: true })
  })

  // POST /api/v1/admin/platform-vector-docs/reindex-all — re-embed all non-indexed docs
  app.post('/platform-vector-docs/reindex-all', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { role: string }
    if (!['admin'].includes(user.role)) return reply.status(403).send({ error: 'Yetkisiz' })

    // Invalidate cache so fresh embedding model is used
    invalidateEmbeddingModelCache()

    const docs = await db.select().from(platformVectorDocs)
    let indexed = 0
    for (const doc of docs) {
      try {
        const [vector] = await embedConfigured([doc.content])
        await qdrant.upsert(PLATFORM_QDRANT_COLLECTION, {
          wait: true,
          points: [{ id: doc.id, vector: vector!, payload: { title: doc.title, source: 'platform' } }],
        })
        await db.update(platformVectorDocs).set({ isIndexed: true, qdrantId: doc.id }).where(eq(platformVectorDocs.id, doc.id))
        indexed++
      } catch (e: any) {
        console.warn(`[reindex-all] ${doc.id} failed:`, e.message)
      }
    }

    return reply.send({ ok: true, indexed, total: docs.length })
  })

  // POST /admin/kb-search — KB arama testi (kibi_ai_kb koleksiyonu)
  app.post('/kb-search', async (req, reply) => {
    const { query, limit } = req.body as { query?: string; limit?: number }
    if (!query?.trim()) return reply.status(400).send({ error: 'Sorgu gerekli' })
    try {
      const results = await vectorSearch(KIBI_AI_KB_COLLECTION, query.trim(), Math.min(limit ?? 5, 20))
      return reply.send({ results, total: results.length })
    } catch (e: any) {
      return reply.status(500).send({ error: e.message })
    }
  })

  // ── KIBI AI KB: file-upload documents (YFZ 33) ───────────────────────────────
  // Separate from the manual-paste /platform-vector-docs above — chunked, hash-diffed, file-backed.
  // scope='kibi', entityId=null — platform-wide, not tenant-isolated.

  // GET /admin/kb-documents
  app.get('/kb-documents', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { role: string }
    if (!['admin', 'supervisor'].includes(user.role)) return reply.status(403).send({ error: 'Yetkisiz' })

    const docs = await db.select().from(kbDocuments)
      .where(eq(kbDocuments.scope, 'kibi'))
      .orderBy(kbDocuments.createdAt)

    return reply.send({ docs })
  })

  // POST /admin/kb-documents — multipart file upload, category + audience tags
  app.post('/kb-documents', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; role: string }
    if (!['admin'].includes(user.role)) return reply.status(403).send({ error: 'Yetkisiz' })

    const data = await req.file()
    if (!data) return reply.status(400).send({ error: 'Dosya bulunamadı' })
    const category = String((data.fields as any)?.category?.value ?? '').trim()
    if (!category) return reply.status(400).send({ error: 'Kategori zorunlu' })
    const tagsRaw = (data.fields as any)?.tags?.value
    let tags: string[] = ['both']
    try { tags = tagsRaw ? JSON.parse(tagsRaw) : ['both'] } catch { /* keep default */ }

    const ext = data.filename.split('.').pop() ?? ''
    const fileType = detectFileType(data.filename, data.mimetype)
    if (!fileType) return reply.status(400).send({ error: `Desteklenmeyen dosya türü: .${ext}` })

    const buffer = await data.toBuffer()
    const normName = normalizedFileName('kibi-ai', category, ext)

    const existingDoc = await db.query.kbDocuments.findFirst({
      where: (t, { and, eq }) => and(eq(t.scope, 'kibi'), eq(t.normalizedFileName, normName)),
    })

    // Platform-scope uploads have no owning tenant, so they're archived to disk only —
    // fileStorage.tenantId is NOT NULL with an FK to tenants, which doesn't fit here.
    const uploadDir = join(process.cwd(), 'storage', '_platform')
    if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true })
    const storedFilename = `${Date.now()}-${normName}`
    const filepath = join(uploadDir, storedFilename)
    await pipeline(Readable.from(buffer), createWriteStream(filepath))

    let documentId: string
    if (existingDoc) {
      documentId = existingDoc.id
      await db.update(kbDocuments).set({
        originalFileName: data.filename,
        tags,
        status:           'processing',
        updatedAt:        new Date(),
      }).where(eq(kbDocuments.id, documentId))
    } else {
      const [doc] = await db.insert(kbDocuments).values({
        scope:              'kibi',
        entityId:           null,
        category,
        title:              data.filename,
        originalFileName:   data.filename,
        normalizedFileName: normName,
        sourceType:         'file',
        tags,
        uploadedBy:         user.sub,
        status:             'processing',
      }).returning()
      documentId = doc!.id
    }

    try {
      const text = await extractText(buffer, fileType)
      const result = await indexDocument({ documentId, scope: 'kibi', entityId: null, category, text, fileName: normName, tags })
      return reply.status(201).send({ documentId, normalizedFileName: normName, ...result })
    } catch (e: any) {
      await db.update(kbDocuments).set({ status: 'failed' }).where(eq(kbDocuments.id, documentId))
      return reply.status(500).send({ error: `İndexleme hatası: ${e.message}` })
    }
  })

  // DELETE /admin/kb-documents/:id
  app.delete('/kb-documents/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { role: string }
    if (!['admin'].includes(user.role)) return reply.status(403).send({ error: 'Yetkisiz' })

    const { id } = req.params as { id: string }
    const existing = await db.query.kbDocuments.findFirst({ where: (t, { and, eq }) => and(eq(t.id, id), eq(t.scope, 'kibi')) })
    if (!existing) return reply.status(404).send({ error: 'Bulunamadı' })

    await deleteDocumentFromIndex(id, 'kibi', null)
    await db.delete(kbDocuments).where(eq(kbDocuments.id, id))

    return reply.send({ ok: true })
  })

  // GET /admin/kb-signals — KB sinyal istatistikleri
  app.get('/kb-signals', async (_req, reply) => {
    const logs = await db.query.aiPipelineLogs.findMany({
      orderBy: desc(aiPipelineLogs.createdAt),
      limit: 1000,
    })
    const total         = logs.length
    const kbWritten     = logs.filter(l => l.kbWritten).length
    const escalated     = logs.filter(l => l.escalated).length
    const succeeded     = logs.filter(l => l.success).length
    const avgConfidence = logs
      .filter(l => l.confidenceScore != null)
      .reduce((s, l) => s + (l.confidenceScore ?? 0), 0) / (logs.filter(l => l.confidenceScore != null).length || 1)
    const byRole = logs.reduce<Record<string, number>>((acc, l) => {
      acc[l.modelRole] = (acc[l.modelRole] ?? 0) + 1
      return acc
    }, {})
    return reply.send({
      total, kbWritten, escalated, succeeded,
      successRate:    Math.round(succeeded / (total || 1) * 100),
      kbWrittenRate:  Math.round(kbWritten / (total || 1) * 100),
      avgConfidence:  Math.round(avgConfidence),
      byRole,
    })
  })

  // GET /admin/pipeline-logs — AI pipeline kayıtları (filtreleme ile)
  app.get('/pipeline-logs', async (req, reply) => {
    const { role, entityId, modelRole, success, limit } = req.query as {
      role?: string
      entityId?: string
      modelRole?: string
      success?: string
      limit?: string
    }

    const filters: any[] = []
    if (modelRole) filters.push(eq(aiPipelineLogs.modelRole, modelRole))
    if (entityId) filters.push(eq(aiPipelineLogs.entityId, entityId as any))
    if (success !== undefined) filters.push(eq(aiPipelineLogs.success, success === 'true'))

    const whereClause = filters.length > 0 ? and(...filters) : undefined
    const logs = await db.query.aiPipelineLogs.findMany({
      where: whereClause,
      orderBy: desc(aiPipelineLogs.createdAt),
      limit: Math.min(parseInt(limit ?? '100'), 1000),
    })

    // Özet istatistikler
    const total = logs.length
    const succeeded = logs.filter(l => l.success).length
    const escalated = logs.filter(l => l.escalated).length
    const avgLatency = logs.reduce((sum, l) => sum + (l.latencyMs ?? 0), 0) / (total || 1)

    return reply.send({
      logs,
      summary: {
        total,
        successRate: Math.round((succeeded / total) * 100),
        escalatedCount: escalated,
        avgLatencyMs: Math.round(avgLatency),
      },
    })
  })
}

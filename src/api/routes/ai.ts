import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { runAgent } from '../../engine/ai/agent.js'
import { AiGateway, ANALYSIS_MODELS, CONVERSATION_MODELS } from '../../engine/ai/gateway.js'
import { redis } from '../../lib/redis.js'
import { vectorSearch } from '../../lib/qdrant.js'
import { db } from '../../lib/db.js'
import { kibiEntities, kibiSupportTickets, kibiTokenUsage, entityMetrics } from '../../../db/schema.js'
import { eq, sql } from 'drizzle-orm'
import { getEntitySchema, queryEntitySchema, getEntityDataSummary } from '../../lib/entity-provisioner.js'
import { env } from '../../../config/env.js'

// Plan limits per plan name
const PLAN_MSG_LIMITS: Record<string, number> = {
  free: 100, starter: 500, growth: 2000, enterprise: 999999,
}

async function getEntityWithPlan(tenantId: string) {
  return db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.entityId, tenantId),
    columns: { id: true, planName: true },
  }).catch(() => null)
}

async function trackTokenUsage(entityId: string, userId: string, modelName: string, promptTokens: number, completionTokens: number) {
  const total = promptTokens + completionTokens
  const costUsd = String((total * 0.000001).toFixed(6)) // rough estimate
  try {
    await db.insert(kibiTokenUsage).values({
      entityId, userId, modelName,
      provider: 'openrouter',
      promptTokens, completionTokens, totalTokens: total,
      costUsd: costUsd as any,
      modelRole: 'conversation',
    })
    // Update monthly message count in entityMetrics
    await db.execute(sql`
      INSERT INTO entity_metrics (id, entity_id, current_month_messages, updated_at)
      VALUES (gen_random_uuid(), ${entityId}, 1, now())
      ON CONFLICT (entity_id)
      DO UPDATE SET
        current_month_messages = entity_metrics.current_month_messages + 1,
        updated_at = now()
    `)
  } catch { /* non-fatal */ }
}

const chatSchema = z.object({
  message:      z.string().min(1),
  sessionId:    z.string().optional(),
  connectionId: z.string().optional(),
  contactId:    z.string().optional(),
  accountId:    z.string().optional(),
  firstName:    z.string().optional(),
  lastName:     z.string().optional(),
  channel:      z.string().default('web'),
  authorizedCompanies: z.array(z.object({
    accountId:    z.string(),
    accountName:  z.string(),
    jurisdiction: z.string().optional(),
  })).optional(),
})

const FREE_MODELS_CACHE_KEY = 'openrouter:free_models'
const FREE_MODELS_CACHE_TTL = 6 * 60 * 60  // 6 hours

export const aiRoutes: FastifyPluginAsync = async (app) => {

  // ── POST /api/v1/ai/chat ──────────────────────────────────────────────────
  app.post('/chat', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string | null; role?: string }
    const body = chatSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { message, sessionId, ...rest } = body.data
    const sid = sessionId ?? `web_${user.sub}_${Date.now()}`
    const isAdmin = user.role === 'admin' || user.role === 'supervisor'

    // Load custom KIBI instructions if tenant has AI config
    let kibiInstructions: string | undefined
    const isUUIDCheck = (s: string | null | undefined) =>
      !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
    if (isUUIDCheck(user.tenantId)) {
      try {
        const cfg = await db.query.aiConfigs.findFirst({ where: (t, { eq }) => eq(t.tenantId, user.tenantId!) })
        const cfgSettings = (cfg?.settings ?? {}) as Record<string, any>
        kibiInstructions = cfgSettings.kibiInstructions || undefined
      } catch { /* non-fatal */ }
    }

    // ── FAZ 15: Plan limit check (entity users only) ──────────────────────────
    if (!isAdmin && isUUIDCheck(user.tenantId)) {
      try {
        const entity = await getEntityWithPlan(user.tenantId!)
        if (entity) {
          const limit = PLAN_MSG_LIMITS[entity.planName ?? 'free'] ?? 100
          const metrics = await db.query.entityMetrics.findFirst({
            where: (t, { eq }) => eq(t.entityId, entity.id),
            columns: { currentMonthMessages: true },
          })
          const used = metrics?.currentMonthMessages ?? 0
          if (used >= limit) {
            return reply.status(429).send({ error: `Plan limitinize ulaştınız (${limit} mesaj/ay). Planınızı yükseltin.` })
          }
        }
      } catch { /* non-fatal — don't block if check fails */ }
    }

    try {
      const result = await runAgent({
        tenantId:     user.tenantId ?? 'platform',
        sessionId:    sid,
        userMessage:  message,
        isAdmin,
        instructions: kibiInstructions,
        ...rest,
      })

      // ── FAZ 15: Token usage tracking ─────────────────────────────────────────
      if (isUUIDCheck(user.tenantId) && !isAdmin) {
        const entity = await getEntityWithPlan(user.tenantId!).catch(() => null)
        if (entity) {
          const msgLen = message.length + (result.response?.length ?? 0)
          const estimatedPrompt = Math.ceil(message.length / 4)
          const estimatedCompletion = Math.ceil((result.response?.length ?? 0) / 4)
          trackTokenUsage(entity.id, user.sub, result.usedModel ?? 'unknown', estimatedPrompt, estimatedCompletion)
        }
      }

      return reply.send({
        response:   result.response,
        department: result.department,
        sessionId:  sid,
        usedModel:  result.usedModel,
      })
    } catch (e: any) {
      console.error('[AI CHAT] Error:', e)
      return reply.status(500).send({ error: 'AI hatası, lütfen tekrar deneyin' })
    }
  })

  // ── WebSocket /api/v1/ai/chat/stream ──────────────────────────────────────
  app.get('/chat/stream', { onRequest: [app.authenticate], websocket: true }, (connection, req) => {
    const user = req.user as { sub: string; tenantId: string }

    connection.socket.on('message', async (raw: Buffer | string) => {
      try {
        const msg    = JSON.parse(String(raw))
        const result = await runAgent({
          tenantId:   user.tenantId,
          sessionId:  msg.sessionId ?? `ws_${user.sub}`,
          userMessage: msg.message,
          channel:    msg.channel ?? 'web',
          contactId:  msg.contactId,
          accountId:  msg.accountId,
          firstName:  msg.firstName,
        })
        connection.socket.send(JSON.stringify({ type: 'response', ...result }))
      } catch (err) {
        connection.socket.send(JSON.stringify({ type: 'error', error: String(err) }))
      }
    })
  })

  // ── GET /api/v1/ai/config ─────────────────────────────────────────────────
  app.get('/config', { onRequest: [app.authenticate] }, async (req) => {
    const user   = req.user as { sub: string; tenantId: string }
    const config = await db.query.aiConfigs.findFirst({
      where: (t, { eq }) => eq(t.tenantId, user.tenantId),
      columns: { id: true, provider: true, model: true, isDefault: true, settings: true },
    })

    const settings = (config?.settings ?? {}) as Record<string, any>

    return {
      config: {
        provider:              config?.provider  ?? 'openrouter',
        model:                 config?.model     ?? CONVERSATION_MODELS[0],
        analysisModel:         settings.analysisModel       ?? ANALYSIS_MODELS[0],
        conversationModel:     settings.conversationModel   ?? CONVERSATION_MODELS[0],
        vectorModel:           settings.vectorModel         ?? ANALYSIS_MODELS[0],
        analysisFallbacks:     settings.analysisFallbacks   ?? [...ANALYSIS_MODELS.slice(1)],
        conversationFallback:  settings.conversationFallback ?? CONVERSATION_MODELS[1],
        conversationF2:        settings.conversationF2      ?? CONVERSATION_MODELS[2] ?? '',
        vectorFallbacks:       settings.vectorFallbacks     ?? [...ANALYSIS_MODELS.slice(1)],
        kibiInstructions:      settings.kibiInstructions    ?? '',
        entityInstructions:    settings.entityInstructions  ?? '',
      },
      defaults: {
        analysisModels:      [...ANALYSIS_MODELS],
        conversationModels:  [...CONVERSATION_MODELS],
      },
    }
  })

  // ── GET /api/v1/ai/openrouter-models ─────────────────────────────────────
  // Returns list of current free models from OpenRouter (cached 6h in Redis)
  app.get('/openrouter-models', { onRequest: [app.authenticate] }, async (_req, reply) => {
    // 1. Try cache
    try {
      const cached = await redis.get(FREE_MODELS_CACHE_KEY)
      if (cached) {
        return reply.send({ models: JSON.parse(cached), cached: true })
      }
    } catch { /* Redis miss → fetch live */ }

    // 2. Fetch from OpenRouter
    try {
      const models = await AiGateway.fetchFreeModels(env.OPENROUTER_API_KEY)

      // Cache result
      try {
        await redis.set(FREE_MODELS_CACHE_KEY, JSON.stringify(models), 'EX', FREE_MODELS_CACHE_TTL)
      } catch { /* cache write failure is non-fatal */ }

      return reply.send({ models, cached: false })
    } catch (e: any) {
      console.error('[AI] Failed to fetch OpenRouter models:', e.message)
      // Return our known defaults as fallback
      return reply.send({
        models: [
          ...ANALYSIS_MODELS.map((id) => ({ id, name: id.replace(':free', ''), contextLength: 131072 })),
          ...CONVERSATION_MODELS
            .filter((id) => !ANALYSIS_MODELS.includes(id))
            .map((id) => ({ id, name: id.replace(':free', ''), contextLength: 131072 })),
        ],
        cached: false,
        fallback: true,
      })
    }
  })

  // ── POST /api/v1/ai/openrouter-models/refresh ─────────────────────────────
  app.post('/openrouter-models/refresh', { onRequest: [app.authenticate] }, async (_req, reply) => {
    try {
      await redis.del(FREE_MODELS_CACHE_KEY)
      const models = await AiGateway.fetchFreeModels(env.OPENROUTER_API_KEY)
      await redis.set(FREE_MODELS_CACHE_KEY, JSON.stringify(models), 'EX', FREE_MODELS_CACHE_TTL)
      return reply.send({ ok: true, count: models.length })
    } catch (e: any) {
      return reply.status(502).send({ error: `OpenRouter API hatası: ${e.message}` })
    }
  })

  // ── POST /api/v1/ai/entity-chat ──────────────────────────────────────────
  // Entity AI: answers questions about the entity's own data (CRM, ERP, Accounting)
  app.post('/entity-chat', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string | null }
    const body = z.object({ message: z.string().min(1), sessionId: z.string().optional() }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { message } = body.data

    // Guard: requires a valid UUID tenantId
    const isUUID = (s: string | null | undefined) =>
      !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

    if (!isUUID(user.tenantId)) {
      return reply.send({
        response: 'Entity AI kullanmak için bir entity bağlantısı gereklidir. Platform yöneticisiyle iletişime geçin.',
        sessionId: `entity_${user.sub}`,
      })
    }

    try {
      // Resolve entity schema from kibi_entities
      const entity = await db.query.kibiEntities.findFirst({
        where: (t, { eq }) => eq(t.entityId, user.tenantId!),
        columns: { id: true, entityDbSchema: true, isProvisioned: true, companyName: true },
      })

      if (!entity?.isProvisioned || !entity.entityDbSchema) {
        return reply.send({
          response: 'Entity AI henüz hazır değil. Lütfen bir yönetici ile iletişime geçin.',
          sessionId: `entity_${user.sub}`,
        })
      }

      // Get live data summary to build context
      const summary = await getEntityDataSummary(entity.entityDbSchema)

      const context = `Sen ${entity.companyName || 'bu şirketin'} verilerine tam erişimi olan Entity AI'sın.

Güncel veriler:
CRM: ${summary.crm.contacts} kişi, ${summary.crm.companies} şirket, ${summary.crm.openDeals} açık fırsat (${summary.crm.pipelineValue.toLocaleString('tr-TR')} TL pipeline)
ERP: ${summary.erp.products} ürün (${summary.erp.lowStockItems} kritik stok), ${summary.erp.ordersLast30d} sipariş/30gün, ${summary.erp.activeStaff} aktif personel (${summary.erp.staffOnLeave} izinde)
Muhasebe: ${summary.accounting.totalReceivable.toLocaleString('tr-TR')} TL alacak (${summary.accounting.overdueReceivable.toLocaleString('tr-TR')} TL gecikmiş), bu ay ${summary.accounting.expensesThisMonth.toLocaleString('tr-TR')} TL gider

Kullanıcı sorusu:`

      // Load entity instructions from AI config
      let entityInstructions: string | undefined
      try {
        const cfg = await db.query.aiConfigs.findFirst({ where: (t, { eq }) => eq(t.tenantId, user.tenantId!) })
        const cfgSettings = (cfg?.settings ?? {}) as Record<string, any>
        entityInstructions = cfgSettings.entityInstructions || undefined
      } catch { /* non-fatal */ }

      const result = await runAgent({
        tenantId:     user.tenantId ?? 'default',
        sessionId:    `entity_${user.sub}_${Date.now()}`,
        userMessage:  `${context}\n${message}`,
        channel:      'web',
        instructions: entityInstructions,
      })

      return reply.send({ response: result.response, sessionId: `entity_${user.sub}` })
    } catch (e: any) {
      console.error('[ENTITY AI] Error:', e)
      return reply.status(500).send({ error: 'Entity AI hatası, lütfen tekrar deneyin' })
    }
  })

  // ── POST /api/v1/ai/admin-chat ────────────────────────────────────────────
  // KIBI Admin AI: superadmin only, full access, no history retention
  app.post('/admin-chat', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string | null; role?: string }
    if (user.role !== 'admin') return reply.status(403).send({ error: 'Yetkisiz erişim' })

    const body = z.object({ message: z.string().min(1) }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    try {
      // Admin AI uses a fresh session each time — no history
      const result = await runAgent({
        tenantId:    'admin',
        sessionId:   `admin_${user.sub}_${Date.now()}`, // unique = no context carry
        userMessage: body.data.message,
        channel:     'web',
      })
      return reply.send({ response: result.response })
    } catch (e: any) {
      console.error('[ADMIN AI] Error:', e)
      return reply.status(500).send({ error: 'Admin AI hatası' })
    }
  })

  // ── POST /api/v1/ai/provision ─────────────────────────────────────────────
  // Manually trigger entity schema provisioning (admin only)
  app.post('/provision', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { role?: string }
    if (user.role !== 'admin') return reply.status(403).send({ error: 'Yetkisiz' })

    const body = z.object({ kibiEntityId: z.string().uuid(), slug: z.string() }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    try {
      const { provisionEntity } = await import('../../lib/entity-provisioner.js')
      const result = await provisionEntity(body.data.kibiEntityId, body.data.slug)
      return reply.send(result)
    } catch (e: any) {
      console.error('[PROVISION] Error:', e)
      return reply.status(500).send({ error: String(e.message) })
    }
  })

  // ── POST /api/v1/ai/external-chat ─────────────────────────────────────────────
  // entity_external role only — limited to entity's knowledge base + own CRM record
  app.post('/external-chat', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string | null; role?: string; scope?: string }

    // Only entity_external tokens accepted
    if (user.scope !== 'external' || user.role !== 'entity_external') {
      return reply.status(403).send({ error: 'Bu endpoint yalnızca harici kullanıcılar için' })
    }

    const body = z.object({ message: z.string().min(1), sessionId: z.string().optional() }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { message } = body.data
    const sid = body.data.sessionId ?? `ext_${user.sub}_${Date.now()}`

    const isUUID = (s: string | null | undefined) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
    if (!isUUID(user.tenantId)) {
      return reply.send({ response: 'Bağlantı kurulu değil. Lütfen yetkili iletişim kanallarını kullanın.', sessionId: sid })
    }

    try {
      // Build context: user's own CRM record via vector search
      let crmContext = ''
      try {
        const vsResults = await vectorSearch('ki_knowledge_base', message, 3).catch(() => [])
        if (vsResults.length) {
          crmContext = vsResults.map(r => String(r.payload?.content ?? '')).filter(Boolean).join('\n')
        }
      } catch { /* non-fatal */ }

      // Check for open support tickets
      let ticketContext = ''
      try {
        const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, user.tenantId!) })
        if (entity) {
          const tickets = await db.query.kibiSupportTickets.findMany({
            where: (t, { and, eq }) => and(eq(t.entityId, entity.id), eq(t.userId, user.sub), eq(t.status, 'open')),
            limit: 3,
            orderBy: (t, { desc }) => [desc(t.openedAt)],
          })
          if (tickets.length) {
            ticketContext = `\n\nAçık Destek Talepleri:\n${tickets.map(t => `- ${t.subject} (${t.status})`).join('\n')}`
          }
        }
      } catch { /* non-fatal */ }

      const result = await runAgent({
        tenantId:    user.tenantId ?? 'unknown',
        sessionId:   sid,
        userMessage: message,
        channel:     'web',
        instructions: `Sen harici müşteri asistanısın. Sadece bu müşterinin bilgilerine ve şirketin genel bilgi tabanına erişebilirsin.${crmContext ? `\n\nMüşteri Bağlamı:\n${crmContext}` : ''}${ticketContext}`,
      })

      return reply.send({ response: result.response, sessionId: sid })
    } catch (e: any) {
      console.error('[EXTERNAL CHAT] Error:', e)
      return reply.status(500).send({ error: 'Şu anda yanıt veremiyorum, lütfen tekrar deneyin.' })
    }
  })
}

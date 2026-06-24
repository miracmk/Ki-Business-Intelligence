import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { runAgent } from '../../engine/ai/agent.js'
import { runKibiAgent } from '../../engine/ai/kibi-agent.js'
import { AiGateway, ANALYSIS_MODELS, CONVERSATION_MODELS, aiComplete } from '../../engine/ai/gateway.js'
import { getModelForRole } from '../../engine/ai/model-config.js'
import { redis } from '../../lib/redis.js'
import { vectorSearch } from '../../lib/qdrant.js'
import { db } from '../../lib/db.js'
import { kibiEntities, kibiSupportTickets, kibiTokenUsage, entityMetrics, aiSessions, aiMessages, tenantMemberships } from '../../../db/schema.js'
import { eq, and, sql } from 'drizzle-orm'
import { getEntitySchema, queryEntitySchema, getEntityDataSummary } from '../../lib/entity-provisioner.js'
import { env } from '../../../config/env.js'
import { chargeMessageOverage, getEntityPackage } from '../../engine/billing/billing.js'
import { hasActiveEntitlement } from '../../lib/entitlements.js'

async function resolveEntityId(userId: string, tenantId: string | null): Promise<string> {
  const isUUID = (s: string | null | undefined) =>
    !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

  if (isUUID(tenantId)) {
    const entity = await db.query.kibiEntities.findFirst({
      where: (t, { eq }) => eq(t.entityId, tenantId!)
    })
    if (entity) return entity.id
  }

  // Fallback: Find membership
  const membership = await db.query.tenantMemberships.findFirst({
    where: (t, { eq }) => eq(t.userId, userId)
  })
  if (membership) {
    const entity = await db.query.kibiEntities.findFirst({
      where: (t, { eq }) => eq(t.entityId, membership.tenantId)
    })
    if (entity) return entity.id
  }

  const firstEntity = await db.query.kibiEntities.findFirst()
  if (firstEntity) return firstEntity.id

  throw new Error('Aktif bir entity bulunamadı.')
}

// Plan limits per plan name
// Legacy plan message limits (kept for backward compat with old plan names)
const PLAN_MSG_LIMITS: Record<string, number> = {
  free: 40, starter: 150, basic: 150, growth: 750, premium: 750,
  enterprise: 4500, custom_models: 999999,
}

async function getEntityWithPlan(tenantId: string) {
  return db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.entityId, tenantId),
    columns: {
      id: true, planName: true,
      isBillingRestricted: true,
      messagesUsedThisMonth: true,
    },
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
    // Update entity monthly message counter
    await db.execute(sql`
      UPDATE kibi_entities
      SET messages_used_this_month = messages_used_this_month + 1, updated_at = now()
      WHERE id = ${entityId}
    `)
    // Update per-user monthly counter in tenant_memberships
    await db.execute(sql`
      UPDATE tenant_memberships m
      SET messages_used_this_month = messages_used_this_month + 1
      FROM kibi_entities e
      JOIN tenants t ON t.id = e.entity_id
      WHERE m.tenant_id = t.id AND m.user_id = ${userId}
        AND e.id = ${entityId}
    `)
    // Legacy entityMetrics counter
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

  // ── GET /api/v1/ai/sessions ───────────────────────────────────────────────
  app.get('/sessions', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string | null }
    const { type } = req.query as { type?: string }
    try {
      const entityId = await resolveEntityId(user.sub, user.tenantId)
      const list = await db.query.aiSessions.findMany({
        where: (t, { and, eq }) => {
          const conds = [eq(t.userId, user.sub), eq(t.entityId, entityId), eq(t.isArchived, false)]
          if (type) conds.push(eq(t.type, type as any))
          return and(...conds)
        },
        orderBy: (t, { desc }) => [desc(t.updatedAt)],
      })
      return reply.send({ sessions: list })
    } catch (e: any) {
      return reply.status(500).send({ error: e.message })
    }
  })

  // ── POST /api/v1/ai/sessions ──────────────────────────────────────────────
  app.post('/sessions', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string | null }
    const body = z.object({
      title: z.string().max(500).default('Yeni Sohbet'),
      type: z.enum(['kibi_ai', 'entity_ai']).default('kibi_ai'),
      channel: z.string().default('web')
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    try {
      const entityId = await resolveEntityId(user.sub, user.tenantId)
      const [session] = await db.insert(aiSessions).values({
        entityId,
        userId: user.sub,
        type: body.data.type,
        title: body.data.title,
        channel: body.data.channel as any,
        messageCount: 0,
      }).returning()
      return reply.status(201).send({ session })
    } catch (e: any) {
      return reply.status(500).send({ error: e.message })
    }
  })

  // ── GET /api/v1/ai/sessions/:id/messages ──────────────────────────────────
  app.get('/sessions/:id/messages', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string | null }
    const { id } = req.params as { id: string }
    try {
      const entityId = await resolveEntityId(user.sub, user.tenantId)
      const session = await db.query.aiSessions.findFirst({
        where: (t, { and, eq }) => and(eq(t.id, id), eq(t.userId, user.sub), eq(t.entityId, entityId))
      })
      if (!session) return reply.status(404).send({ error: 'Oturum bulunamadı' })

      const list = await db.query.aiMessages.findMany({
        where: (t, { eq }) => eq(t.sessionId, id),
        orderBy: (t, { asc }) => [asc(t.createdAt)]
      })
      return reply.send({ messages: list })
    } catch (e: any) {
      return reply.status(500).send({ error: e.message })
    }
  })

  // ── DELETE /api/v1/ai/sessions/:id ─────────────────────────────────────────
  app.delete('/sessions/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string | null }
    const { id } = req.params as { id: string }
    try {
      const entityId = await resolveEntityId(user.sub, user.tenantId)
      const session = await db.query.aiSessions.findFirst({
        where: (t, { and, eq }) => and(eq(t.id, id), eq(t.userId, user.sub), eq(t.entityId, entityId))
      })
      if (!session) return reply.status(404).send({ error: 'Oturum bulunamadı' })

      await db.delete(aiSessions).where(eq(aiSessions.id, id))
      return reply.send({ ok: true })
    } catch (e: any) {
      return reply.status(500).send({ error: e.message })
    }
  })

  // ── POST /api/v1/ai/chat ──────────────────────────────────────────────────
  app.post('/chat', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string | null; role?: string }
    const body = chatSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { message, sessionId, ...rest } = body.data
    let sid = sessionId
    const isAdmin = user.role === 'admin' || user.role === 'supervisor'

    const isUUIDCheck = (s: string | null | undefined) =>
      !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

    const entityId = await resolveEntityId(user.sub, user.tenantId).catch(() => null)

    // YFZ 34: KiBI AI is a Premium upsell — Base must work with it fully off.
    if (!isAdmin && entityId && !(await hasActiveEntitlement(entityId, 'ai_premium'))) {
      return reply.status(402).send({ error: 'KIBI AI premium bir özelliktir. Lütfen planınızı yükseltin.' })
    }

    if (!sid || !isUUIDCheck(sid)) {
      if (entityId) {
        try {
          const [newSession] = await db.insert(aiSessions).values({
            entityId,
            userId: user.sub,
            type: 'kibi_ai',
            title: message.slice(0, 50) || 'Yeni Sohbet',
            messageCount: 0,
            channel: 'web',
          }).returning()
          sid = newSession.id
        } catch (err) {
          console.error('[AI CHAT] Failed to auto-create session in DB:', err)
          sid = sid ?? `web_${user.sub}_${Date.now()}`
        }
      } else {
        sid = sid ?? `web_${user.sub}_${Date.now()}`
      }
    } else {
      if (entityId) {
        const existing = await db.query.aiSessions.findFirst({ where: (t, { eq }) => eq(t.id, sid!) })
        if (!existing) {
          try {
            await db.insert(aiSessions).values({
              id: sid,
              entityId,
              userId: user.sub,
              type: 'kibi_ai',
              title: message.slice(0, 50) || 'Yeni Sohbet',
              messageCount: 0,
              channel: 'web',
            })
          } catch (err) {
            console.error('[AI CHAT] Failed to create session with UUID:', err)
          }
        }
      }
    }

    // Load custom KIBI instructions if tenant has AI config
    let kibiInstructions: string | undefined
    if (isUUIDCheck(user.tenantId)) {
      try {
        const cfg = await db.query.aiConfigs.findFirst({ where: (t, { eq }) => eq(t.tenantId, user.tenantId!) })
        const cfgSettings = (cfg?.settings ?? {}) as Record<string, any>
        kibiInstructions = cfgSettings.kibiInstructions || undefined
      } catch { /* non-fatal */ }
    }

    // ── Message limit + overage check (entity users only) ────────────────────
    if (!isAdmin && isUUIDCheck(user.tenantId)) {
      try {
        const entity = await getEntityWithPlan(user.tenantId!)
        if (entity) {
          // Block if billing-restricted (debt > max_debt_tokens)
          if (entity.isBillingRestricted) {
            return reply.status(402).send({ error: 'Hesabınız kısıtlanmış. Lütfen bakiyenizi kontrol edin.' })
          }

          // Check per-user limit (set by entity_main)
          const membership = await db.query.tenantMemberships.findFirst({
            where: (t, { and, eq }) => and(eq(t.userId, user.sub), eq(t.tenantId, user.tenantId!)),
            columns: { messageLimit: true, messagesUsedThisMonth: true },
          })
          if (membership?.messageLimit != null) {
            if ((membership.messagesUsedThisMonth ?? 0) >= membership.messageLimit) {
              return reply.status(429).send({ error: `Aylık mesaj limitinize ulaştınız (${membership.messageLimit} mesaj). Yöneticinizle iletişime geçin.` })
            }
          }

          // Check entity-level monthly message limit
          const pkg = entity.planName ? await getEntityPackage(entity.planName) : null
          const limit = pkg?.monthlyMessageLimit ?? PLAN_MSG_LIMITS[entity.planName ?? 'free'] ?? 40
          const used = entity.messagesUsedThisMonth ?? 0

          if (limit !== null && used >= limit) {
            if (entity.planName === 'free') {
              // Free plan: hard block (no wallet billing)
              return reply.status(429).send({ error: `Ücretsiz plan limitinize ulaştınız (${limit} mesaj/ay). Planınızı yükseltin.` })
            }
            // Paid plan: charge overage ($0.03/mesaj)
            const overage = await chargeMessageOverage(entity.id, entity.planName ?? 'free')
            if (overage.restricted) {
              return reply.status(402).send({ error: 'Mesaj limitinizi aştınız. Bakiyeniz yetersiz olduğu için mesaj gönderilemedi.' })
            }
          }
        }
      } catch { /* non-fatal — don't block if check fails */ }
    }

    // Load Redis session history for context
    let history: { role: 'user' | 'assistant'; content: string }[] = []
    try {
      const histKey  = `kibi:session:hist:${sid}`
      const histRaw  = await redis.get(histKey).catch(() => null)
      if (histRaw) history = JSON.parse(histRaw)
      // Also try old session_messages format for backward compat
      if (history.length === 0) {
        const legacy = await redis.lrange(`session_messages:${sid}`, -20, -1).catch(() => [])
        history = legacy.map((r: string) => { try { return JSON.parse(r) } catch { return null } }).filter(Boolean)
      }
    } catch { /* non-fatal */ }

    try {
      const result = await runKibiAgent({
        tenantId:    user.tenantId ?? undefined,
        channelType: 'web',
        identifier:  user.sub,
        sessionKey:  sid,
        message,
        language:    'tr',
        history,
        supportAttempts: [],
      })

      // Persist updated history to Redis
      const updatedHistory = [...history, { role: 'user' as const, content: message }, { role: 'assistant' as const, content: result.response }]
      const histKey = `kibi:session:hist:${sid}`
      await redis.set(histKey, JSON.stringify(updatedHistory.slice(-40)), 'EX', 60 * 60 * 24 * 30).catch(() => {})

      // Persist to DB session
      if (isUUIDCheck(sid)) {
        db.insert(aiMessages).values([
          { sessionId: sid!, role: 'user',      content: message },
          { sessionId: sid!, role: 'assistant', content: result.response },
        ]).then(() =>
          db.update(aiSessions).set({ messageCount: sql`message_count + 2`, lastMessageAt: new Date(), updatedAt: new Date() })
            .where(eq(aiSessions.id, sid!))
        ).catch(err => console.error('[AI CHAT] DB persist failed:', err))
      }

      // ── Token usage tracking ─────────────────────────────────────────
      if (isUUIDCheck(user.tenantId) && !isAdmin) {
        const entity = await getEntityWithPlan(user.tenantId!).catch(() => null)
        if (entity) {
          trackTokenUsage(entity.id, user.sub, 'kibi_pipeline',
            Math.ceil(message.length / 4),
            Math.ceil((result.response?.length ?? 0) / 4))
        }
      }

      return reply.send({ response: result.response, sessionId: sid })
    } catch (e: any) {
      console.error('[AI CHAT] Error:', e)
      return reply.status(500).send({ error: 'AI hatası: ' + ((e as Error).message || 'lütfen tekrar deneyin') })
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
    const user = req.user as { sub: string; tenantId: string | null; role?: string }
    const body = z.object({ message: z.string().min(1), sessionId: z.string().optional() }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { message } = body.data
    const isAdmin = user.role === 'admin' || user.role === 'supervisor'

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

      // YFZ 34: KiBI AI (Entity AI dahil) Premium upsell — Base AI'sız %100 çalışmalı.
      if (entity && !isAdmin && !(await hasActiveEntitlement(entity.id, 'ai_premium'))) {
        return reply.status(402).send({ error: 'Entity AI premium bir özelliktir. Lütfen planınızı yükseltin.' })
      }

      if (!entity?.isProvisioned || !entity.entityDbSchema) {
        return reply.send({
          response: 'Entity AI henüz hazır değil. Lütfen bir yönetici ile iletişime geçin.',
          sessionId: `entity_${user.sub}`,
        })
      }

      // Resolve / auto-create session
      const { sessionId } = body.data
      let sid = sessionId
      const entityId = entity.id

      if (!sid || !isUUID(sid)) {
        try {
          const [newSession] = await db.insert(aiSessions).values({
            entityId,
            userId: user.sub,
            type: 'entity_ai',
            title: message.slice(0, 50) || 'Yeni Entity Sohbeti',
            messageCount: 0,
            channel: 'web',
          }).returning()
          sid = newSession.id
        } catch (err) {
          console.error('[ENTITY AI] Failed to auto-create session in DB:', err)
          sid = sid ?? `entity_${user.sub}_${Date.now()}`
        }
      } else {
        const existing = await db.query.aiSessions.findFirst({ where: (t, { eq }) => eq(t.id, sid!) })
        if (!existing) {
          try {
            await db.insert(aiSessions).values({
              id: sid,
              entityId,
              userId: user.sub,
              type: 'entity_ai',
              title: message.slice(0, 50) || 'Yeni Entity Sohbeti',
              messageCount: 0,
              channel: 'web',
            })
          } catch (err) {
            console.error('[ENTITY AI] Failed to create session with UUID:', err)
          }
        }
      }

      // Get live data summary and business profile in parallel
      const [summary, tenantRow] = await Promise.all([
        getEntityDataSummary(entity.entityDbSchema),
        db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId!), columns: { settings: true } }),
      ])

      const bp = ((tenantRow?.settings as any)?.businessProfile ?? {}) as Record<string, string>
      const profileLines: string[] = []
      if (bp.sector)               profileLines.push(`Sektör: ${bp.sector}`)
      if (bp.employee_count)       profileLines.push(`Çalışan sayısı: ${bp.employee_count}`)
      if (bp.annual_revenue)       profileLines.push(`Son yıl cirosu: ${bp.annual_revenue}`)
      if (bp.address)              profileLines.push(`Adres: ${bp.address}`)
      if (bp.country)              profileLines.push(`Ülke: ${bp.country}`)
      if (bp.tax_number)           profileLines.push(`Vergi/Kayıt No: ${bp.tax_number}`)
      if (bp.founded_date)         profileLines.push(`Kuruluş tarihi: ${bp.founded_date}`)
      if (bp.fiscal_year_start)    profileLines.push(`Mali yıl başlangıcı: ${bp.fiscal_year_start}`)

      const systemPrompt = `Sen ${entity.companyName || 'bu şirketin'} verilerine tam erişimi olan Entity AI'sın. Türkçe yanıt ver.
${profileLines.length ? `\nŞirket profili:\n${profileLines.join('\n')}` : ''}
Güncel veriler:
CRM: ${summary.crm.contacts} kişi, ${summary.crm.companies} şirket, ${summary.crm.openDeals} açık fırsat (${summary.crm.pipelineValue.toLocaleString('tr-TR')} TL pipeline)
ERP: ${summary.erp.products} ürün (${summary.erp.lowStockItems} kritik stok), ${summary.erp.ordersLast30d} sipariş/30gün, ${summary.erp.activeStaff} aktif personel (${summary.erp.staffOnLeave} izinde)
Muhasebe: ${summary.accounting.totalReceivable.toLocaleString('tr-TR')} TL alacak (${summary.accounting.overdueReceivable.toLocaleString('tr-TR')} TL gecikmiş), bu ay ${summary.accounting.expensesThisMonth.toLocaleString('tr-TR')} TL gider`

      // Load entity instructions from AI config
      let entityInstructions: string | undefined
      try {
        const cfg = await db.query.aiConfigs.findFirst({ where: (t, { eq }) => eq(t.tenantId, user.tenantId!) })
        const cfgSettings = (cfg?.settings ?? {}) as Record<string, any>
        entityInstructions = cfgSettings.entityInstructions || undefined
      } catch { /* non-fatal */ }

      // Load Redis conversation history
      const histKey = `entity:chat:hist:${sid}`
      const histRaw = await redis.get(histKey).catch(() => null)
      const history: { role: 'user' | 'assistant'; content: string }[] = histRaw ? JSON.parse(histRaw) : []

      // Use working model chain from DB
      const { primary, fallbacks } = await getModelForRole('master_conversation', 'platform', user.tenantId ?? undefined)
      const chain = [primary, ...fallbacks].filter(Boolean)

      const systemContent = entityInstructions ? `${systemPrompt}\n\nEk talimatlar: ${entityInstructions}` : systemPrompt
      const messages = [
        { role: 'system' as const, content: systemContent },
        ...history.slice(-10),
        { role: 'user' as const, content: message },
      ]

      let responseText = 'Şu an yanıt üretemiyorum, lütfen tekrar deneyin.'
      for (const modelStr of chain) {
        try {
          const norm = modelStr.includes('::') ? modelStr : `openrouter::${modelStr}`
          const res  = await aiComplete(norm, messages, user.tenantId, {})
          responseText = res.content
          break
        } catch (e: any) {
          console.warn(`[ENTITY AI] model ${modelStr} failed:`, e.message)
        }
      }

      // Persist history
      history.push({ role: 'user', content: message })
      history.push({ role: 'assistant', content: responseText })
      await redis.set(histKey, JSON.stringify(history.slice(-20)), 'EX', 86400).catch(() => {})

      return reply.send({ response: responseText, sessionId: sid })
    } catch (e: any) {
      console.error('[ENTITY AI] Error:', e)
      return reply.status(500).send({ error: 'Entity AI hatası, lütfen tekrar deneyin' })
    }
  })

  // ── POST /api/v1/ai/admin-chat ────────────────────────────────────────────
  // KIBI Admin AI: superadmin + supervisor, full platform access, now with session history
  app.post('/admin-chat', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string | null; role?: string }
    if (user.role !== 'admin' && user.role !== 'supervisor') {
      return reply.status(403).send({ error: 'Yetkisiz erişim' })
    }

    const body = z.object({
      message:   z.string().min(1),
      sessionId: z.string().optional(),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const isUUID = (s: string | null | undefined) =>
      !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

    // Resolve a persistent session for admin (admin doesn't belong to an entity,
    // so we use a special "platform_admin" entity lookup or create a Redis-backed session)
    let sid = body.data.sessionId
    // Admin sessions are Redis-backed only (no entity UUID required)
    if (!sid || !isUUID(sid)) {
      sid = `admin_${user.sub}_persistent`
    }

    try {
      // Load history from Redis
      const historyKey = `kibi:admin:hist:${sid}`
      const histRaw = await redis.get(historyKey).catch(() => null)
      const history: { role: 'user' | 'assistant'; content: string }[] = histRaw ? JSON.parse(histRaw) : []

      const result = await runKibiAgent({
        tenantId:       undefined,
        channelType:    'web',
        identifier:     user.sub,
        sessionKey:     sid,
        message:        body.data.message,
        language:       'tr',
        history,
        supportAttempts: [],
      })

      // Persist history (last 20 turns)
      history.push({ role: 'user', content: body.data.message })
      history.push({ role: 'assistant', content: result.response })
      await redis.set(historyKey, JSON.stringify(history.slice(-20)), 'EX', 86400).catch(() => {})

      return reply.send({ response: result.response, sessionId: sid })
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

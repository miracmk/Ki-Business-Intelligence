/**
 * Entity AI Routes — YFZ 22
 *
 * POST /entity-ai/chat      → Full pipeline (E-1 → E-2 → E-3)
 * GET  /entity-ai/session   → Current session info
 * POST /entity-ai/escalate  → Manual escalation to human
 */

import type { FastifyPluginAsync } from 'fastify'
import { z }                        from 'zod'
import { db }                       from '../../lib/db.js'
import {
  aiSessions, kibiEntities, kibiTokenUsage, entityMetrics,
} from '../../../db/schema.js'
import { eq, and, sql }             from 'drizzle-orm'
import { runEntityAgent }           from '../../engine/ai/entity-agent.js'
import { escalateToHuman, shouldEscalate } from '../../engine/ai/escalation-manager.js'

function isUUID(s: string | null | undefined): boolean {
  return !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

async function resolveEntity(tenantId: string) {
  if (!isUUID(tenantId)) return null
  return db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.entityId, tenantId),
  })
}

async function getOrCreateSession(
  entityId: string,
  userId:   string,
  sessionId?: string,
): Promise<string> {
  if (sessionId && isUUID(sessionId)) {
    const existing = await db.query.aiSessions.findFirst({
      where: (t, { and, eq }) => and(
        eq(t.id, sessionId),
        eq(t.entityId, entityId),
        eq(t.userId, userId),
      ),
    })
    if (existing) return existing.id
  }

  const [session] = await db.insert(aiSessions).values({
    entityId,
    userId,
    type:    'entity_ai',
    channel: 'web',
    title:   'Entity AI Sohbeti',
  }).returning()
  return session.id
}

async function trackUsage(entityId: string, userId: string, model: string) {
  try {
    await db.insert(kibiTokenUsage).values({
      entityId, userId, modelName: model,
      provider: model.split('::')[0] ?? 'openrouter',
      promptTokens: 0, completionTokens: 0, totalTokens: 0,
      costUsd: '0',
      modelRole: 'master_conversation',
    })
    await db.execute(sql`
      INSERT INTO entity_metrics (id, entity_id, current_month_messages, updated_at)
      VALUES (gen_random_uuid(), ${entityId}, 1, now())
      ON CONFLICT (entity_id)
      DO UPDATE SET current_month_messages = entity_metrics.current_month_messages + 1, updated_at = now()
    `)
  } catch { /* non-fatal */ }
}

const chatSchema = z.object({
  message:    z.string().min(1).max(4000),
  sessionId:  z.string().optional(),
  firstName:  z.string().optional(),
  lastName:   z.string().optional(),
  channel:    z.string().default('web'),
})

const escalateSchema = z.object({
  sessionId: z.string(),
  reason:    z.enum(['low_confidence', 'user_request', 'pipeline_failure', 'complex_issue']).default('user_request'),
  summary:   z.string().optional(),
})

export const entityAiRoutes: FastifyPluginAsync = async (app) => {

  // ── POST /entity-ai/chat ──────────────────────────────────────────────────
  app.post('/chat', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user   = req.user as { sub: string; tenantId: string }
    const parsed = chatSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const { message, sessionId: reqSessionId, firstName, lastName, channel } = parsed.data

    const entity = await resolveEntity(user.tenantId)
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı' })

    const sessionId = await getOrCreateSession(entity.id, user.sub, reqSessionId)

    const result = await runEntityAgent({
      entityId:   entity.id,
      tenantId:   user.tenantId,
      userId:     user.sub,
      sessionId,
      message,
      channel,
      firstName:  firstName ?? null,
      lastName:   lastName  ?? null,
      entityName: entity.companyName ?? undefined,
    })

    // Auto-escalate if confidence very low
    let escalationInfo = null
    if (result.escalated || shouldEscalate(result.confidence)) {
      try {
        escalationInfo = await escalateToHuman({
          entityId:    entity.id,
          userId:      user.sub,
          sessionId,
          reason:      result.escalated ? 'complex_issue' : 'low_confidence',
          summary:     `Intent: ${result.intent}, Confidence: ${result.confidence}%`,
          lastMessage: message,
        })
      } catch { /* non-fatal */ }
    }

    trackUsage(entity.id, user.sub, result.usedModels[0] ?? 'unknown').catch(() => {})

    return {
      response:   result.response,
      intent:     result.intent,
      sessionId,
      confidence: result.confidence,
      escalated:  result.escalated,
      escalation: escalationInfo,
      usedModels: result.usedModels,
    }
  })

  // ── GET /entity-ai/session ────────────────────────────────────────────────
  app.get('/session', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user   = req.user as { sub: string; tenantId: string }
    const { sessionId } = req.query as { sessionId?: string }

    const entity = await resolveEntity(user.tenantId)
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı' })

    if (sessionId && isUUID(sessionId)) {
      const session = await db.query.aiSessions.findFirst({
        where: (t, { and, eq }) => and(
          eq(t.id, sessionId),
          eq(t.entityId, entity.id),
        ),
      })
      if (!session) return reply.status(404).send({ error: 'Oturum bulunamadı' })

      const messages = await db.query.aiMessages.findMany({
        where:   (t, { eq }) => eq(t.sessionId, session.id),
        orderBy: (t, { asc }) => [asc(t.createdAt)],
      })
      return { session, messages }
    }

    const sessions = await db.query.aiSessions.findMany({
      where:   (t, { and, eq }) => and(eq(t.entityId, entity.id), eq(t.userId, user.sub), eq(t.type, 'entity_ai')),
      orderBy: (t, { desc }) => [desc(t.updatedAt)],
      limit:   20,
    })
    return { sessions }
  })

  // ── POST /entity-ai/escalate ──────────────────────────────────────────────
  app.post('/escalate', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user   = req.user as { sub: string; tenantId: string }
    const parsed = escalateSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const entity = await resolveEntity(user.tenantId)
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı' })

    const result = await escalateToHuman({
      entityId:    entity.id,
      userId:      user.sub,
      sessionId:   parsed.data.sessionId,
      reason:      parsed.data.reason,
      summary:     parsed.data.summary ?? 'Kullanıcı insan desteği talep etti',
      lastMessage: '',
    })

    return result
  })
}

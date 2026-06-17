import type { FastifyPluginAsync } from 'fastify'
import { db } from '../../lib/db.js'
import { kibiEntities, kibiModelConfigs } from '../../../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { runKibiAgent } from '../../engine/ai/kibi-agent.js'
import { redis } from '../../lib/redis.js'

export const kibiRoutes: FastifyPluginAsync = async (app) => {
  app.post('/chat', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    const { message, sessionId } = req.body as { message: string; sessionId: string }
    if (!message || !sessionId) return reply.status(400).send({ error: 'message and sessionId required' })

    const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, user.tenantId) })

    const historyKey = `kibi:chat:hist:${sessionId}`
    const histRaw = await redis.get(historyKey).catch(() => null)
    const history: { role: 'user' | 'assistant'; content: string }[] = histRaw ? JSON.parse(histRaw) : []

    const result = await runKibiAgent({
      tenantId:       user.tenantId,
      channelType:    'web',
      identifier:     user.sub,
      sessionKey:     sessionId,
      message,
      language:       'tr',
      history,
      supportAttempts: [],
      entityProfile: entity ? {
        industry:         entity.sector ?? '',
        sizeCategory:     entity.employeeCount ? String(entity.employeeCount) : '',
        region:           entity.country ?? entity.city ?? '',
        connectedModules: [],
      } : undefined,
    })

    history.push({ role: 'user', content: message })
    history.push({ role: 'assistant', content: result.response })
    await redis.set(historyKey, JSON.stringify(history.slice(-20)), 'EX', 86400).catch(() => {})

    return reply.send({ response: result.response, sessionId })
  })

  app.get('/entity-context', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, user.tenantId) })
    if (!entity) return reply.send({ entityContext: null })
    return reply.send({ entityContext: {
      entityId: entity.id,
      clientId: entity.clientId,
      mood: entity.mood,
      lastContactAt: entity.lastContactAt,
      opportunityScore: entity.opportunityScore,
    } })
  })

  app.get('/entity-models', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, user.tenantId) })
    if (!entity) return reply.send({ models: [] })
    const models = await db.query.kibiModelConfigs.findMany({ where: (t, { and, eq }) => and(eq(t.scope, 'entity'), eq(t.scopeId, entity.id)) })
    return reply.send({ models })
  })

  app.put('/entity-models/:role', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, user.tenantId) })
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı' })
    const { role } = req.params as { role: string }
    const { primaryModel, fallback1, fallback2, fallback3, provider, apiKey, temperature, maxTokens, isActive } = req.body as any
    const existing = await db.query.kibiModelConfigs.findFirst({ where: (t, { and, eq }) => and(eq(t.scope, 'entity'), eq(t.scopeId, entity.id), eq(t.modelRole, role as any)) })
    if (existing) {
      await db.update(kibiModelConfigs).set({
        primaryModel,
        fallback1,
        fallback2,
        fallback3,
        provider,
        apiKey,
        temperature: temperature !== undefined ? String(temperature) : undefined,
        maxTokens,
        isActive,
        updatedAt: new Date(),
      }).where(eq(kibiModelConfigs.id, existing.id))
    } else {
      await db.insert(kibiModelConfigs).values({
        scope: 'entity',
        scopeId: entity.id,
        modelRole: role as any,
        primaryModel,
        fallback1,
        fallback2,
        fallback3,
        provider,
        apiKey,
        temperature,
        maxTokens,
        isActive: isActive ?? true,
        updatedAt: new Date(),
      })
    }
    return reply.send({ ok: true })
  })
}

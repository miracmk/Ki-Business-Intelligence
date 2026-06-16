/**
 * Dashboard API — YFZ 26
 * GET /api/v1/dashboard/summary — Entity dashboard özet verileri
 * GET /api/v1/dashboard/admin   — Platform admin özet (KIBI)
 */

import type { FastifyPluginAsync } from 'fastify'
import { db }                       from '../../lib/db.js'
import { redis }                    from '../../lib/redis.js'
import {
  aiPipelineLogs, kibiSupportTickets, entityMetrics,
  kibiEntities, aiSessions,
} from '../../../db/schema.js'
import { eq, and, gte, sql, desc } from 'drizzle-orm'

function isUUID(s: string | null | undefined): boolean {
  return !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

async function resolveEntityId(tenantId: string): Promise<string | null> {
  if (!isUUID(tenantId)) return null
  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.entityId, tenantId),
    columns: { id: true },
  })
  return entity?.id ?? null
}

export const dashboardRoutes: FastifyPluginAsync = async (app) => {

  // ── GET /dashboard/summary — Entity Dashboard ─────────────────────────────
  app.get('/summary', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user    = req.user as { sub: string; tenantId: string }
    const entityId = await resolveEntityId(user.tenantId)
    if (!entityId) return reply.status(404).send({ error: 'Entity bulunamadı' })

    const cacheKey = `dashboard:entity:${entityId}`
    const cached   = await redis.get(cacheKey).catch(() => null)
    if (cached) return JSON.parse(cached)

    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const since7d  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const today    = new Date(); today.setHours(0, 0, 0, 0)

    const [pipelineLogs, tickets, sessions, metrics] = await Promise.allSettled([
      db.select().from(aiPipelineLogs)
        .where(and(eq(aiPipelineLogs.entityId, entityId), gte(aiPipelineLogs.createdAt, since30d)))
        .orderBy(desc(aiPipelineLogs.createdAt))
        .limit(500),
      db.select().from(kibiSupportTickets)
        .where(and(eq(kibiSupportTickets.entityId, entityId), gte(kibiSupportTickets.openedAt, since30d)))
        .orderBy(desc(kibiSupportTickets.openedAt))
        .limit(100),
      db.select().from(aiSessions)
        .where(and(eq(aiSessions.entityId, entityId), eq(aiSessions.type, 'entity_ai')))
        .orderBy(desc(aiSessions.updatedAt))
        .limit(1),
      db.query.entityMetrics.findFirst({ where: (t, { eq }) => eq(t.entityId, entityId) }),
    ])

    const logs     = pipelineLogs.status === 'fulfilled' ? pipelineLogs.value : []
    const tkts     = tickets.status === 'fulfilled' ? tickets.value : []
    const mtx      = metrics.status === 'fulfilled' ? metrics.value : null

    // AI activity
    const todayLogs   = logs.filter(l => l.createdAt >= today)
    const intentCounts = { support: 0, sales: 0, info: 0, general: 0 }
    const intentRoles  = ['support_problem', 'sales_intent', 'db_query']
    logs.forEach(l => {
      if (l.modelRole === 'support_problem') intentCounts.support++
      if (l.modelRole === 'sales_intent')    intentCounts.sales++
      if (l.modelRole === 'db_query')        intentCounts.info++
      if (l.modelRole === 'master_conversation') intentCounts.general++
    })
    const totalIntent = Object.values(intentCounts).reduce((a, b) => a + b, 0) || 1
    const kbWritten   = logs.filter(l => l.kbWritten).length
    const escalated   = logs.filter(l => l.escalated).length

    // Tickets
    const openTickets     = tkts.filter(t => t.status === 'open' || t.status === 'in_progress').length
    const resolvedTickets = tkts.filter(t => t.status === 'resolved' || t.status === 'closed').length

    const data = {
      aiActivity: {
        todayConversations:   todayLogs.length,
        monthConversations:   logs.length,
        intentDistribution: {
          support: Math.round(intentCounts.support / totalIntent * 100),
          sales:   Math.round(intentCounts.sales   / totalIntent * 100),
          info:    Math.round(intentCounts.info    / totalIntent * 100),
          general: Math.round(intentCounts.general / totalIntent * 100),
        },
        escalatedCount:   escalated,
        kbEntriesAdded:   kbWritten,
        avgLatencyMs:     logs.length ? Math.round(logs.reduce((a, l) => a + (l.latencyMs ?? 0), 0) / logs.length) : 0,
      },
      supportSummary: {
        openTickets,
        resolvedThisMonth: resolvedTickets,
        recentTickets:     tkts.slice(0, 5).map(t => ({
          id: t.id, ticketNumber: t.ticketNumber, subject: t.subject,
          status: t.status, priority: t.priority, openedAt: t.openedAt,
        })),
      },
      usage: {
        monthMessages:     (mtx as any)?.currentMonthMessages ?? 0,
        totalAiSessions:   (sessions.status === 'fulfilled' ? sessions.value : []).length,
      },
    }

    await redis.setex(cacheKey, 300, JSON.stringify(data))
    return data
  })

  // ── GET /dashboard/admin — KIBI Admin Dashboard ───────────────────────────
  app.get('/admin', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; role?: string }
    if ((user as any).role !== 'admin' && (user as any).role !== 'supervisor') {
      return reply.status(403).send({ error: 'Yetersiz yetki' })
    }

    const cacheKey = `dashboard:admin`
    const cached   = await redis.get(cacheKey).catch(() => null)
    if (cached) return JSON.parse(cached)

    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [entityCount, allLogs, allTickets] = await Promise.allSettled([
      db.select({ count: sql<number>`count(*)` }).from(kibiEntities),
      db.select().from(aiPipelineLogs).where(gte(aiPipelineLogs.createdAt, since30d)).limit(1000),
      db.select().from(kibiSupportTickets).where(gte(kibiSupportTickets.openedAt, since30d)).limit(200),
    ])

    const entities = entityCount.status === 'fulfilled' ? Number(entityCount.value[0]?.count ?? 0) : 0
    const logs     = allLogs.status === 'fulfilled' ? allLogs.value : []
    const tickets  = allTickets.status === 'fulfilled' ? allTickets.value : []

    const successLogs = logs.filter(l => l.success)
    const data = {
      platform: {
        totalEntities:   entities,
        activeThisMonth: logs.map(l => l.entityId).filter(Boolean).length,
      },
      aiUsage: {
        totalRequests:   logs.length,
        successRate:     logs.length ? Math.round(successLogs.length / logs.length * 100) : 0,
        escalatedCount:  logs.filter(l => l.escalated).length,
        kbWrittenCount:  logs.filter(l => l.kbWritten).length,
        avgLatencyMs:    logs.length ? Math.round(logs.reduce((a, l) => a + (l.latencyMs ?? 0), 0) / logs.length) : 0,
        byRole:          logs.reduce((acc: Record<string, number>, l) => {
          acc[l.modelRole] = (acc[l.modelRole] ?? 0) + 1; return acc
        }, {}),
      },
      supportOverview: {
        totalOpenTickets:     tickets.filter(t => t.status === 'open').length,
        totalResolvedThisMonth: tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length,
        urgentTickets:        tickets.filter(t => t.priority === 'high').length,
      },
    }

    await redis.setex(cacheKey, 300, JSON.stringify(data))
    return data
  })

  // ── GET /dashboard/pipeline-logs — AI Log Table ───────────────────────────
  app.get('/pipeline-logs', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user    = req.user as { sub: string; tenantId: string }
    const entityId = await resolveEntityId(user.tenantId)
    if (!entityId) return reply.status(404).send({ error: 'Entity bulunamadı' })

    const { limit = '50', role, success } = req.query as Record<string, string>

    const logs = await db.select().from(aiPipelineLogs)
      .where(eq(aiPipelineLogs.entityId, entityId))
      .orderBy(desc(aiPipelineLogs.createdAt))
      .limit(Math.min(Number(limit), 200))

    const filtered = logs.filter(l => {
      if (role    && l.modelRole !== role)          return false
      if (success && String(l.success) !== success) return false
      return true
    })

    const summary = {
      total:        filtered.length,
      successRate:  filtered.length ? Math.round(filtered.filter(l => l.success).length / filtered.length * 100) : 0,
      escalatedCount: filtered.filter(l => l.escalated).length,
      avgLatencyMs: filtered.length ? Math.round(filtered.reduce((a, l) => a + (l.latencyMs ?? 0), 0) / filtered.length) : 0,
    }

    return { logs: filtered, summary }
  })
}

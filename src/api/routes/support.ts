import type { FastifyPluginAsync } from 'fastify'
import { nanoid } from 'nanoid'
import { db } from '../../lib/db.js'
import { kibiEntities, kibiSupportTickets, kibiSupportMessages, kibiEntityUsers, kibiSupportAgents, users } from '../../../db/schema.js'
import { eq, and, desc, asc } from 'drizzle-orm'
import { processNewTicket, resolveTicket } from '../../engine/kibi/support-pipeline.js'
import { runAgent } from '../../engine/ai/agent.js'
import { routeReplyToExternal } from '../../engine/kibi/ticket-router.js'

// Role hierarchy for escalation: lower index → escalates to higher
const ROLE_HIERARCHY = ['entity_external', 'entity_sub', 'entity_supervisor', 'entity_main', 'supervisor', 'admin'] as const
type KibiRole = (typeof ROLE_HIERARCHY)[number]

export const supportRoutes: FastifyPluginAsync = async (app) => {
  app.get('/tickets', { onRequest: [app.authenticate] }, async (req) => {
    const user = req.user as { sub: string; tenantId: string }
    const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, user.tenantId) })
    if (!entity) return { tickets: [] }
    const { status, priority } = req.query as Record<string, string>
    const tickets = await db.query.kibiSupportTickets.findMany({
      where: (t, { eq, and }) => {
        const conditions = [eq(t.entityId, entity.id)]
        if (status) conditions.push(eq(t.status, status as any))
        if (priority) conditions.push(eq(t.priority, priority as any))
        return and(...conditions)
      },
      orderBy: (t, { desc }) => [desc(t.openedAt)],
    })
    return { tickets }
  })

  app.post('/tickets', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    const { subject, serviceCategory, contactChannel, description } = req.body as any
    if (!subject || !serviceCategory || !contactChannel || !description) {
      return reply.status(400).send({ error: 'subject, serviceCategory, contactChannel ve description gerekli' })
    }

    const isUUID = (s: string | null | undefined) =>
      !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

    if (!isUUID(user.tenantId)) {
      return reply.status(400).send({ error: 'Destek talebi oluşturmak için bir entity hesabına bağlı olmanız gereklidir.' })
    }

    const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, user.tenantId) })
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı. Lütfen admin ile iletişime geçin.' })

    const ticketNumber = `TKT-${nanoid(8).toUpperCase()}`
    const [ticket] = await db.insert(kibiSupportTickets).values({
      ticketNumber,
      entityId: entity.id,
      userId: user.sub,
      clientId: entity.clientId,
      serviceCategory,
      subject,
      status: 'open',
      priority: 'medium',
      contactChannel,
      openedAt: new Date(),
    }).returning()

    processNewTicket({ ticketId: ticket.id, message: description, entityId: entity.id, userId: user.sub }).catch(console.error)
    return reply.status(201).send({ ticket: { id: ticket.id, ticketNumber: ticket.ticketNumber, status: ticket.status, estimatedResponse: 'KIBI analiz ediyor.' } })
  })

  app.get('/tickets/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, user.tenantId) })
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı' })
    const { id } = req.params as { id: string }
    const ticket = await db.query.kibiSupportTickets.findFirst({ where: (t, { and, eq }) => and(eq(t.id, id), eq(t.entityId, entity.id)) })
    return { ticket }
  })

  app.get('/tickets/:id/kibi-response', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, user.tenantId) })
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı' })
    const { id } = req.params as { id: string }
    const ticket = await db.query.kibiSupportTickets.findFirst({ where: (t, { and, eq }) => and(eq(t.id, id), eq(t.entityId, entity.id)) })
    if (!ticket) return reply.status(404).send({ error: 'Ticket bulunamadı' })
    const result = await resolveTicket(id)
    return { kibiResponse: result }
  })

  app.get('/tickets/:id/messages', { onRequest: [app.authenticate] }, async (req) => {
    const user = req.user as { sub: string; tenantId: string }
    const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, user.tenantId) })
    if (!entity) return { messages: [] }
    const { id } = req.params as { id: string }
    const ticket = await db.query.kibiSupportTickets.findFirst({ where: (t, { and, eq }) => and(eq(t.id, id), eq(t.entityId, entity.id)) })
    if (!ticket) return { messages: [] }
    const messages = await db.query.kibiSupportMessages.findMany({
      where: (t, { eq }) => eq(t.ticketId, id),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    })
    return { messages }
  })

  app.post('/tickets/:id/messages', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, user.tenantId) })
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı' })
    const { id } = req.params as { id: string }
    const ticket = await db.query.kibiSupportTickets.findFirst({ where: (t, { and, eq }) => and(eq(t.id, id), eq(t.entityId, entity.id)) })
    if (!ticket) return reply.status(404).send({ error: 'Ticket bulunamadı' })
    const { content, senderType = 'agent' } = req.body as any
    if (!content) return reply.status(400).send({ error: 'content gerekli' })
    const [msg] = await db.insert(kibiSupportMessages).values({
      ticketId: id,
      senderType: senderType as any,
      content,
      channel: 'web',
    }).returning()

    // Route agent reply back to external customer (fire-and-forget)
    if (senderType === 'agent' && (ticket as any).externalContactId) {
      routeReplyToExternal(id, content).catch(e => console.error('[Support] outbound route failed:', e))
    }
    return reply.status(201).send({ message: msg })
  })

  app.put('/tickets/:id/status', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, user.tenantId) })
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı' })
    const { id } = req.params as { id: string }
    const { status } = req.body as { status: string }
    if (!status) return reply.status(400).send({ error: 'status gerekli' })
    await db.update(kibiSupportTickets).set({ status: status as any }).where(and(eq(kibiSupportTickets.id, id), eq(kibiSupportTickets.entityId, entity.id)))
    return reply.send({ ok: true })
  })

  app.put('/tickets/:id/priority', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, user.tenantId) })
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı' })
    const { id } = req.params as { id: string }
    const { priority } = req.body as { priority: string }
    if (!priority) return reply.status(400).send({ error: 'priority gerekli' })
    await db.update(kibiSupportTickets).set({ priority: priority as any }).where(and(eq(kibiSupportTickets.id, id), eq(kibiSupportTickets.entityId, entity.id)))
    return reply.send({ ok: true })
  })

  // ── POST /support/tickets/:id/escalate ────────────────────────────────────────
  app.post('/tickets/:id/escalate', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role?: string }
    const { id } = req.params as { id: string }

    const isUUID = (s: string | null | undefined) =>
      !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

    if (!isUUID(user.tenantId)) {
      return reply.status(403).send({ error: 'Eskalasyon için entity bağlantısı gerekli' })
    }

    const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, user.tenantId) })
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı' })

    const ticket = await db.query.kibiSupportTickets.findFirst({
      where: (t, { and, eq }) => and(eq(t.id, id), eq(t.entityId, entity.id))
    })
    if (!ticket) return reply.status(404).send({ error: 'Ticket bulunamadı' })

    const currentRole = (user.role ?? 'entity_sub') as KibiRole
    const currentIdx  = ROLE_HIERARCHY.indexOf(currentRole)
    const nextRole    = ROLE_HIERARCHY[currentIdx + 1] as KibiRole | undefined

    if (!nextRole) return reply.status(400).send({ error: 'Daha üst yönetim kademesi yok' })

    // Find the target user for escalation
    let escalateTo: string | undefined
    if (nextRole === 'supervisor' || nextRole === 'admin') {
      const platformUser = await db.query.users.findFirst({
        where: (t, { eq }) => eq(t.role, nextRole as any)
      })
      escalateTo = platformUser?.id ?? undefined
    } else {
      // Entity-level role: look in kibi_entity_users
      const entityUser = await db.query.kibiEntityUsers.findFirst({
        where: (t, { and, eq }) => and(eq(t.entityId, entity.id), eq(t.role, nextRole))
      })
      escalateTo = entityUser?.userId ?? undefined
    }

    await db.update(kibiSupportTickets).set({
      status: 'escalated',
      escalatedTo: escalateTo,
      escalatedAt: new Date(),
    }).where(and(eq(kibiSupportTickets.id, id), eq(kibiSupportTickets.entityId, entity.id)))

    await db.insert(kibiSupportMessages).values({
      ticketId: id,
      senderType: 'system',
      content: `Ticket üst yönetim kademesine (${nextRole}) gönderildi.`,
      channel: 'system',
    })

    return reply.send({ ok: true, escalatedTo: escalateTo, nextRole })
  })

  // ── POST /support/tickets/:id/ai-draft ────────────────────────────────────────
  app.post('/tickets/:id/ai-draft', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    const { id } = req.params as { id: string }

    const isUUID = (s: string | null | undefined) =>
      !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

    if (!isUUID(user.tenantId)) {
      return reply.status(403).send({ error: 'AI Draft için entity bağlantısı gerekli' })
    }

    const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.entityId, user.tenantId) })
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı' })

    const ticket = await db.query.kibiSupportTickets.findFirst({
      where: (t, { and, eq }) => and(eq(t.id, id), eq(t.entityId, entity.id))
    })
    if (!ticket) return reply.status(404).send({ error: 'Ticket bulunamadı' })

    const messages = await db.query.kibiSupportMessages.findMany({
      where: (t, { eq }) => eq(t.ticketId, id),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
      limit: 20,
    })

    const history = messages
      .map(m => `${m.senderType === 'customer' ? 'Müşteri' : 'Destek'}: ${m.content}`)
      .join('\n')

    try {
      const result = await runAgent({
        tenantId:    user.tenantId,
        sessionId:   `draft_${id}_${Date.now()}`,
        userMessage: `Sen ${entity.companyName ?? 'bu şirketin'} destek temsilcisisin. Aşağıdaki destek ticket'ı için müşteriye profesyonel, nazik ve çözüm odaklı bir yanıt taslağı hazırla.\n\nTicket Konusu: ${ticket.subject}\nKategori: ${ticket.categoryL1 ?? 'Genel'}\n\nSohbet Geçmişi:\n${history || '(Henüz mesaj yok)'}\n\nSadece yanıt metnini yaz, başka açıklama ekleme.`,
        channel:     'web',
        isAdmin:     false,
      })
      return reply.send({ draft: result.response })
    } catch (e: any) {
      return reply.status(500).send({ error: 'AI taslak oluşturulamadı: ' + e.message })
    }
  })

  // ── GET /support/admin/tickets (admin/supervisor — any entity) ───────────
  app.get('/admin/tickets', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; role?: string }
    if (user.role !== 'admin' && user.role !== 'supervisor') {
      return reply.status(403).send({ error: 'Yetkisiz' })
    }
    const { status, entityId } = req.query as Record<string, string>
    const tickets = await db.query.kibiSupportTickets.findMany({
      where: (t, { eq, and }) => {
        const conds: any[] = []
        if (status) conds.push(eq(t.status, status as any))
        if (entityId) conds.push(eq(t.entityId, entityId))
        return conds.length ? and(...conds) : undefined
      },
      orderBy: (t, { desc }) => [desc(t.openedAt)],
      limit: 100,
    })
    return reply.send({ tickets })
  })

  // ── GET /support/agents — list support agents for entity ──────────────────
  app.get('/agents', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string | null }
    const isUUID = (s: string | null | undefined) =>
      !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
    if (!isUUID(user.tenantId)) return reply.send({ agents: [] })

    const entity = await db.query.kibiEntities.findFirst({
      where: (t, { eq }) => eq(t.entityId, user.tenantId!),
      columns: { id: true },
    })
    if (!entity) return reply.send({ agents: [] })

    const agents = await db.query.kibiSupportAgents.findMany({
      where: (t, { eq }) => eq(t.entityId, entity.id),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    })

    // Enrich with user details
    const enriched = await Promise.all(agents.map(async a => {
      const u = await db.query.users.findFirst({
        where: (t, { eq }) => eq(t.id, a.userId),
        columns: { name: true, email: true },
      })
      return { ...a, userName: u?.name ?? null, userEmail: u?.email ?? null }
    }))

    return reply.send({ agents: enriched })
  })

  // ── POST /support/agents — register current user as support agent ──────────
  app.post('/agents', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string | null; role?: string }
    const isUUID = (s: string | null | undefined) =>
      !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
    if (!isUUID(user.tenantId)) return reply.status(403).send({ error: 'Entity bağlantısı gerekli' })

    const entity = await db.query.kibiEntities.findFirst({
      where: (t, { eq }) => eq(t.entityId, user.tenantId!),
      columns: { id: true },
    })
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı' })

    const { channelPreference = 'email', waPhone, telegramChatId, notificationEmail, weight = 1 } = req.body as any

    const [agent] = await db.insert(kibiSupportAgents).values({
      entityId:           entity.id,
      userId:             user.sub,
      channelPreference,
      waPhone:            waPhone ?? null,
      telegramChatId:     telegramChatId ?? null,
      notificationEmail:  notificationEmail ?? null,
      weight:             Math.max(1, Math.min(10, Number(weight) || 1)),
      isActive:           true,
    }).onConflictDoUpdate({
      target: [kibiSupportAgents.entityId, kibiSupportAgents.userId],
      set: {
        channelPreference,
        waPhone:           waPhone ?? null,
        telegramChatId:    telegramChatId ?? null,
        notificationEmail: notificationEmail ?? null,
        weight:            Math.max(1, Math.min(10, Number(weight) || 1)),
        isActive:          true,
        updatedAt:         new Date(),
      },
    }).returning()

    return reply.status(201).send({ agent })
  })

  // ── PUT /support/agents/me — update own agent settings ─────────────────────
  app.put('/agents/me', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string | null }
    const isUUID = (s: string | null | undefined) =>
      !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
    if (!isUUID(user.tenantId)) return reply.status(403).send({ error: 'Entity bağlantısı gerekli' })

    const entity = await db.query.kibiEntities.findFirst({
      where: (t, { eq }) => eq(t.entityId, user.tenantId!),
      columns: { id: true },
    })
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı' })

    const { channelPreference, waPhone, telegramChatId, notificationEmail, weight, isActive } = req.body as any

    await db.update(kibiSupportAgents)
      .set({
        ...(channelPreference !== undefined && { channelPreference }),
        ...(waPhone !== undefined           && { waPhone }),
        ...(telegramChatId !== undefined    && { telegramChatId }),
        ...(notificationEmail !== undefined && { notificationEmail }),
        ...(weight !== undefined            && { weight: Math.max(1, Math.min(10, Number(weight) || 1)) }),
        ...(isActive !== undefined          && { isActive: Boolean(isActive) }),
        updatedAt: new Date(),
      })
      .where(and(eq(kibiSupportAgents.entityId, entity.id), eq(kibiSupportAgents.userId, user.sub)))

    return reply.send({ ok: true })
  })

  // ── PUT /support/agents/:agentId/weight — update agent weight (entity_main only) ──
  app.put('/agents/:agentId/weight', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string | null; role?: string }
    const { agentId } = req.params as { agentId: string }
    const { weight } = req.body as { weight: number }

    if (!['entity_main', 'admin', 'supervisor'].includes(user.role ?? '')) {
      return reply.status(403).send({ error: 'Yetki gerekli' })
    }
    const isUUID = (s: string | null | undefined) =>
      !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
    if (!isUUID(user.tenantId)) return reply.status(403).send({ error: 'Entity bağlantısı gerekli' })

    const entity = await db.query.kibiEntities.findFirst({
      where: (t, { eq }) => eq(t.entityId, user.tenantId!),
      columns: { id: true },
    })
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı' })

    await db.update(kibiSupportAgents)
      .set({ weight: Math.max(1, Math.min(10, Number(weight) || 1)), updatedAt: new Date() })
      .where(and(eq(kibiSupportAgents.id, agentId), eq(kibiSupportAgents.entityId, entity.id)))

    return reply.send({ ok: true })
  })
}

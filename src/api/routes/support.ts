import type { FastifyPluginAsync } from 'fastify'
import { nanoid } from 'nanoid'
import { db } from '../../lib/db.js'
import { kibiEntities, kibiSupportTickets, kibiSupportMessages } from '../../../db/schema.js'
import { eq, and, desc, asc } from 'drizzle-orm'
import { processNewTicket, resolveTicket } from '../../engine/kibi/support-pipeline.js'

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
}

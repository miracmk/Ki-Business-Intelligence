import nodemailer from 'nodemailer'
import { nanoid } from 'nanoid'
import { db } from '../../lib/db.js'
import { defaultGateway } from '../ai/gateway.js'
import { extractIntent } from './intent-extractor.js'
import { getModelChain } from './models.js'
import { searchKnowledge } from './qdrant-search.js'
import { upsertKnowledge } from '../../lib/qdrant.js'
import { env } from '../../../config/env.js'
import { kibiSupportTickets, kibiSupportMessages, kibiSupportKnowledge, kibiInternalUsers, users } from '../../../db/schema.js'
import { eq, and } from 'drizzle-orm'

async function sendSupportEmail(to: string, subject: string, body: string) {
  try {
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT),
      secure: Number(env.SMTP_PORT) === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      html: `<div>${body.replace(/\n/g, '<br/>')}</div>`,
    })
  } catch (e) {
    console.error('[Support Pipeline] SMTP error (non-fatal):', e)
  }
}

export async function processNewTicket(params: { ticketId: string; message: string; entityId: string; userId: string }): Promise<void> {
  const ticket = await db.query.kibiSupportTickets.findFirst({ where: (t, { eq }) => eq(t.id, params.ticketId) })
  if (!ticket) return

  const intentResult = await extractIntent({ message: params.message, entityId: params.entityId })
  await db.update(kibiSupportTickets).set({
    intent: intentResult.intent,
    mood: intentResult.mood,
    urgencyScore: intentResult.urgency,
    priority: intentResult.suggestedPriority,
    answeringMood: intentResult.recommendedTone,
    categoryL1: intentResult.intent,
    categoryL2: intentResult.suggestedPriority,
    categoryL3: intentResult.recommendedTone,
  }).where(eq(kibiSupportTickets.id, params.ticketId))

  await refineTicket(params.ticketId, params.message)
  await resolveTicket(params.ticketId)
}

export async function resolveTicket(ticketId: string): Promise<{ resolved: boolean; response?: string }> {
  const ticket = await db.query.kibiSupportTickets.findFirst({ where: (t, { eq }) => eq(t.id, ticketId) })
  if (!ticket) return { resolved: false }

  const queryText = `${ticket.subject ?? ''} ${ticket.resolutionSummary ?? ''}`.trim()
  const knowledge = await searchKnowledge({ query: queryText || (ticket.subject ?? ''), collection: 'ki_support_kb', limit: 5 })

  if (knowledge.results.length > 0) {
    const resolverChain = await getModelChain('support_resolver', ticket.entityId)
    const systemPrompt = `Sen bir destek çözüm uzmanısın. Aşağıdaki ticket bilgilerini kullanarak kısa ve profesyonel bir müşteri cevabı hazırla.`
    const userPrompt = `Ticket Özeti:\n${ticket.subject}\nKategori: ${ticket.categoryL1 || 'unknown'}\nMood: ${ticket.mood || 'neutral'}\nBilgiler:\n${knowledge.results.map((r) => `${r.source}: ${r.content}`).join('\n')}`

    const resolverResult = await defaultGateway.completeWithFallback([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], resolverChain, { temperature: 0.3, maxTokens: 500 })

    const rawAnswer = resolverResult.content?.trim() ?? 'Çözüm önerisi üretilemedi.'
    const answer = await refineAnswer(rawAnswer, ticket)
    await db.update(kibiSupportTickets).set({ status: 'resolved', resolvedBy: 'kibi', resolutionSummary: answer, firstResponseAt: new Date(), closedAt: new Date() }).where(eq(kibiSupportTickets.id, ticketId))
    await sendTicketAnswer(ticketId, answer, ticket.contactChannel === 'email' ? 'email' : 'whatsapp')
    return { resolved: true, response: answer }
  }

  await escalateTicket(ticketId)
  return { resolved: false }
}

async function refineTicket(ticketId: string, message: string): Promise<void> {
  const ticket = await db.query.kibiSupportTickets.findFirst({ where: (t, { eq }) => eq(t.id, ticketId) })
  if (!ticket) return

  const chain = await getModelChain('support_refine', ticket.entityId)
  const prompt = `Ticket konusunu kategorize et ve L1-L4 hiyerarşisi olarak JSON döndür.\nTicket: ${ticket.subject}\nAçıklama: ${message}`
  const result = await defaultGateway.completeWithFallback([
    { role: 'system', content: 'Sen bir destek kategorize uzmanısın. Çıktıyı sadece JSON olarak ver.' },
    { role: 'user', content: prompt },
  ], chain, { temperature: 0.2, maxTokens: 300 })

  try {
    const parsed = JSON.parse(result.content || '{}')
    await db.update(kibiSupportTickets).set({
      categoryL1: parsed.categoryL1 ?? ticket.categoryL1,
      categoryL2: parsed.categoryL2 ?? ticket.categoryL2,
      categoryL3: parsed.categoryL3 ?? ticket.categoryL3,
      categoryL4: parsed.categoryL4 ?? ticket.categoryL4,
    }).where(eq(kibiSupportTickets.id, ticketId))
  } catch {
    // Ignore parse errors; keep intent-based categories
  }
}

async function refineAnswer(rawAnswer: string, ticket: any): Promise<string> {
  const chain = await getModelChain('support_answering', ticket.entityId)
  const prompt = `Aşağıdaki çözümü müşteriye uygun ve nazik bir şekilde özetle. Ticket konusu: ${ticket.subject}\nÇözüm: ${rawAnswer}`
  const result = await defaultGateway.completeWithFallback([
    { role: 'system', content: 'Sen bir müşteri yanıt uzmanısın. İzleyiciye net, nazik ve çözüm odaklı bir cevap yaz.' },
    { role: 'user', content: prompt },
  ], chain, { temperature: 0.3, maxTokens: 400 })
  return result.content?.trim() ?? rawAnswer
}

export async function escalateTicket(ticketId: string): Promise<void> {
  const ticket = await db.query.kibiSupportTickets.findFirst({ where: (t, { eq }) => eq(t.id, ticketId) })
  if (!ticket) return

  const managers = await db.query.kibiInternalUsers.findMany({ where: (t, { and, eq }) => and(eq(t.internalRole, 'support_manager'), eq(t.isActive, true)) })
  const escalatedToUserId = managers[0]?.userId ?? null
  await db.update(kibiSupportTickets).set({ status: 'escalated', escalatedTo: escalatedToUserId ?? undefined, escalatedAt: new Date() }).where(eq(kibiSupportTickets.id, ticketId))

  const emails = await Promise.all(managers.map(async (manager) => {
    const user = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, manager.userId) })
    return user?.email
  }))

  const recipients = emails.filter(Boolean) as string[]
  if (recipients.length > 0) {
    await sendSupportEmail(recipients.join(','), `Destek Talebi Eskalasyonu: ${ticket.ticketNumber}`, `Ticket ${ticket.ticketNumber} için destek ekibine eskalasyon yapıldı. Konu: ${ticket.subject}`)
  }

  await db.insert(kibiSupportMessages).values({
    ticketId,
    senderType: 'system',
    content: 'Bu ticket KIBI tarafından çözülemedi ve destek ekibine eskale edildi.',
    channel: 'system',
  })
  console.log(`[Support] Ticket ${ticket.ticketNumber} escalated to support managers.`)
}

export async function learnFromTicket(ticketId: string): Promise<void> {
  const ticket = await db.query.kibiSupportTickets.findFirst({ where: (t, { eq }) => eq(t.id, ticketId) })
  if (!ticket || ticket.status !== 'resolved') return

  const messages = await db.query.kibiSupportMessages.findMany({ where: (t, { eq }) => eq(t.ticketId, ticketId) })
  const problem = ticket.subject
  const responseText = messages.filter((m) => m.senderType !== 'customer').map((m) => m.content).join('\n')

  const [knowledge] = await db.insert(kibiSupportKnowledge).values({
    categoryL1: ticket.categoryL1,
    categoryL2: ticket.categoryL2,
    categoryL3: ticket.categoryL3,
    problemSummary: problem,
    solutionSteps: [{ answer: responseText }],
    sourceTicketIds: [ticket.id],
    successRate: 100,
    qdrantId: nanoid(12),
    isIndexed: false,
  } as any).returning()

  if (knowledge) {
    await upsertKnowledge('ki_support_kb', [{ id: knowledge.qdrantId ?? nanoid(12), text: responseText, payload: { ticketId: ticket.id, source: ticket.ticketNumber ?? 'unknown' } }])
    await db.update(kibiSupportKnowledge).set({ isIndexed: true }).where(eq(kibiSupportKnowledge.id, knowledge.id))
  }
}

export async function sendTicketAnswer(ticketId: string, answer: string, channel: 'whatsapp' | 'email'): Promise<void> {
  const ticket = await db.query.kibiSupportTickets.findFirst({ where: (t, { eq }) => eq(t.id, ticketId) })
  if (!ticket) return

  if (channel === 'email') {
    const userId = ticket.userId
    if (userId) {
      const user = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, userId) })
      if (user?.email) {
        await sendSupportEmail(user.email, `Destek Talebiniz: ${ticket.subject ?? ''}`, answer)
      }
    }
  } else {
    console.log(`[Support] WhatsApp mesajı gönderildi: ${answer}`)
  }

  await db.insert(kibiSupportMessages).values({ ticketId, senderType: 'kibi', content: answer, channel })
}

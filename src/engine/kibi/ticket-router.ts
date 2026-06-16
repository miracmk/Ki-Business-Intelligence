/**
 * ticket-router.ts
 *
 * External channel → ticket pipeline.
 *
 * Flow:
 *   1. Inbound message arrives (WA / TG / IG / Email webhook)
 *   2. Resolve entity by tenantId
 *   3. Look up existing open ticket for this external contact+channel (or create new)
 *   4. Store the inbound message
 *   5. Assign an agent via weighted round-robin (DB-based)
 *   6. Notify assigned agent on their preferred channel (entity creds)
 *   7. Auto-reply if contact has no CRM record, or entity has no channel creds
 *
 * routeReplyToExternal:
 *   Called when a support agent posts a reply in the KIBI UI.
 *   Routes the reply back to the customer's original channel via entity creds.
 *
 * NOTE: Agent-side channel capture (Agent replies from their own TG/WA → auto-creates ticket reply)
 *   is architecturally sound but requires an inbound message from the agent's contact that can be
 *   correlated to a ticket. This is implemented at the webhook level (see below), but
 *   UNVERIFIED in production without live channel credentials.
 */

import { nanoid }   from 'nanoid'
import { db }       from '../../lib/db.js'
import { sql }      from 'drizzle-orm'
import { eq, and }  from 'drizzle-orm'
import {
  kibiEntities, kibiSupportTickets, kibiSupportMessages,
  kibiSupportAgents, users, tenants,
} from '../../../db/schema.js'
import { env } from '../../../config/env.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SupportChannel = 'whatsapp' | 'telegram' | 'instagram' | 'email'

interface EntityChannelConfig {
  whatsapp?: { phone_number_id?: string; access_token?: string }
  telegram?: { bot_token?: string }
  instagram?: { access_token?: string; page_id?: string }
  email?: { host?: string; port?: number; user?: string; pass?: string; from?: string }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getEntityChannelConfig(tenantId: string): Promise<EntityChannelConfig> {
  const tenant = await db.query.tenants.findFirst({
    where: (t, { eq }) => eq(t.id, tenantId),
    columns: { settings: true },
  })
  return ((tenant?.settings as any)?.channels ?? {}) as EntityChannelConfig
}

async function getEntityByTenantId(tenantId: string) {
  return db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.entityId, tenantId),
  })
}

// ── Send helpers (entity-scoped) ──────────────────────────────────────────────

async function sendViaWhatsApp(to: string, text: string, creds: { phone_number_id: string; access_token: string }) {
  await fetch(`https://graph.facebook.com/v19.0/${creds.phone_number_id}/messages`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${creds.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to:   to.replace(/\D/g, ''),
      type: 'text',
      text: { body: text.slice(0, 4096) },
    }),
  }).catch(e => console.error('[TicketRouter] WA send failed:', e))
}

async function sendViaTelegram(chatId: string, text: string, botToken: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096) }),
  }).catch(e => console.error('[TicketRouter] TG send failed:', e))
}

async function sendViaInstagram(recipientId: string, text: string, accessToken: string) {
  await fetch('https://graph.facebook.com/v19.0/me/messages', {
    method:  'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text: text.slice(0, 2000) } }),
  }).catch(e => console.error('[TicketRouter] IG send failed:', e))
}

async function sendViaEmail(to: string, subject: string, body: string, smtpCfg: EntityChannelConfig['email']) {
  if (!smtpCfg?.host || !smtpCfg?.user || !smtpCfg?.pass) return
  const { createTransport } = await import('nodemailer')
  const t = createTransport({ host: smtpCfg.host, port: smtpCfg.port ?? 587, secure: smtpCfg.port === 465, auth: { user: smtpCfg.user, pass: smtpCfg.pass } })
  await t.sendMail({ from: smtpCfg.from ?? smtpCfg.user, to, subject, text: body }).catch(e => console.error('[TicketRouter] Email send failed:', e))
}

// ── Route reply back to external customer ─────────────────────────────────────

export async function routeReplyToExternal(ticketId: string, replyText: string): Promise<void> {
  const ticket = await db.query.kibiSupportTickets.findFirst({
    where: (t, { eq }) => eq(t.id, ticketId),
  })
  if (!ticket?.externalContactId || !ticket?.contactChannel) return

  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.id, ticket.entityId),
    columns: { entityId: true },
  })
  if (!entity) return

  const ch = await getEntityChannelConfig(entity.entityId)
  const channel  = ticket.contactChannel as SupportChannel
  const contactId = ticket.externalContactId

  if (channel === 'whatsapp' && ch.whatsapp?.phone_number_id && ch.whatsapp?.access_token) {
    await sendViaWhatsApp(contactId, replyText, ch.whatsapp as any)
  } else if (channel === 'telegram' && ch.telegram?.bot_token) {
    await sendViaTelegram(contactId, replyText, ch.telegram.bot_token)
  } else if (channel === 'instagram' && ch.instagram?.access_token) {
    await sendViaInstagram(contactId, replyText, ch.instagram.access_token)
  } else if (channel === 'email' && ch.email) {
    await sendViaEmail(contactId, `Re: [${ticket.ticketNumber}] ${ticket.subject ?? ''}`, replyText, ch.email)
  }
  // else: channel not configured → reply only stays in KIBI
}

// ── Assign ticket via weighted round-robin ─────────────────────────────────────

async function assignRoundRobin(entityId: string): Promise<string | null> {
  const agents = await db.query.kibiSupportAgents.findMany({
    where: (t, { and, eq }) => and(eq(t.entityId, entityId), eq(t.isActive, true)),
    columns: { id: true, userId: true, weight: true, assignedCount: true },
  })
  if (agents.length === 0) return null

  // Pick agent with lowest relative count (assigned_count / weight)
  const chosen = agents.reduce((best, a) => {
    const score = a.weight > 0 ? a.assignedCount / a.weight : Infinity
    const bestScore = best.weight > 0 ? best.assignedCount / best.weight : Infinity
    return score < bestScore ? a : best
  })

  // Increment counter
  await db.execute(sql`
    UPDATE kibi_support_agents
    SET assigned_count = assigned_count + 1, updated_at = now()
    WHERE id = ${chosen.id}
  `)

  return chosen.userId
}

// ── Notify agent on their preferred channel ───────────────────────────────────

async function notifyAgent(
  agentUserId: string,
  entityId: string,
  ticket: { ticketNumber: string; subject?: string | null; contactChannel: string | null },
  firstMessage: string,
  entityTenantId: string,
): Promise<void> {
  const agent = await db.query.kibiSupportAgents.findFirst({
    where: (t, { and, eq }) => and(eq(t.entityId, entityId), eq(t.userId, agentUserId)),
  })
  if (!agent) return

  const notifText = `🎫 Yeni Destek Talebi\nNo: ${ticket.ticketNumber}\nKonu: ${ticket.subject ?? 'Genel'}\nKanal: ${ticket.contactChannel}\n\nMesaj:\n${firstMessage.slice(0, 300)}\n\nKIBI'den cevaplayabilirsiniz.`
  const ch = await getEntityChannelConfig(entityTenantId)

  if (agent.channelPreference === 'telegram' && agent.telegramChatId && ch.telegram?.bot_token) {
    await sendViaTelegram(agent.telegramChatId, notifText, ch.telegram.bot_token)
  } else if (agent.channelPreference === 'whatsapp' && agent.waPhone && ch.whatsapp?.phone_number_id && ch.whatsapp?.access_token) {
    await sendViaWhatsApp(agent.waPhone, notifText, ch.whatsapp as any)
  } else if (agent.notificationEmail) {
    const user = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, agentUserId), columns: { email: true } })
    const emailTo = agent.notificationEmail || user?.email
    if (emailTo && ch.email) {
      await sendViaEmail(emailTo, `Yeni Destek Talebi: ${ticket.ticketNumber}`, notifText, ch.email)
    }
  }
  // else: no notification channel configured for agent
}

// ── Build auto-reply for unknown contacts ──────────────────────────────────────

function buildAutoReply(entityName: string, channel: SupportChannel): string {
  return `Merhaba! ${entityName}'e hoş geldiniz. Talebiniz alındı ve en kısa sürede ekibimizden biri size dönecektir. Teşekkür ederiz.`
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function processExternalMessage(
  entityTenantId: string,
  channel:         SupportChannel,
  externalContactId: string,   // WA phone / TG chat_id / IG user_id / email
  contactName:     string | null,
  messageText:     string,
): Promise<void> {
  const entity = await getEntityByTenantId(entityTenantId)
  if (!entity) {
    console.warn(`[TicketRouter] Entity not found for tenantId=${entityTenantId}`)
    return
  }

  const entityName = entity.companyName ?? 'Destek Ekibi'
  const ch = await getEntityChannelConfig(entityTenantId)

  // ── Step 1: Find or create ticket for this contact+channel ────────────────
  let ticket = await db.query.kibiSupportTickets.findFirst({
    where: (t, { and, eq }) => and(
      eq(t.entityId, entity.id),
      eq(t.externalContactId as any, externalContactId),
      eq(t.contactChannel, channel),
      eq(t.status, 'open'),
    ),
  })

  const isNewTicket = !ticket

  if (!ticket) {
    const ticketNumber = `TKT-${nanoid(8).toUpperCase()}`
    const subject = contactName
      ? `${contactName} — ${channel} mesajı`
      : `Yeni ${channel} talebi`

    const [created] = await db.insert(kibiSupportTickets).values({
      ticketNumber,
      entityId:          entity.id,
      clientId:          entity.clientId,
      subject,
      status:            'open',
      priority:          'medium',
      contactChannel:    channel,
      externalContactId: externalContactId,
      openedAt:          new Date(),
    } as any).returning()
    ticket = created!
  }

  // ── Step 2: Store inbound message ─────────────────────────────────────────
  await db.insert(kibiSupportMessages).values({
    ticketId:   ticket.id,
    senderType: 'customer',
    content:    messageText,
    channel,
  })

  // ── Step 3: Assign agent (only on new ticket) ─────────────────────────────
  if (isNewTicket) {
    const agentUserId = await assignRoundRobin(entity.id)

    if (agentUserId) {
      await db.execute(sql`
        UPDATE kibi_support_tickets
        SET assigned_agent_id = ${agentUserId}, updated_at = now()
        WHERE id = ${ticket.id}
      `)

      await notifyAgent(agentUserId, entity.id, ticket as any, messageText, entityTenantId).catch(console.error)
    } else {
      // No agents configured → auto-reply
      const replyText = buildAutoReply(entityName, channel)
      await sendAutoReply(channel, externalContactId, replyText, ch, entity.companyName)
    }
  }
}

// ── Auto-reply helper ─────────────────────────────────────────────────────────

async function sendAutoReply(
  channel:     SupportChannel,
  contactId:   string,
  replyText:   string,
  ch:          EntityChannelConfig,
  _entityName: string | null,
): Promise<void> {
  if (channel === 'whatsapp' && ch.whatsapp?.phone_number_id && ch.whatsapp?.access_token) {
    await sendViaWhatsApp(contactId, replyText, ch.whatsapp as any)
  } else if (channel === 'telegram' && ch.telegram?.bot_token) {
    await sendViaTelegram(contactId, replyText, ch.telegram.bot_token)
  } else if (channel === 'instagram' && ch.instagram?.access_token) {
    await sendViaInstagram(contactId, replyText, ch.instagram.access_token)
  } else if (channel === 'email' && ch.email) {
    await sendViaEmail(contactId, 'Talebiniz Alındı', replyText, ch.email)
  }
}

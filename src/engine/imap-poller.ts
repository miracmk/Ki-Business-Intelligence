/**
 * IMAP Polling Service
 * Polls each entity's IMAP inbox at configured interval.
 * Creates or appends support tickets from incoming emails.
 * If auto-reply is enabled, generates an AI response via KIBI and sends it.
 */

import { db } from '../lib/db.js'
import { emailConfigs, kibiEntities, kibiSupportTickets, kibiSupportMessages } from '../../db/schema.js'
import { decryptJson } from '../lib/crypto.js'
import { runAgent } from './ai/agent.js'
import nodemailer from 'nodemailer'
import { nanoid } from 'nanoid'

interface EmailCreds {
  smtp?: { host: string; port: number; secure: boolean; user: string; password: string }
  imap?: {
    host: string; port: number; secure: boolean; user: string; password: string
    inboxFolder: string; checkIntervalMinutes: number; autoReply: boolean
  }
}

// Track per-entity poller timers
const pollerHandles = new Map<string, ReturnType<typeof setTimeout>>()

async function pollEntityInbox(tenantId: string, creds: EmailCreds) {
  if (!creds.imap?.host || !creds.imap?.user) return
  const imap = creds.imap

  try {
    const { ImapFlow } = await import('imapflow')
    const client = new ImapFlow({
      host: imap.host, port: imap.port, secure: imap.secure,
      auth: { user: imap.user, pass: imap.password },
      logger: false,
    })

    await client.connect()
    const lock = await client.getMailboxLock(imap.inboxFolder || 'INBOX')

    try {
      // Fetch unseen messages
      for await (const msg of client.fetch('1:*', { envelope: true, source: true }, { uid: true })) {
        if (!msg.envelope) continue

        const subject     = msg.envelope.subject ?? '(Konusuz)'
        const fromAddr    = msg.envelope.from?.[0]?.address ?? ''
        const messageId   = msg.envelope.messageId ?? ''
        const bodyText    = msg.source?.toString() ?? ''

        // Resolve entity record from tenantId
        const entity = await db.query.kibiEntities.findFirst({
          where: (t, { eq }) => eq(t.entityId, tenantId),
        }).catch(() => null)

        if (!entity) continue

        // Prevent duplicate (dedup via messageId in ticket subject)
        const dedupSubject = `${subject} [${messageId.slice(0, 20)}]`
        const existing = await db.query.kibiSupportTickets.findFirst({
          where: (t, { and, eq }) => and(eq(t.entityId, entity.id), eq(t.subject, dedupSubject)),
        }).catch(() => null)

        if (existing) continue

        // Create support ticket
        const ticketNumber = `TKT-${nanoid(8).toUpperCase()}`
        const [ticket] = await db.insert(kibiSupportTickets).values({
          ticketNumber,
          entityId:       entity.id,
          clientId:       entity.clientId,
          subject:        dedupSubject,
          status:         'open',
          priority:       'medium',
          contactChannel: 'email',
        }).returning().catch(() => [])

        if (!ticket) continue

        await db.insert(kibiSupportMessages).values({
          ticketId:   ticket.id,
          senderType: 'customer',
          content:    bodyText.slice(0, 4000),
          channel:    'email',
        }).catch(() => {})

        // Auto-reply via AI if enabled
        if (imap.autoReply && creds.smtp?.host) {
          try {
            const result = await runAgent({
              tenantId,
              sessionId:   `email_${ticket.id}`,
              userMessage: `E-posta gelen kutusundan gelen müşteri mesajı:\nGönderen: ${fromAddr}\nKonu: ${subject}\nMesaj:\n${bodyText.slice(0, 2000)}`,
              channel:     'email',
            })

            const smtp = creds.smtp
            const transporter = nodemailer.createTransport({
              host: smtp.host, port: smtp.port, secure: smtp.secure,
              auth: { user: smtp.user, pass: smtp.password },
            })

            await transporter.sendMail({
              from:    `"${smtp.user}" <${smtp.user}>`,
              to:      fromAddr,
              subject: `Re: ${subject}`,
              text:    result.response,
            })

            await db.insert(kibiSupportMessages).values({
              ticketId:   ticket.id,
              senderType: 'kibi',
              content:    result.response,
              channel:    'email',
            }).catch(() => {})
          } catch (e) {
            console.error(`[IMAP POLLER] Auto-reply error for ${tenantId}:`, e)
          }
        }

        // Mark as seen
        await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen']).catch(() => {})
      }
    } finally {
      lock.release()
    }

    await client.logout()
  } catch (e) {
    console.error(`[IMAP POLLER] Poll error for tenant ${tenantId}:`, e)
  }
}

async function schedulePoller(tenantId: string, creds: EmailCreds) {
  const intervalMinutes = creds.imap?.checkIntervalMinutes ?? 5
  const intervalMs = intervalMinutes * 60 * 1000

  const handle = setTimeout(async () => {
    await pollEntityInbox(tenantId, creds)
    // Re-schedule after completion
    pollerHandles.delete(tenantId)
    schedulePoller(tenantId, creds)
  }, intervalMs)

  pollerHandles.set(tenantId, handle)
}

export async function startImapPollers() {
  try {
    const configs = await db.select().from(emailConfigs)

    for (const cfg of configs) {
      if (!cfg.credentials) continue
      try {
        const creds = decryptJson<EmailCreds>(cfg.credentials)
        if (!creds.imap?.host || !creds.imap?.autoReply) continue
        console.log(`[IMAP POLLER] Starting poller for tenant ${cfg.tenantId} (${creds.imap.checkIntervalMinutes}min)`)
        schedulePoller(cfg.tenantId, creds)
      } catch { /* bad credentials, skip */ }
    }
  } catch (e) {
    console.error('[IMAP POLLER] Failed to start pollers:', e)
  }
}

export function stopImapPollers() {
  for (const [, handle] of pollerHandles) clearTimeout(handle)
  pollerHandles.clear()
}

// Reload a specific tenant's poller (call after config save)
export async function reloadTenantPoller(tenantId: string) {
  const existing = pollerHandles.get(tenantId)
  if (existing) { clearTimeout(existing); pollerHandles.delete(tenantId) }

  const cfg = await db.query.emailConfigs.findFirst({
    where: (t, { eq }) => eq(t.tenantId, tenantId),
  }).catch(() => null)

  if (!cfg?.credentials) return
  try {
    const creds = decryptJson<EmailCreds>(cfg.credentials)
    if (creds.imap?.host && creds.imap?.autoReply) {
      schedulePoller(tenantId, creds)
    }
  } catch { /* ignore */ }
}

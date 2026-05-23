import type { FastifyPluginAsync } from 'fastify'
import { env } from '../../../config/env.js'
import { processBulkCallback }  from '../../engine/crm-sync/bulk-sync.js'
import { processNotification }  from '../../engine/crm-sync/notification.js'
import { runAgent }             from '../../engine/ai/agent.js'
import type { BulkCallbackPayload } from '../../engine/crm-sync/bulk-sync.js'
import type { NotificationPayload } from '../../engine/crm-sync/notification.js'

export const webhookRoutes: FastifyPluginAsync = async (app) => {

  // ── CRM bulk read callback (Zoho calls this when job=COMPLETED) ───────────
  app.post('/crm/bulk-callback', async (req, reply) => {
    reply.status(200).send('OK')  // respond immediately like n8n

    const connectionId = (req.query as Record<string, string>)['connectionId']
    if (!connectionId) return

    const payload = (req.body as { body?: BulkCallbackPayload })?.body
                 ?? req.body as BulkCallbackPayload

    processBulkCallback(connectionId, payload)
      .then((r) => app.log.info({ r }, 'Bulk callback processed'))
      .catch((e) => app.log.error({ e }, 'Bulk callback error'))
  })

  // ── CRM real-time notification ────────────────────────────────────────────
  app.post('/crm/notification', async (req, reply) => {
    reply.status(200).send('OK')

    const connectionId = (req.query as Record<string, string>)['connectionId']
    if (!connectionId) return

    const body = (req.body as { body?: NotificationPayload })?.body
              ?? req.body as NotificationPayload

    const payload: NotificationPayload = {
      module:    body?.module ?? '',
      operation: body?.operation ?? '',
      ids:       Array.isArray(body?.ids) ? body.ids.map(String) : [],
    }

    processNotification(connectionId, payload)
      .then((r) => app.log.info({ r }, 'Notification processed'))
      .catch((e) => app.log.error({ e }, 'Notification error'))
  })

  // ── WhatsApp Cloud API — webhook verification (GET) ───────────────────────
  app.get('/whatsapp', async (req, reply) => {
    const q = req.query as Record<string, string>
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === env.WA_WEBHOOK_VERIFY_TOKEN) {
      return reply.send(q['hub.challenge'])
    }
    return reply.status(403).send('Forbidden')
  })

  // ── WhatsApp Cloud API — incoming messages (POST) ─────────────────────────
  app.post('/whatsapp', async (req, reply) => {
    reply.status(200).send('OK')  // must respond < 20s

    const body  = req.body as any
    const entry = body?.entry?.[0]?.changes?.[0]?.value
    if (!entry?.messages) return

    for (const msg of entry.messages as Array<Record<string, any>>) {
      const from = String(msg['from'] ?? '')
      const text = msg['type'] === 'text' ? String(msg['text']?.body ?? '') : null
      if (!text) continue

      const profileName = entry.contacts?.[0]?.profile?.name ?? null

      // Resolve tenant from WA number (in production: lookup by phone or use default tenant)
      const tenantId = await resolveTenantByChannel('whatsapp', from)
      if (!tenantId) continue

      runAgent({
        tenantId,
        sessionId:   `wa_${from}`,
        userMessage: text,
        channel:     'whatsapp',
        firstName:   profileName,
      }).then((out) => {
        // Send reply back via WA Cloud API
        sendWhatsAppMessage(from, out.response).catch(console.error)
      }).catch(console.error)
    }
  })

  // ── Telegram bot webhook ───────────────────────────────────────────────────
  app.post('/telegram', async (req, reply) => {
    reply.status(200).send('OK')
    if (!env.TELEGRAM_BOT_TOKEN) return

    const update = req.body as any
    const msg    = update?.message
    if (!msg?.text) return

    const chatId    = String(msg.chat?.id ?? '')
    const text      = String(msg.text ?? '')
    const firstName = msg.from?.first_name ?? null

    const tenantId = await resolveTenantByChannel('telegram', chatId)
    if (!tenantId) return

    runAgent({
      tenantId,
      sessionId:   `tg_${chatId}`,
      userMessage: text,
      channel:     'telegram',
      firstName,
    }).then((out) => {
      sendTelegramMessage(chatId, out.response).catch(console.error)
    }).catch(console.error)
  })
}

// ── Channel send helpers ──────────────────────────────────────────────────────
async function sendWhatsAppMessage(to: string, text: string) {
  await fetch(
    `https://graph.facebook.com/v19.0/${env.WA_PHONE_NUMBER_ID}/messages`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace(/\D/g, ''),
        type: 'text',
        text: { body: text },
      }),
    }
  )
}

async function sendTelegramMessage(chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
}

// ── Tenant resolution ─────────────────────────────────────────────────────────
// In MVP: returns first active tenant. In production: lookup by channel config.
async function resolveTenantByChannel(_channel: string, _id: string): Promise<string | null> {
  const { db } = await import('../../lib/db.js')
  const tenant = await db.query.tenants.findFirst({
    where: (t, { eq }) => eq(t.isActive, true),
  })
  return tenant?.id ?? null
}

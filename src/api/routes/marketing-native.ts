// YFZ 34 Faz 5d: Marketing Management — native paid add-on (addon_marketing).
// Email campaigns (segmented by crm_contacts.contact_type) + social post calendar.
// Email sending reuses the tenant's existing SMTP channel config
// (tenants.settings.channels.email) — no new email infrastructure. AI content
// generation for social posts cross-depends on the separate ai_premium
// entitlement (Premium upsell): addon_marketing alone only allows manual drafts.
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import nodemailer from 'nodemailer'
import { db } from '../../lib/db.js'
import { queryEntitySchema } from '../../lib/entity-provisioner.js'
import { hasActiveEntitlement } from '../../lib/entitlements.js'
import { aiComplete } from '../../engine/ai/gateway.js'
import { getModelForRole } from '../../engine/ai/model-config.js'

const campaignSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().optional(),
  segment: z.enum(['all', 'lead', 'contact', 'customer', 'partner', 'vendor']).optional(),
})

const socialPostSchema = z.object({
  platform: z.enum(['instagram', 'facebook', 'twitter', 'linkedin', 'tiktok']),
  content: z.string().optional(),
  status: z.enum(['draft', 'scheduled', 'published']).optional(),
  scheduledAt: z.string().optional(),
})

const generateSchema = z.object({
  platform: z.enum(['instagram', 'facebook', 'twitter', 'linkedin', 'tiktok']),
  topic: z.string().min(1),
})

async function resolveEntityContext(tenantId: string | null): Promise<{ entityId: string; schema: string } | null> {
  const isUUID = (s: string | null | undefined) =>
    !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  if (!isUUID(tenantId)) return null
  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.entityId, tenantId!),
    columns: { id: true, entityDbSchema: true, isProvisioned: true },
  })
  if (!entity?.isProvisioned || !entity.entityDbSchema) return null
  return { entityId: entity.id, schema: entity.entityDbSchema }
}

export const marketingNativeRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const user = req.user as { tenantId: string | null; role?: string } | undefined
    if (!user) return
    if (user.role === 'admin' || user.role === 'supervisor') return
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    if (!(await hasActiveEntitlement(ctx.entityId, 'addon_marketing'))) {
      return reply.status(402).send({ error: 'Marketing Management add-on aktif değil. Lütfen modülü etkinleştirin.' })
    }
  })

  // ── Email campaigns ────────────────────────────────────────────────────────
  app.get('/campaigns', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const campaigns = await queryEntitySchema(ctx.schema, `
      SELECT id, name, subject, segment, status, scheduled_at AS "scheduledAt", sent_at AS "sentAt",
             recipient_count AS "recipientCount", sent_count AS "sentCount", failed_count AS "failedCount",
             created_at AS "createdAt"
      FROM crm_email_campaigns ORDER BY created_at DESC
    `)
    return { campaigns }
  })

  app.post('/campaigns', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = campaignSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO crm_email_campaigns (name, subject, body, segment)
      VALUES ($1, $2, $3, $4) RETURNING id, name, subject, segment, status
    `, [body.data.name, body.data.subject, body.data.body ?? null, body.data.segment ?? 'all'])
    return reply.status(201).send({ campaign: rows[0] })
  })

  app.delete('/campaigns/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await queryEntitySchema(ctx.schema, `DELETE FROM crm_email_campaigns WHERE id = $1 AND status = 'draft'`, [id])
    return { ok: true }
  })

  // POST /campaigns/:id/send — sends now via the tenant's configured SMTP channel
  app.post('/campaigns/:id/send', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }

    const [campaign] = await queryEntitySchema(ctx.schema, `SELECT * FROM crm_email_campaigns WHERE id = $1`, [id])
    if (!campaign) return reply.status(404).send({ error: 'Kampanya bulunamadı' })
    if (campaign.status !== 'draft') return reply.status(400).send({ error: 'Sadece taslak kampanyalar gönderilebilir' })

    const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId!) })
    const emailCfg = (tenant?.settings as any)?.channels?.email
    if (!emailCfg?.host) return reply.status(400).send({ error: 'E-posta kanalı (SMTP) yapılandırılmamış. Ayarlar > Kanallar üzerinden ekleyin.' })

    const segmentClause = campaign.segment === 'all' ? '' : 'AND contact_type = $1'
    const segmentParams = campaign.segment === 'all' ? [] : [campaign.segment]
    const recipients = await queryEntitySchema(ctx.schema, `
      SELECT email, full_name AS "fullName" FROM crm_contacts
      WHERE deleted_at IS NULL AND email IS NOT NULL ${segmentClause}
    `, segmentParams)

    const transporter = nodemailer.createTransport({
      host: emailCfg.host, port: Number(emailCfg.port ?? 587),
      secure: emailCfg.encryption === 'SSL/TLS',
      auth: { user: emailCfg.username, pass: emailCfg.password },
    })

    let sent = 0, failed = 0
    for (const r of recipients) {
      try {
        await transporter.sendMail({ from: emailCfg.username, to: r.email, subject: campaign.subject, html: campaign.body ?? '' })
        sent++
      } catch { failed++ }
    }

    await queryEntitySchema(ctx.schema, `
      UPDATE crm_email_campaigns SET status = 'sent', sent_at = NOW(), recipient_count = $1, sent_count = $2, failed_count = $3, updated_at = NOW()
      WHERE id = $4
    `, [recipients.length, sent, failed, id])

    return { ok: true, recipientCount: recipients.length, sentCount: sent, failedCount: failed }
  })

  // ── Social posts ───────────────────────────────────────────────────────────
  app.get('/social-posts', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const posts = await queryEntitySchema(ctx.schema, `
      SELECT id, platform, content, ai_generated AS "aiGenerated", status,
             scheduled_at AS "scheduledAt", published_at AS "publishedAt", created_at AS "createdAt"
      FROM crm_social_posts ORDER BY COALESCE(scheduled_at, created_at) DESC
    `)
    return { posts }
  })

  app.post('/social-posts', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = socialPostSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO crm_social_posts (platform, content, status, scheduled_at)
      VALUES ($1, $2, $3, $4) RETURNING id, platform, content, status
    `, [body.data.platform, body.data.content ?? null, body.data.status ?? 'draft', body.data.scheduledAt ?? null])
    return reply.status(201).send({ post: rows[0] })
  })

  app.delete('/social-posts/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await queryEntitySchema(ctx.schema, `DELETE FROM crm_social_posts WHERE id = $1`, [id])
    return { ok: true }
  })

  // POST /social-posts/generate — AI content draft. Cross-depends on ai_premium
  // (Premium upsell), separate from addon_marketing — both must be active.
  app.post('/social-posts/generate', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null; role?: string }
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const isAdmin = user.role === 'admin' || user.role === 'supervisor'
    if (!isAdmin && !(await hasActiveEntitlement(ctx.entityId, 'ai_premium'))) {
      return reply.status(402).send({ error: 'AI içerik üretimi için KiBI AI (Premium) gereklidir.' })
    }
    const body = generateSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { primary } = await getModelForRole('master_conversation', 'entity', ctx.entityId)
    const result = await aiComplete(primary, [
      { role: 'system', content: `Sen bir sosyal medya içerik uzmanısın. ${body.data.platform} platformu için kısa, etkili bir gönderi metni yaz. Sadece metni döndür, açıklama ekleme.` },
      { role: 'user', content: body.data.topic },
    ], ctx.entityId)

    return { content: result.content }
  })
}

import type { FastifyPluginAsync } from 'fastify'
import { db } from '../../lib/db.js'
import { aiConfigs, emailConfigs, tenantMemberships, tenants, users, platformConfigs, kibiModelConfigs, knowledgeEntries, kibiEntities, kibiEntityUsers, kibiPricingPackages, kbDocuments, fileStorage } from '../../../db/schema.js'
import { encryptJson, decryptJson, encrypt, decrypt } from '../../lib/crypto.js'
import { eq, and, count as sqlCount } from 'drizzle-orm'
import { getPlanUsage, getAllPlanDefs } from '../../lib/plan-limits.js'
import nodemailer from 'nodemailer'
import * as argon2 from 'argon2'
import { nanoid } from 'nanoid'
import { env } from '../../../config/env.js'
import { PROVIDERS, getConfigKey, KIBI_FREE_MODEL, pingProviderModel } from '../../engine/ai/providers.js'
import { invalidateProviderKeyCache } from '../../engine/ai/gateway.js'
import { redis } from '../../lib/redis.js'
import { qdrant, embedConfigured } from '../../lib/qdrant.js'
import { chargeAndAddSubUser, getEntityPackage } from '../../engine/billing/billing.js'
import { indexDocument, deleteDocumentFromIndex } from '../../engine/knowledge/indexer.js'
import { detectFileType, extractText } from '../../engine/knowledge/file-extractor.js'
import { normalizedFileName } from '../../engine/knowledge/chunking.js'
import { createWriteStream, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

const isUUID = (s: string | null | undefined): s is string =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

const PLAN_TO_MODEL_SCOPE: Record<string, string> = {
  free:          'entity_free',
  basic:         'entity_basic',
  premium:       'entity_premium',
  enterprise:    'entity_enterprise',
  custom_models: 'entity_custom_models',
}

// Entity Main her zaman; entity_supervisor sadece kibiEntityUsers.permissions.manageCompanyProfile=true ise
// Şirket Profili / Ekip yönetimi yapabilir. Platform admin/supervisor destek amaçlı her zaman yetkili.
async function canManageCompanyProfile(user: { sub: string; tenantId: string; role: string }): Promise<boolean> {
  if (['entity_main', 'admin', 'supervisor'].includes(user.role)) return true
  if (user.role !== 'entity_supervisor') return false
  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.entityId, user.tenantId),
    columns: { id: true },
  })
  if (!entity) return false
  const entityUser = await db.query.kibiEntityUsers.findFirst({
    where: (t, { and, eq }) => and(eq(t.entityId, entity.id), eq(t.userId, user.sub)),
    columns: { permissions: true },
  })
  return (entityUser?.permissions as Record<string, boolean> | undefined)?.manageCompanyProfile === true
}

// API anahtarı / model rolü ataması sadece Custom Model paketinde aktiftir.
async function requireCustomModelsPlan(tenantId: string): Promise<boolean> {
  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.entityId, tenantId),
    columns: { planName: true },
  })
  return entity?.planName === 'custom_models'
}

export const tenantRoutes: FastifyPluginAsync = async (app) => {

  // GET /api/v1/tenants/me
  app.get('/me', { onRequest: [app.authenticate] }, async (req) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    const [tenant, dbUser] = await Promise.all([
      isUUID(user.tenantId)
        ? db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) })
        : Promise.resolve(null),
      db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, user.sub) }),
    ])
    const tenantSettings = (tenant?.settings ?? {}) as Record<string, any>
    const profileExtras = tenantSettings.profiles?.[user.sub] ?? {}
    return {
      tenant,
      role: user.role,
      totpSecret: dbUser?.totpSecret ?? null,
      profile: {
        name:    dbUser?.name   ?? '',
        email:   dbUser?.email  ?? '',
        phone:   dbUser?.phone  ?? '',
        address: profileExtras.address ?? '',
        avatar:  profileExtras.avatar  ?? '',
      },
    }
  })

  // PUT /api/v1/tenants/me/settings
  app.put('/me/settings', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    const { language, timezone } = req.body as { language?: string; timezone?: string }
    const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) })
    const existing = (tenant?.settings ?? {}) as Record<string, unknown>
    await db.update(tenants)
      .set({ settings: { ...existing, ...(language ? { language } : {}), ...(timezone ? { timezone } : {}) } as any })
      .where(eq(tenants.id, user.tenantId))
    return reply.send({ ok: true })
  })

  // GET /api/v1/tenants/plan
  app.get('/plan', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    const usage = await getPlanUsage(user.tenantId).catch(() => null)
    if (!usage) return reply.status(404).send({ error: 'Plan bilgisi bulunamadı' })
    return usage
  })

  // GET /api/v1/tenants/plans — tüm plan seçenekleri (kibi_pricing_packages)
  app.get('/plans', async () => {
    return getAllPlanDefs()
  })

  // GET /api/v1/tenants/storage-usage
  app.get('/storage-usage', { onRequest: [app.authenticate] }, async (req) => {
    const user = req.user as { sub: string; tenantId: string }
    const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) })
    return { usedBytes: tenant?.storageUsedBytes ?? 0, limitBytes: tenant?.storageLimitBytes ?? 1073741824 }
  })

  // PUT /api/v1/tenants/me/profile — update user profile (name, phone, address, avatar)
  app.put('/me/profile', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    const { name, phone, address, avatar } = req.body as { name?: string; phone?: string; address?: string; avatar?: string }

    if (name !== undefined || phone !== undefined) {
      await db.update(users)
        .set({
          ...(name  !== undefined ? { name }  : {}),
          ...(phone !== undefined ? { phone } : {}),
        })
        .where(eq(users.id, user.sub))
    }

    // Store address and avatar in tenant.settings.profiles[userId]
    if ((address !== undefined || avatar !== undefined) && isUUID(user.tenantId)) {
      const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) })
      const existing = (tenant?.settings ?? {}) as Record<string, any>
      const profiles = existing.profiles ?? {}
      profiles[user.sub] = { ...profiles[user.sub], ...(address !== undefined ? { address } : {}), ...(avatar !== undefined ? { avatar } : {}) }
      await db.update(tenants).set({ settings: { ...existing, profiles } as any }).where(eq(tenants.id, user.tenantId))
    }

    return reply.send({ ok: true })
  })

  // PUT /api/v1/tenants/me/company — update company name (entity_main only)
  app.put('/me/company', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Entity bağlantısı gerekli' })
    if (user.role !== 'entity_main' && user.role !== 'admin') return reply.status(403).send({ error: 'Yalnızca entity_main kullanıcılar şirket adını değiştirebilir' })

    const { name } = req.body as { name: string }
    if (!name?.trim()) return reply.status(400).send({ error: 'Şirket adı boş olamaz' })

    await db.update(tenants).set({ name: name.trim() }).where(eq(tenants.id, user.tenantId))
    return reply.send({ ok: true })
  })

  // GET /api/v1/tenants/channels/:channel — read channel config from tenant settings
  app.get('/channels/:channel', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    const { channel } = req.params as { channel: string }
    if (!isUUID(user.tenantId)) return reply.send({ config: null })

    const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) })
    const settings = (tenant?.settings ?? {}) as Record<string, any>
    return reply.send({ config: settings.channels?.[channel] ?? null })
  })

  // PUT /api/v1/tenants/channels/:channel — save channel config to tenant settings
  app.put('/channels/:channel', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    const { channel } = req.params as { channel: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Entity bağlantısı gerekli' })
    if (!['entity_main', 'admin', 'supervisor'].includes(user.role)) return reply.status(403).send({ error: 'Yetkisiz' })

    const config = req.body as Record<string, any>
    const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) })
    const existing = (tenant?.settings ?? {}) as Record<string, any>
    const channels = existing.channels ?? {}
    channels[channel] = config
    await db.update(tenants).set({ settings: { ...existing, channels } as any }).where(eq(tenants.id, user.tenantId))
    return reply.send({ ok: true })
  })

  // DELETE /api/v1/tenants/channels/:channel — remove channel config
  app.delete('/channels/:channel', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    const { channel } = req.params as { channel: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Entity bağlantısı gerekli' })

    const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) })
    const existing = (tenant?.settings ?? {}) as Record<string, any>
    const channels = { ...(existing.channels ?? {}) }
    delete channels[channel]
    await db.update(tenants).set({ settings: { ...existing, channels } as any }).where(eq(tenants.id, user.tenantId))
    return reply.send({ ok: true })
  })

  // PUT /api/v1/tenants/ai-config — set AI provider, key, and dual-model config
  app.put('/ai-config', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    if (!isUUID(user.tenantId)) {
      return reply.status(400).send({ error: 'AI yapılandırması için entity bağlantısı gerekli. Admin kullanıcılar Platform Ayarları\'nı kullanmalıdır.' })
    }
    if (!['admin', 'supervisor'].includes(user.role) && !await requireCustomModelsPlan(user.tenantId)) {
      return reply.status(403).send({ error: 'Bu özellik sadece Custom Model paketinde aktiftir.' })
    }
    const body = req.body as {
      provider?:              string
      model?:                 string
      apiKey?:                string
      analysisModel?:         string
      conversationModel?:     string
      vectorModel?:           string
      analysisFallbacks?:     string[]
      conversationFallback?:  string
      conversationF2?:        string
      vectorFallbacks?:       string[]
      kibiInstructions?:      string
      entityInstructions?:    string
    }

    const existing = await db.query.aiConfigs.findFirst({
      where: (t, { eq }) => eq(t.tenantId, user.tenantId),
    })

    const existingSettings = (existing?.settings ?? {}) as Record<string, unknown>

    const newSettings = {
      ...existingSettings,
      ...(body.analysisModel       !== undefined ? { analysisModel:       body.analysisModel }       : {}),
      ...(body.conversationModel   !== undefined ? { conversationModel:   body.conversationModel }   : {}),
      ...(body.vectorModel         !== undefined ? { vectorModel:         body.vectorModel }         : {}),
      ...(body.analysisFallbacks   !== undefined ? { analysisFallbacks:   body.analysisFallbacks }   : {}),
      ...(body.conversationFallback !== undefined ? { conversationFallback: body.conversationFallback } : {}),
      ...(body.conversationF2      !== undefined ? { conversationF2:      body.conversationF2 }      : {}),
      ...(body.vectorFallbacks      !== undefined ? { vectorFallbacks:     body.vectorFallbacks }     : {}),
      ...(body.kibiInstructions    !== undefined ? { kibiInstructions:   body.kibiInstructions }   : {}),
      ...(body.entityInstructions  !== undefined ? { entityInstructions: body.entityInstructions } : {}),
    }

    if (existing) {
      await db.update(aiConfigs)
        .set({
          provider: (body.provider ?? existing.provider) as any,
          model:    body.model ?? existing.model,
          apiKey:   body.apiKey !== undefined
            ? (body.apiKey ? encryptJson(body.apiKey) : null)
            : existing.apiKey,
          settings: newSettings as any,
        })
        .where(eq(aiConfigs.id, existing.id))
    } else {
      await db.insert(aiConfigs).values({
        tenantId:  user.tenantId,
        provider:  (body.provider ?? 'openrouter') as any,
        model:     body.model ?? 'meta-llama/llama-3.3-70b-instruct:free',
        apiKey:    body.apiKey ? encryptJson(body.apiKey) : null,
        isDefault: true,
        settings:  newSettings as any,
      })
    }
    return reply.send({ ok: true })
  })

  // ── Email config (SMTP + IMAP) ────────────────────────────────────────────────

  // GET /api/v1/tenants/email-config
  app.get('/email-config', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    if (!isUUID(user.tenantId)) return reply.send({ config: null })

    const cfg = await db.query.emailConfigs.findFirst({
      where: (t, { eq }) => eq(t.tenantId, user.tenantId),
    })
    if (!cfg) return reply.send({ config: null })

    let creds: Record<string, any> = {}
    try { creds = decryptJson<Record<string, any>>(cfg.credentials) } catch { /* corrupt */ }

    // Return config with passwords masked
    return reply.send({
      config: {
        id: cfg.id,
        name: cfg.name,
        fromName: cfg.fromName,
        fromEmail: cfg.fromEmail,
        smtp: {
          host: creds.smtp?.host ?? '',
          port: creds.smtp?.port ?? 587,
          secure: creds.smtp?.secure ?? false,
          user: creds.smtp?.user ?? '',
          hasPassword: !!creds.smtp?.password,
        },
        imap: {
          host: creds.imap?.host ?? '',
          port: creds.imap?.port ?? 993,
          secure: creds.imap?.secure ?? true,
          user: creds.imap?.user ?? '',
          hasPassword: !!creds.imap?.password,
          inboxFolder: creds.imap?.inboxFolder ?? 'INBOX',
          checkIntervalMinutes: creds.imap?.checkIntervalMinutes ?? 5,
          autoReply: creds.imap?.autoReply ?? false,
        },
      },
    })
  })

  // PUT /api/v1/tenants/email-config
  app.put('/email-config', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Entity bağlantısı gerekli' })
    if (!['entity_main', 'admin'].includes(user.role)) return reply.status(403).send({ error: 'Yetkisiz' })

    const body = req.body as {
      fromName?: string; fromEmail?: string
      smtp?: { host?: string; port?: number; secure?: boolean; user?: string; password?: string }
      imap?: { host?: string; port?: number; secure?: boolean; user?: string; password?: string
               inboxFolder?: string; checkIntervalMinutes?: number; autoReply?: boolean }
    }

    const existing = await db.query.emailConfigs.findFirst({
      where: (t, { eq }) => eq(t.tenantId, user.tenantId),
    })

    let existingCreds: Record<string, any> = {}
    if (existing?.credentials) {
      try { existingCreds = decryptJson<Record<string, any>>(existing.credentials) } catch { /* ignore */ }
    }

    const smtpBody = body.smtp ?? {}
    const imapBody = body.imap ?? {}

    const newCreds = {
      smtp: {
        ...existingCreds.smtp,
        ...smtpBody,
        // Don't overwrite existing password if new one not provided
        password: smtpBody.password ?? existingCreds.smtp?.password ?? '',
      },
      imap: {
        ...existingCreds.imap,
        ...imapBody,
        password: imapBody.password ?? existingCreds.imap?.password ?? '',
      },
    }

    const encrypted = encryptJson(newCreds)

    if (existing) {
      await db.update(emailConfigs).set({
        fromName:    body.fromName  ?? existing.fromName,
        fromEmail:   body.fromEmail ?? existing.fromEmail,
        credentials: encrypted,
        updatedAt:   new Date(),
      }).where(eq(emailConfigs.id, existing.id))
    } else {
      await db.insert(emailConfigs).values({
        tenantId:    user.tenantId,
        name:        'Varsayılan E-posta',
        provider:    'smtp',
        fromName:    body.fromName  ?? '',
        fromEmail:   body.fromEmail ?? '',
        credentials: encrypted,
        isDefault:   true,
      })
    }
    return reply.send({ ok: true })
  })

  // POST /api/v1/tenants/channels/email/test-smtp
  app.post('/channels/email/test-smtp', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Entity bağlantısı gerekli' })

    const { host, port, secure, user: smtpUser, password } = req.body as {
      host: string; port: number; secure: boolean; user: string; password: string
    }
    if (!host || !smtpUser) return reply.status(400).send({ error: 'host ve kullanıcı gerekli' })

    // If no password in request, try to use saved password
    let finalPassword = password
    if (!finalPassword) {
      const cfg = await db.query.emailConfigs.findFirst({ where: (t, { eq }) => eq(t.tenantId, user.tenantId) })
      if (cfg?.credentials) {
        try {
          const creds = decryptJson<any>(cfg.credentials)
          finalPassword = creds.smtp?.password ?? ''
        } catch { /* ignore */ }
      }
    }

    try {
      const transporter = nodemailer.createTransport({ host, port, secure, auth: { user: smtpUser, pass: finalPassword } })
      await transporter.verify()
      return reply.send({ ok: true })
    } catch (e: any) {
      return reply.status(400).send({ ok: false, error: e.message })
    }
  })

  // POST /api/v1/tenants/channels/email/test-imap
  app.post('/channels/email/test-imap', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Entity bağlantısı gerekli' })

    const { host, port, secure, user: imapUser, password } = req.body as {
      host: string; port: number; secure: boolean; user: string; password: string
    }
    if (!host || !imapUser) return reply.status(400).send({ error: 'host ve kullanıcı gerekli' })

    let finalPassword = password
    if (!finalPassword) {
      const cfg = await db.query.emailConfigs.findFirst({ where: (t, { eq }) => eq(t.tenantId, user.tenantId) })
      if (cfg?.credentials) {
        try {
          const creds = decryptJson<any>(cfg.credentials)
          finalPassword = creds.imap?.password ?? ''
        } catch { /* ignore */ }
      }
    }

    try {
      const { ImapFlow } = await import('imapflow')
      const client = new ImapFlow({
        host, port: Number(port), secure,
        auth: { user: imapUser, pass: finalPassword },
        logger: false,
      })
      await client.connect()
      const list = await client.list()
      const mailboxes = list.map((m: any) => m.path)
      await client.logout()
      return reply.send({ ok: true, folders: mailboxes })
    } catch (e: any) {
      return reply.status(400).send({ ok: false, error: e.message })
    }
  })

  // ── External users ────────────────────────────────────────────────────────────

  // POST /api/v1/tenants/external-users — entity_main creates external customer account
  app.post('/external-users', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Entity bağlantısı gerekli' })
    if (!['entity_main', 'admin'].includes(user.role)) return reply.status(403).send({ error: 'Yetkisiz' })

    const { email, name, phone } = req.body as { email: string; name?: string; phone?: string }
    if (!email) return reply.status(400).send({ error: 'email gerekli' })

    // Check if user already exists
    const existing = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, email.toLowerCase()) })
    if (existing) {
      // Just add membership if not already there
      const hasMembership = await db.query.tenantMemberships.findFirst({
        where: (t, { and, eq }) => and(eq(t.userId, existing.id), eq(t.tenantId, user.tenantId)),
      })
      if (!hasMembership) {
        await db.insert(tenantMemberships).values({ userId: existing.id, tenantId: user.tenantId, role: 'entity_external' })
      }
      return reply.send({ ok: true, userId: existing.id, existing: true })
    }

    // Create new user with random password
    const tempPassword = nanoid(12)
    const passwordHash = await argon2.hash(tempPassword)

    const [newUser] = await db.insert(users).values({
      email:        email.toLowerCase(),
      name:         name ?? email.split('@')[0],
      phone:        phone ?? null,
      passwordHash,
      role:         'entity_external',
      isActive:     true,
      isVerified:   false,
    }).returning()

    await db.insert(tenantMemberships).values({ userId: newUser.id, tenantId: user.tenantId, role: 'entity_external' })

    return reply.status(201).send({ ok: true, userId: newUser.id, tempPassword, existing: false })
  })

  // GET /api/v1/tenants/me/members — list all tenant members
  app.get('/me/members', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    if (!isUUID(user.tenantId)) return reply.send({ members: [] })

    const memberships = await db.query.tenantMemberships.findMany({
      where: (t, { eq }) => eq(t.tenantId, user.tenantId),
    })
    if (!memberships.length) return reply.send({ members: [] })

    const memberUsers = await db.query.users.findMany({
      where: (t, { inArray }) => inArray(t.id, memberships.map(m => m.userId)),
      columns: { id: true, email: true, name: true, isActive: true, createdAt: true },
    })
    const memberMap = Object.fromEntries(memberUsers.map(u => [u.id, u]))

    return reply.send({
      members: memberships.map(m => ({
        userId:                m.userId,
        role:                  m.role,
        messageLimit:          m.messageLimit ?? null,
        messagesUsedThisMonth: m.messagesUsedThisMonth ?? 0,
        ...(memberMap[m.userId] ?? {}),
      })),
    })
  })

  // POST /api/v1/tenants/me/invites — invite a team member by email
  app.post('/me/invites', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Entity bağlantısı gerekli' })
    if (!['entity_main', 'admin', 'supervisor'].includes(user.role)) return reply.status(403).send({ error: 'Yetkisiz' })

    const { email, role: inviteRole = 'entity_sub' } = req.body as { email: string; role?: string }
    if (!email) return reply.status(400).send({ error: 'email zorunlu' })

    const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) })
    const tenantSettings = (tenant?.settings ?? {}) as Record<string, any>

    // ── Plan limit + wallet gate for sub-user roles ───────────────────────
    const isSubUserRole = ['entity_sub', 'entity_supervisor', 'entity_external'].includes(inviteRole)
    if (isSubUserRole && user.role === 'entity_main') {
      const entity = await db.query.kibiEntities.findFirst({
        where: (t, { eq }) => eq(t.entityId, user.tenantId),
        columns: { id: true, planName: true, extraSubUsers: true },
      })

      if (entity) {
        const pkg = entity.planName ? await getEntityPackage(entity.planName) : null
        if (pkg) {
          // Count active members (excluding entity_main itself)
          const [countRow] = await db
            .select({ cnt: sqlCount() })
            .from(tenantMemberships)
            .where(and(eq(tenantMemberships.tenantId, user.tenantId)))

          const currentCount = Number(countRow?.cnt ?? 0)
          const includedMax  = pkg.maxUsers                        // users included in plan price
          const extraAllowed = entity.extraSubUsers ?? 0
          const effectiveMax = includedMax + extraAllowed

          if (currentCount >= effectiveMax) {
            // Over plan limit — must pay for an extra sub-user slot
            const charge = await chargeAndAddSubUser(entity.id, entity.planName!)
            if (!charge.ok) {
              const reason = charge.reason === 'insufficient_funds'
                ? `Plan limitiniz doldu (${includedMax} kullanıcı). Ek kullanıcı ($${parseFloat(String(pkg.extraSubUserPriceUsd))}/ay) için Ki Wallet bakiyeniz yetersiz.`
                : 'Ek kullanıcı ücreti alınamadı. Lütfen Ki Wallet bakiyenizi kontrol edin.'
              return reply.status(402).send({ error: reason })
            }
          }
        }
      }
    }
    // ── End plan gate ────────────────────────────────────────────────────

    // If already a registered user, add them directly
    const existingUser = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, email.toLowerCase()) })
    if (existingUser) {
      const hasMembership = await db.query.tenantMemberships.findFirst({
        where: (t, { and, eq }) => and(eq(t.userId, existingUser.id), eq(t.tenantId, user.tenantId)),
      })
      if (!hasMembership) {
        await db.insert(tenantMemberships).values({ userId: existingUser.id, tenantId: user.tenantId, role: inviteRole as any })
      }
      return reply.send({ ok: true, added: true })
    }

    // Store invite token in tenant settings
    const token = nanoid(32)
    const invites: any[] = tenantSettings.invites ?? []
    invites.push({ email: email.toLowerCase(), role: inviteRole, token, createdAt: new Date().toISOString() })
    await db.update(tenants)
      .set({ settings: { ...tenantSettings, invites } as any })
      .where(eq(tenants.id, user.tenantId))

    // Send invite email (non-fatal)
    try {
      const mailer = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } })
      const appUrl = (env as any).APP_URL ?? 'https://kibusiness.global'
      await mailer.sendMail({
        from: env.SMTP_FROM, to: email,
        subject: `${tenant?.name ?? 'Ki Business'} — Platform Daveti`,
        html: `<div style="font-family:Arial;max-width:480px;margin:0 auto;padding:24px"><h2 style="color:#2d8a6b">Ki Business Intelligence</h2><p><strong>${tenant?.name ?? 'Bir şirket'}</strong> sizi platformuna davet etti.</p><p><a href="${appUrl}/app/register?invite=${token}" style="background:#2d8a6b;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none">Daveti Kabul Et</a></p></div>`,
      })
    } catch { /* non-fatal */ }

    return reply.send({ ok: true, added: false, invited: true })
  })

  // PUT /api/v1/tenants/me/members/:userId/message-limit — entity_main sets per-user message limit
  app.put('/me/members/:userId/message-limit', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    if (!isUUID(user.tenantId)) return reply.status(403).send({ error: 'Entity bağlantısı gerekli' })
    if (user.role !== 'entity_main') return reply.status(403).send({ error: 'Yalnızca Entity Main User yapabilir' })

    const { userId } = req.params as { userId: string }
    const { messageLimit } = req.body as { messageLimit: number | null }

    const membership = await db.query.tenantMemberships.findFirst({
      where: (t, { and, eq }) => and(eq(t.userId, userId), eq(t.tenantId, user.tenantId)),
    })
    if (!membership) return reply.status(404).send({ error: 'Üye bulunamadı' })

    await db.update(tenantMemberships)
      .set({ messageLimit: messageLimit ?? null })
      .where(and(eq(tenantMemberships.userId, userId), eq(tenantMemberships.tenantId, user.tenantId)))

    return reply.send({ ok: true, userId, messageLimit })
  })

  // ── Entity AI Provider Management ─────────────────────────────────────────────

  // GET /api/v1/tenants/ai-providers — list own keys + platform entity_free keys + kibi_free
  app.get('/ai-providers', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    if (!isUUID(user.tenantId)) return reply.send({ providers: [] })

    // Entity's own keys from ai_configs.settings.providerKeys
    const aiConfig = await db.query.aiConfigs.findFirst({
      where: (t, { eq }) => eq(t.tenantId, user.tenantId),
    })
    const ownProviderKeys = (aiConfig?.settings as any)?.providerKeys as Record<string, string> | undefined ?? {}

    // Platform entity_free keys
    const allPlatformRows = await db.select().from(platformConfigs)
    const entityFreeSet = new Set(
      allPlatformRows
        .filter(r => r.key.startsWith('ai_provider_entity_free_') && r.value !== '')
        .map(r => r.key.replace('ai_provider_entity_free_', ''))
    )

    const providers = PROVIDERS.map(p => ({
      id:          p.id,
      name:        p.name,
      docsUrl:     p.docsUrl,
      freeModels:  p.freeModels,
      source:      ownProviderKeys[p.id] ? 'own' : (entityFreeSet.has(p.id) ? 'platform' : 'none'),
      isConfigured: !!(ownProviderKeys[p.id] || entityFreeSet.has(p.id)),
    }))

    // Add kibi_free virtual option
    const freeOption = {
      id:          'kibi_free',
      name:        'KIBI Ücretsiz Altyapısı',
      docsUrl:     '',
      freeModels:  true,
      source:      'platform' as const,
      isConfigured: true,
    }

    return reply.send({ providers: [freeOption, ...providers] })
  })

  // PUT /api/v1/tenants/ai-providers/:providerId — save entity's own key
  app.put('/ai-providers/:providerId', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Entity bağlantısı gerekli' })
    if (!await canManageCompanyProfile(user)) return reply.status(403).send({ error: 'Yetkisiz' })
    if (!['admin', 'supervisor'].includes(user.role) && !await requireCustomModelsPlan(user.tenantId)) {
      return reply.status(403).send({ error: 'Bu özellik sadece Custom Model paketinde aktiftir.' })
    }

    const { providerId } = req.params as { providerId: string }
    if (!PROVIDERS.find(p => p.id === providerId)) return reply.status(400).send({ error: 'Bilinmeyen provider' })

    const { apiKey } = req.body as { apiKey: string }
    if (!apiKey?.trim()) return reply.status(400).send({ error: 'API key boş olamaz' })

    const encryptedKey = encrypt(apiKey.trim())

    const existing = await db.query.aiConfigs.findFirst({
      where: (t, { eq }) => eq(t.tenantId, user.tenantId),
    })
    const existingSettings = (existing?.settings ?? {}) as Record<string, any>
    const providerKeys = { ...(existingSettings.providerKeys ?? {}), [providerId]: encryptedKey }

    if (existing) {
      await db.update(aiConfigs)
        .set({ settings: { ...existingSettings, providerKeys } as any })
        .where(eq(aiConfigs.id, existing.id))
    } else {
      await db.insert(aiConfigs).values({
        tenantId: user.tenantId,
        provider: 'openrouter' as any,
        model:    'meta-llama/llama-3.3-70b-instruct:free',
        isDefault: true,
        settings: { providerKeys } as any,
      })
    }

    // Invalidate key cache for this entity+provider
    invalidateProviderKeyCache(`entity_own:${user.tenantId}:${providerId}`)
    return reply.send({ ok: true })
  })

  // DELETE /api/v1/tenants/ai-providers/:providerId — remove entity's own key
  app.delete('/ai-providers/:providerId', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Entity bağlantısı gerekli' })
    if (!await canManageCompanyProfile(user)) return reply.status(403).send({ error: 'Yetkisiz' })
    if (!['admin', 'supervisor'].includes(user.role) && !await requireCustomModelsPlan(user.tenantId)) {
      return reply.status(403).send({ error: 'Bu özellik sadece Custom Model paketinde aktiftir.' })
    }

    const { providerId } = req.params as { providerId: string }

    const existing = await db.query.aiConfigs.findFirst({
      where: (t, { eq }) => eq(t.tenantId, user.tenantId),
    })
    if (!existing) return reply.send({ ok: true })

    const existingSettings = (existing.settings ?? {}) as Record<string, any>
    const providerKeys = { ...(existingSettings.providerKeys ?? {}) }
    delete providerKeys[providerId]
    await db.update(aiConfigs)
      .set({ settings: { ...existingSettings, providerKeys } as any })
      .where(eq(aiConfigs.id, existing.id))

    invalidateProviderKeyCache(`entity_own:${user.tenantId}:${providerId}`)
    return reply.send({ ok: true })
  })

  // GET /api/v1/tenants/ai-providers/all-models — models from own + entity_free + kibi_free
  app.get('/ai-providers/all-models', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    if (!isUUID(user.tenantId)) return reply.send({ providers: [] })

    const aiConfig = await db.query.aiConfigs.findFirst({
      where: (t, { eq }) => eq(t.tenantId, user.tenantId),
    })
    const ownKeys = (aiConfig?.settings as any)?.providerKeys as Record<string, string> | undefined ?? {}

    const allPlatformRows = await db.select().from(platformConfigs)
    const entityFreeConfigured = allPlatformRows
      .filter(r => r.key.startsWith('ai_provider_entity_free_') && r.value !== '')
      .map(r => r.key.replace('ai_provider_entity_free_', ''))

    const results: Array<{ provider: string; source: string; models: Array<{ id: string; name: string }> }> = []

    // kibi_free virtual option always first
    const freeRoles = await db.select().from(kibiModelConfigs)
      .where(eq(kibiModelConfigs.scope, 'entity_free'))
    const freeModels = freeRoles.map(r => ({
      id:   KIBI_FREE_MODEL,
      name: `KIBI Ücretsiz (${r.modelRole}: ${r.primaryModel})`,
    }))
    results.push({ provider: 'kibi_free', source: 'platform', models: freeModels.length ? [{ id: KIBI_FREE_MODEL, name: 'KIBI Ücretsiz Altyapısı (Paylaşımlı)' }] : [{ id: KIBI_FREE_MODEL, name: 'KIBI Ücretsiz Altyapısı' }] })

    // Entity own keys
    for (const [providerId] of Object.entries(ownKeys)) {
      const cacheKey = `ki:models:entity_own:${user.tenantId}:${providerId}`
      const cached   = await redis.get(cacheKey).catch(() => null)
      if (cached) {
        try { results.push({ provider: providerId, source: 'own', models: JSON.parse(cached) }); continue }
        catch { /* continue */ }
      }

      const providerDef = PROVIDERS.find(p => p.id === providerId)
      if (!providerDef?.modelsPath) continue

      try {
        const encKey = ownKeys[providerId]
        let apiKey: string
        try { apiKey = decrypt(encKey) } catch { continue }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...providerDef.extraHeaders,
          ...(providerDef.authHeader === 'x-api-key'
            ? { 'x-api-key': apiKey }
            : { 'Authorization': `Bearer ${apiKey}` }),
        }
        const controller = new AbortController()
        const timer      = setTimeout(() => controller.abort(), 10_000)
        let modelsRes: Response
        try {
          modelsRes = await fetch(`${providerDef.baseUrl}${providerDef.modelsPath}`, { headers, signal: controller.signal })
        } finally {
          clearTimeout(timer)
        }
        if (!modelsRes.ok) continue

        const modelsData = await modelsRes.json() as any
        const models = ((modelsData.data ?? modelsData.models ?? []) as any[])
          .map((m: any) => ({ id: `${providerId}::${m.name?.replace('models/', '') ?? m.id}`, name: m.display_name ?? m.displayName ?? m.id }))

        await redis.set(cacheKey, JSON.stringify(models), 'EX', 1800)
        results.push({ provider: providerId, source: 'own', models })
      } catch { /* skip */ }
    }

    // Entity_free platform keys
    for (const providerId of entityFreeConfigured) {
      if (ownKeys[providerId]) continue  // entity has own key, already included
      const cacheKey = `ki:models:entity_free:${providerId}`
      const cached   = await redis.get(cacheKey).catch(() => null)
      if (cached) {
        try { results.push({ provider: providerId, source: 'platform', models: JSON.parse(cached) }); continue }
        catch { /* continue */ }
      }
      // Models for platform keys are cached by admin endpoint; serve empty if not cached
      results.push({ provider: providerId, source: 'platform', models: [] })
    }

    return reply.send({ providers: results })
  })

  // GET /api/v1/tenants/ai-providers/roles — entity's role→model assignments.
  // For Custom Models plan: the entity's own overrides (editable).
  // For Free/Basic/Premium/Enterprise: the platform's configured models for that
  // plan tier (read-only — entity can see which models it's actually using).
  app.get('/ai-providers/roles', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    if (!isUUID(user.tenantId)) return reply.send({ roles: [] })

    const entity = await db.query.kibiEntities.findFirst({
      where:   (t, { eq }) => eq(t.entityId, user.tenantId),
      columns: { planName: true },
    })
    const planName   = entity?.planName ?? 'free'
    const modelScope = PLAN_TO_MODEL_SCOPE[planName] ?? 'entity_free'

    const roleMap = new Map<string, { modelRole: string; primaryModel: string; fallback1?: string; fallback2?: string }>()

    const platformRows = await db.select().from(kibiModelConfigs).where(eq(kibiModelConfigs.scope, modelScope))
    for (const row of platformRows) {
      if (!row.isActive) continue
      roleMap.set(row.modelRole, {
        modelRole:    row.modelRole,
        primaryModel: row.primaryModel ?? '',
        fallback1:    row.fallback1 ?? undefined,
        fallback2:    row.fallback2 ?? undefined,
      })
    }

    if (planName === 'custom_models') {
      const aiConfig = await db.query.aiConfigs.findFirst({
        where: (t, { eq }) => eq(t.tenantId, user.tenantId),
      })
      const overrides = (aiConfig?.settings as any)?.modelOverrides as Record<string, any> | undefined ?? {}
      for (const [modelRole, override] of Object.entries(overrides)) {
        const primary   = typeof override === 'string' ? override : override?.primary ?? ''
        const fallbacks = Array.isArray(override) ? override : (override?.fallbacks ?? [])
        if (primary) roleMap.set(modelRole, { modelRole, primaryModel: primary, fallback1: fallbacks[0], fallback2: fallbacks[1] })
      }
    }

    return reply.send({ roles: Array.from(roleMap.values()) })
  })

  // PUT /api/v1/tenants/ai-providers/roles — save entity's role→model overrides
  app.put('/ai-providers/roles', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Entity bağlantısı gerekli' })
    if (!await canManageCompanyProfile(user)) return reply.status(403).send({ error: 'Yetkisiz' })
    if (!['admin', 'supervisor'].includes(user.role) && !await requireCustomModelsPlan(user.tenantId)) {
      return reply.status(403).send({ error: 'Bu özellik sadece Custom Model paketinde aktiftir.' })
    }

    const { roles } = req.body as { roles: Record<string, { primary: string; fallback1?: string; fallback2?: string }> }
    if (!roles || typeof roles !== 'object') return reply.status(400).send({ error: 'roles zorunlu' })

    const existing = await db.query.aiConfigs.findFirst({
      where: (t, { eq }) => eq(t.tenantId, user.tenantId),
    })
    const existingSettings = (existing?.settings ?? {}) as Record<string, any>
    const modelOverrides = { ...(existingSettings.modelOverrides ?? {}) }

    for (const [role, cfg] of Object.entries(roles)) {
      if (!cfg?.primary) continue
      modelOverrides[role] = { primary: cfg.primary, fallbacks: [cfg.fallback1, cfg.fallback2].filter((v): v is string => !!v) }
    }

    if (existing) {
      await db.update(aiConfigs)
        .set({ settings: { ...existingSettings, modelOverrides } as any })
        .where(eq(aiConfigs.id, existing.id))
    } else {
      await db.insert(aiConfigs).values({
        tenantId: user.tenantId,
        provider: 'openrouter' as any,
        model:    'meta-llama/llama-3.3-70b-instruct:free',
        isDefault: true,
        settings: { modelOverrides } as any,
      })
    }

    return reply.send({ ok: true })
  })

  // POST /api/v1/tenants/ai-providers/test-model — ping a model using the entity's own (or platform-shared) key
  app.post('/ai-providers/test-model', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Entity bağlantısı gerekli' })

    const { model } = req.body as { model: string }
    if (!model) return reply.status(400).send({ error: 'model zorunlu (format: provider::modelId)' })

    const [providerId, ...modelParts] = model.split('::')
    const modelId = modelParts.join('::')
    if (!providerId || !modelId) return reply.status(400).send({ error: 'Geçersiz model formatı (beklenen: provider::modelId)' })

    if (providerId === 'kibi_free') return reply.send({ ok: true, latencyMs: 0, speed: 'fast' as const })

    const providerDef = PROVIDERS.find(p => p.id === providerId)
    if (!providerDef) return reply.status(400).send({ error: `Bilinmeyen sağlayıcı: ${providerId}` })

    const aiConfig = await db.query.aiConfigs.findFirst({
      where: (t, { eq }) => eq(t.tenantId, user.tenantId),
    })
    let encryptedKey = ((aiConfig?.settings as any)?.providerKeys as Record<string, string> | undefined)?.[providerId]

    if (!encryptedKey) {
      const allPlatformRows = await db.select().from(platformConfigs)
      encryptedKey = allPlatformRows.find(r => r.key === `ai_provider_entity_free_${providerId}`)?.value
    }
    if (!encryptedKey) return reply.status(400).send({ error: `${providerDef.name} için API key yapılandırılmamış` })

    let apiKey: string
    try { apiKey = decrypt(encryptedKey) } catch { return reply.status(500).send({ error: 'API key çözümlenemedi' }) }

    const result = await pingProviderModel(providerDef, modelId, apiKey)
    return reply.send(result)
  })

  // GET /api/v1/tenants/external-users — list external users for this entity
  app.get('/external-users', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    if (!isUUID(user.tenantId)) return reply.send({ users: [] })
    if (!['entity_main', 'admin'].includes(user.role)) return reply.status(403).send({ error: 'Yetkisiz' })

    const memberships = await db.query.tenantMemberships.findMany({
      where: (t, { and, eq }) => and(eq(t.tenantId, user.tenantId), eq(t.role, 'entity_external')),
    })
    const userIds = memberships.map(m => m.userId)
    if (!userIds.length) return reply.send({ users: [] })

    const externalUsers = await db.query.users.findMany({
      where: (t, { inArray }) => inArray(t.id, userIds),
      columns: { id: true, email: true, name: true, phone: true, isActive: true, createdAt: true },
    })
    return reply.send({ users: externalUsers })
  })

  // ─── Vector Docs (Entity Knowledge Base) ────────────────────────────────────

  // GET /api/v1/tenants/vector-docs — list entity's knowledge entries
  app.get('/vector-docs', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Geçersiz tenant' })

    const docs = await db.select({
      id:        knowledgeEntries.id,
      title:     knowledgeEntries.title,
      content:   knowledgeEntries.content,
      source:    knowledgeEntries.source,
      isIndexed: knowledgeEntries.isIndexed,
      qdrantId:  knowledgeEntries.qdrantId,
      createdAt: knowledgeEntries.createdAt,
    }).from(knowledgeEntries).where(eq(knowledgeEntries.tenantId, user.tenantId))

    return reply.send({ docs })
  })

  // POST /api/v1/tenants/vector-docs — create + embed + upsert to Qdrant
  app.post('/vector-docs', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Geçersiz tenant' })
    if (!['entity_main', 'entity_supervisor', 'admin'].includes(user.role)) {
      return reply.status(403).send({ error: 'Yetkisiz' })
    }

    const { title, content } = req.body as { title?: string; content?: string }
    if (!title?.trim() || !content?.trim()) {
      return reply.status(400).send({ error: 'Başlık ve içerik zorunlu' })
    }

    const [doc] = await db.insert(knowledgeEntries).values({
      tenantId: user.tenantId,
      title:    title.trim(),
      content:  content.trim(),
      source:   'manual',
    }).returning()

    // Embed + upsert to Qdrant (best-effort — don't fail the request if Qdrant is down)
    try {
      const [vector] = await embedConfigured([content.trim()])
      const collection = `entity_${user.tenantId}`
      await qdrant.upsert(collection, {
        wait: true,
        points: [{
          id:      doc!.id,
          vector:  vector!,
          payload: { title: doc!.title, tenantId: user.tenantId, source: 'manual' },
        }],
      }).catch(() =>
        // Fallback: try platform collection
        qdrant.upsert(env.QDRANT_COLLECTION, {
          wait: true,
          points: [{ id: doc!.id, vector: vector!, payload: { title: doc!.title, tenantId: user.tenantId } }],
        })
      )
      await db.update(knowledgeEntries)
        .set({ qdrantId: doc!.id, isIndexed: true })
        .where(eq(knowledgeEntries.id, doc!.id))
    } catch (e: any) {
      console.warn('[vector-docs] Embedding/Qdrant error:', e.message)
    }

    return reply.status(201).send({ doc })
  })

  // PUT /api/v1/tenants/vector-docs/:id — update title/content + reindex
  app.put('/vector-docs/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Geçersiz tenant' })
    if (!['entity_main', 'entity_supervisor', 'admin'].includes(user.role)) {
      return reply.status(403).send({ error: 'Yetkisiz' })
    }

    const { id } = req.params as { id: string }
    const { title, content } = req.body as { title?: string; content?: string }

    const existing = await db.query.knowledgeEntries.findFirst({
      where: (t, { and, eq }) => and(eq(t.id, id), eq(t.tenantId, user.tenantId)),
    })
    if (!existing) return reply.status(404).send({ error: 'Bulunamadı' })

    const newContent = content?.trim() ?? existing.content
    await db.update(knowledgeEntries)
      .set({
        title:     title?.trim() ?? existing.title,
        content:   newContent,
        isIndexed: false,
      })
      .where(eq(knowledgeEntries.id, id))

    // Re-embed
    try {
      const [vector] = await embedConfigured([newContent])
      const collection = `entity_${user.tenantId}`
      await qdrant.upsert(collection, {
        wait: true,
        points: [{ id, vector: vector!, payload: { title: title?.trim() ?? existing.title, tenantId: user.tenantId } }],
      }).catch(() =>
        qdrant.upsert(env.QDRANT_COLLECTION, {
          wait: true,
          points: [{ id, vector: vector!, payload: { title: title?.trim() ?? existing.title, tenantId: user.tenantId } }],
        })
      )
      await db.update(knowledgeEntries).set({ isIndexed: true }).where(eq(knowledgeEntries.id, id))
    } catch (e: any) {
      console.warn('[vector-docs] Re-embed error:', e.message)
    }

    return reply.send({ ok: true })
  })

  // DELETE /api/v1/tenants/vector-docs/:id — delete from DB + Qdrant
  app.delete('/vector-docs/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Geçersiz tenant' })
    if (!['entity_main', 'entity_supervisor', 'admin'].includes(user.role)) {
      return reply.status(403).send({ error: 'Yetkisiz' })
    }

    const { id } = req.params as { id: string }
    const existing = await db.query.knowledgeEntries.findFirst({
      where: (t, { and, eq }) => and(eq(t.id, id), eq(t.tenantId, user.tenantId)),
    })
    if (!existing) return reply.status(404).send({ error: 'Bulunamadı' })

    await db.delete(knowledgeEntries).where(eq(knowledgeEntries.id, id))

    // Remove from Qdrant (best-effort)
    try {
      await qdrant.delete(`entity_${user.tenantId}`, { wait: true, points: [id] })
        .catch(() => qdrant.delete(env.QDRANT_COLLECTION, { wait: true, points: [id] }))
    } catch {}

    return reply.send({ ok: true })
  })

  // ── Entity KB: file-upload documents (YFZ 33) ────────────────────────────────
  // Separate from the manual-paste /vector-docs above — chunked, hash-diffed, file-backed.

  // GET /api/v1/tenants/kb-documents
  app.get('/kb-documents', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Geçersiz tenant' })

    const docs = await db.select().from(kbDocuments)
      .where(and(eq(kbDocuments.scope, 'entity'), eq(kbDocuments.entityId, user.tenantId)))
      .orderBy(kbDocuments.createdAt)

    return reply.send({ docs })
  })

  // POST /api/v1/tenants/kb-documents — multipart file upload, category-routed, hash-diff incremental indexing
  app.post('/kb-documents', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Geçersiz tenant' })
    if (!['entity_main', 'entity_supervisor', 'admin'].includes(user.role)) {
      return reply.status(403).send({ error: 'Yetkisiz' })
    }

    const data = await req.file()
    if (!data) return reply.status(400).send({ error: 'Dosya bulunamadı' })
    const category = String((data.fields as any)?.category?.value ?? '').trim()
    if (!category) return reply.status(400).send({ error: 'Kategori zorunlu' })

    const ext = data.filename.split('.').pop() ?? ''
    const fileType = detectFileType(data.filename, data.mimetype)
    if (!fileType) return reply.status(400).send({ error: `Desteklenmeyen dosya türü: .${ext}` })

    const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) })
    if (!tenant) return reply.status(404).send({ error: 'Entity bulunamadı' })

    const buffer = await data.toBuffer()
    const normName = normalizedFileName(tenant.slug, category, ext)

    // Re-upload of the same entity+category+filename → version update (reuse documentId, hash-diff)
    const existingDoc = await db.query.kbDocuments.findFirst({
      where: (t, { and, eq }) => and(eq(t.scope, 'entity'), eq(t.entityId, user.tenantId), eq(t.normalizedFileName, normName)),
    })

    const uploadDir = join(process.cwd(), 'storage', user.tenantId)
    if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true })
    const storedFilename = `${Date.now()}-${normName}`
    const filepath = join(uploadDir, storedFilename)
    await pipeline(Readable.from(buffer), createWriteStream(filepath))

    const [file] = await db.insert(fileStorage).values({
      tenantId:     user.tenantId,
      filename:     storedFilename,
      originalName: data.filename,
      mimeType:     data.mimetype,
      sizeBytes:    buffer.length,
      storageType:  'local',
      storagePath:  filepath,
    }).returning()

    let documentId: string
    if (existingDoc) {
      documentId = existingDoc.id
      await db.update(kbDocuments).set({
        originalFileName: data.filename,
        fileStorageId:    file!.id,
        status:           'processing',
        updatedAt:        new Date(),
      }).where(eq(kbDocuments.id, documentId))
    } else {
      const [doc] = await db.insert(kbDocuments).values({
        scope:              'entity',
        entityId:           user.tenantId,
        category,
        title:              data.filename,
        originalFileName:   data.filename,
        normalizedFileName: normName,
        fileStorageId:      file!.id,
        sourceType:         'file',
        uploadedBy:         user.sub,
        status:             'processing',
      }).returning()
      documentId = doc!.id
    }

    try {
      const text = await extractText(buffer, fileType)
      const result = await indexDocument({ documentId, scope: 'entity', entityId: user.tenantId, category, text, fileName: normName })
      return reply.status(201).send({ documentId, normalizedFileName: normName, ...result })
    } catch (e: any) {
      await db.update(kbDocuments).set({ status: 'failed' }).where(eq(kbDocuments.id, documentId))
      return reply.status(500).send({ error: `İndexleme hatası: ${e.message}` })
    }
  })

  // DELETE /api/v1/tenants/kb-documents/:id
  app.delete('/kb-documents/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string; role: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Geçersiz tenant' })
    if (!['entity_main', 'entity_supervisor', 'admin'].includes(user.role)) {
      return reply.status(403).send({ error: 'Yetkisiz' })
    }

    const { id } = req.params as { id: string }
    const existing = await db.query.kbDocuments.findFirst({
      where: (t, { and, eq }) => and(eq(t.id, id), eq(t.scope, 'entity'), eq(t.entityId, user.tenantId)),
    })
    if (!existing) return reply.status(404).send({ error: 'Bulunamadı' })

    await deleteDocumentFromIndex(id, 'entity', user.tenantId)
    await db.delete(kbDocuments).where(eq(kbDocuments.id, id))
    if (existing.fileStorageId) {
      await db.delete(fileStorage).where(eq(fileStorage.id, existing.fileStorageId)).catch(() => {})
    }

    return reply.send({ ok: true })
  })

  // ── Business profile (sector, size, revenue, etc.) ───────────────────────────

  // GET /api/v1/tenants/me/business-profile
  app.get('/me/business-profile', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    if (!isUUID(user.tenantId)) return reply.send({ profile: {} })
    const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) })
    const settings = (tenant?.settings ?? {}) as Record<string, any>
    return reply.send({ profile: settings.businessProfile ?? {} })
  })

  // PUT /api/v1/tenants/me/business-profile
  app.put('/me/business-profile', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Entity bağlantısı gerekli' })
    if (!(await canManageCompanyProfile(user))) return reply.status(403).send({ error: 'Yetkisiz' })

    const body = req.body as {
      sector?:               string
      employee_count?:       string
      annual_revenue?:       string
      address?:              string
      city?:                 string
      postal_code?:          string
      country?:              string
      tax_number?:           string
      registration_number?:  string
      founded_date?:         string
      logo_url?:             string
      fiscal_year_start?:    string
    }

    const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) })
    const existing = (tenant?.settings ?? {}) as Record<string, any>
    const current = existing.businessProfile ?? {}
    await db.update(tenants)
      .set({ settings: { ...existing, businessProfile: { ...current, ...body } } as any })
      .where(eq(tenants.id, user.tenantId))
    return reply.send({ ok: true })
  })

  // ── Channel identifiers (for inbound routing: WA, IG, TG, email) ─────────────

  // GET /api/v1/tenants/me/channel-ids
  app.get('/me/channel-ids', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    if (!isUUID(user.tenantId)) return reply.send({ channelIds: {} })
    const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) })
    const settings = (tenant?.settings ?? {}) as Record<string, any>
    return reply.send({ channelIds: settings.channelIds ?? {} })
  })

  // PUT /api/v1/tenants/me/channel-ids
  app.put('/me/channel-ids', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    if (!isUUID(user.tenantId)) return reply.status(400).send({ error: 'Entity bağlantısı gerekli' })
    if (!(await canManageCompanyProfile(user))) return reply.status(403).send({ error: 'Yetkisiz' })

    const body = req.body as {
      whatsapp_phones?:    string[]
      instagram_handles?:  string[]
      telegram_ids?:       string[]
      email_domains?:      string[]
    }

    const tenant = await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) })
    const existing = (tenant?.settings ?? {}) as Record<string, any>
    const current = existing.channelIds ?? {}
    await db.update(tenants)
      .set({ settings: { ...existing, channelIds: { ...current, ...body } } as any })
      .where(eq(tenants.id, user.tenantId))
    return reply.send({ ok: true })
  })

  // GET /api/v1/tenants/me/permissions — caller's own kibiEntityUsers.permissions flags
  app.get('/me/permissions', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    if (!isUUID(user.tenantId)) return reply.send({ permissions: {} })
    const entity = await db.query.kibiEntities.findFirst({
      where: (t, { eq }) => eq(t.entityId, user.tenantId),
      columns: { id: true },
    })
    if (!entity) return reply.send({ permissions: {} })
    const entityUser = await db.query.kibiEntityUsers.findFirst({
      where: (t, { and, eq }) => and(eq(t.entityId, entity.id), eq(t.userId, user.sub)),
      columns: { permissions: true },
    })
    return reply.send({ permissions: entityUser?.permissions ?? {} })
  })

  // PUT /api/v1/tenants/users/:userId/company-profile-permission — entity_main grants/revokes
  // an entity_supervisor's right to view/edit Şirket Profili + Ekip
  app.put('/users/:userId/company-profile-permission', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string; role: string }
    const { userId } = req.params as { userId: string }
    const { allow } = req.body as { allow: boolean }

    if (!['entity_main', 'admin', 'supervisor'].includes(user.role)) {
      return reply.status(403).send({ error: 'Bu işlem için yetkiniz yok' })
    }
    if (!isUUID(user.tenantId)) return reply.status(403).send({ error: 'Entity bağlantısı gerekli' })

    const entity = await db.query.kibiEntities.findFirst({
      where: (t, { eq }) => eq(t.entityId, user.tenantId),
      columns: { id: true },
    })
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı' })

    const entityUser = await db.query.kibiEntityUsers.findFirst({
      where: (t, { and, eq }) => and(eq(t.entityId, entity.id), eq(t.userId, userId)),
    })

    if (entityUser) {
      const current = (entityUser.permissions ?? {}) as Record<string, boolean>
      await db.update(kibiEntityUsers)
        .set({ permissions: { ...current, manageCompanyProfile: allow } })
        .where(and(eq(kibiEntityUsers.entityId, entity.id), eq(kibiEntityUsers.userId, userId)))
    } else {
      await db.insert(kibiEntityUsers).values({
        entityId:    entity.id,
        userId,
        role:        'entity_supervisor',
        permissions: { manageCompanyProfile: allow },
      })
    }

    return reply.send({ ok: true })
  })

}

// ─── Channel Routes (prefix: /channels) ──────────────────────────────────────

export const channelRoutes: FastifyPluginAsync = async (app) => {

  const VALID_CHANNELS = new Set(['whatsapp', 'instagram', 'telegram', 'email', 'voip', 'portal'])

  // POST /api/v1/channels/:key/test — verify channel config exists + ping endpoint
  app.post('/:key/test', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string }
    const { key } = req.params as { key: string }
    if (!VALID_CHANNELS.has(key)) return reply.status(400).send({ error: 'Geçersiz kanal' })

    const tenant = isUUID(user.tenantId)
      ? await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, user.tenantId) })
      : null
    if (!tenant) return reply.status(404).send({ error: 'Tenant bulunamadı' })

    const settings = (tenant.settings ?? {}) as Record<string, any>
    const channelCfg = settings.channels?.[key]
    if (!channelCfg) return reply.status(404).send({ error: 'Kanal yapılandırılmamış' })

    // For email: try nodemailer verify
    if (key === 'email' && channelCfg.host) {
      try {
        const transporter = nodemailer.createTransport({
          host: channelCfg.host, port: Number(channelCfg.port ?? 587),
          secure: channelCfg.encryption === 'SSL/TLS',
          auth: { user: channelCfg.username, pass: channelCfg.password },
        })
        await transporter.verify()
        return reply.send({ ok: true, message: 'SMTP bağlantısı başarılı' })
      } catch (e: any) {
        return reply.status(400).send({ ok: false, message: e.message })
      }
    }

    // For other channels: config presence is sufficient for a basic test
    return reply.send({ ok: true, message: 'Kanal yapılandırması mevcut' })
  })
}

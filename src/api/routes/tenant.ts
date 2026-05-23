import type { FastifyPluginAsync } from 'fastify'
import { db } from '../../lib/db.js'
import { aiConfigs, emailConfigs, tenantMemberships, tenants, users } from '../../../db/schema.js'
import { encryptJson, decryptJson } from '../../lib/crypto.js'
import { eq } from 'drizzle-orm'
import nodemailer from 'nodemailer'
import * as argon2 from 'argon2'
import { nanoid } from 'nanoid'
import { env } from '../../../config/env.js'

const isUUID = (s: string | null | undefined): s is string =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

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
        userId: m.userId,
        role: m.role,
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
}

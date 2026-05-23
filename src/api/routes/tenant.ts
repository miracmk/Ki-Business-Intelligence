import type { FastifyPluginAsync } from 'fastify'
import { db } from '../../lib/db.js'
import { aiConfigs, tenants, users } from '../../../db/schema.js'
import { encryptJson } from '../../lib/crypto.js'
import { eq } from 'drizzle-orm'

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
}

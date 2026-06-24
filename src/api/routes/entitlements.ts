import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '../../lib/db.js'
import {
  ALL_MODULE_KEYS, ADDON_MODULE_KEYS,
  listEntitlements, activateEntitlement, deactivateEntitlement,
} from '../../lib/entitlements.js'

const moduleKeySchema = z.enum(ALL_MODULE_KEYS)

async function resolveEntityId(tenantId: string | null): Promise<string | null> {
  const isUUID = (s: string | null | undefined) =>
    !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  if (!isUUID(tenantId)) return null
  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.entityId, tenantId!),
    columns: { id: true },
  })
  return entity?.id ?? null
}

export const entitlementsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/entitlements — list this entity's entitlement rows + the addon stub registry
  app.get('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null }
    const entityId = await resolveEntityId(user.tenantId)
    if (!entityId) return reply.status(404).send({ error: 'Entity bulunamadı' })

    const entitlements = await listEntitlements(entityId)
    return { entitlements, addonModuleKeys: ADDON_MODULE_KEYS }
  })

  // POST /api/v1/entitlements/:moduleKey/activate — entity_main/admin only
  app.post('/:moduleKey/activate', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null; role: string }
    if (!['entity_main', 'admin'].includes(user.role)) {
      return reply.status(403).send({ error: 'Yalnızca entity_main veya admin modül aktive edebilir' })
    }
    const params = z.object({ moduleKey: moduleKeySchema }).safeParse(req.params)
    if (!params.success) return reply.status(400).send({ error: params.error.flatten() })

    const entityId = await resolveEntityId(user.tenantId)
    if (!entityId) return reply.status(404).send({ error: 'Entity bulunamadı' })

    const body = z.object({ status: z.enum(['trial', 'active']).optional(), priceUsd: z.string().optional() }).safeParse(req.body ?? {})
    const opts = body.success ? body.data : undefined

    const row = await activateEntitlement(entityId, params.data.moduleKey, opts)
    return reply.status(201).send({ entitlement: row })
  })

  // POST /api/v1/entitlements/:moduleKey/deactivate — entity_main/admin only
  app.post('/:moduleKey/deactivate', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null; role: string }
    if (!['entity_main', 'admin'].includes(user.role)) {
      return reply.status(403).send({ error: 'Yalnızca entity_main veya admin modül devre dışı bırakabilir' })
    }
    const params = z.object({ moduleKey: moduleKeySchema }).safeParse(req.params)
    if (!params.success) return reply.status(400).send({ error: params.error.flatten() })

    const entityId = await resolveEntityId(user.tenantId)
    if (!entityId) return reply.status(404).send({ error: 'Entity bulunamadı' })

    const row = await deactivateEntitlement(entityId, params.data.moduleKey)
    return { entitlement: row }
  })
}

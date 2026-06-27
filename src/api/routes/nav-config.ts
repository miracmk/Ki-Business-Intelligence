// Sidebar nav config — GET resolves the merged (catalog + entity overrides + role +
// entitlement) tree the frontend renders generically; PUT lets an entity admin persist
// reordering/visibility/role restrictions. The frontend never hardcodes the nav tree,
// route-to-label mapping, or entitlement checks — it only ever calls GET /nav-config.
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '../../lib/db.js'
import { entitySidebarNavConfig } from '../../../db/schema.js'
import { NAV_CATALOG, NAV_GROUPS } from '../../lib/nav-catalog.js'
import { hasActiveEntitlement, type ModuleKey } from '../../lib/entitlements.js'

const ELEVATED_ROLES = new Set(['admin', 'supervisor', 'entity_main', 'entity_supervisor'])

const isUUID = (s: string | null | undefined): boolean =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

async function resolveEntityId(tenantId: string | null): Promise<string | null> {
  if (!isUUID(tenantId)) return null
  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.entityId, tenantId!),
    columns: { id: true },
  })
  return entity?.id ?? null
}

export const navConfigRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null; role?: string }
    const entityId = await resolveEntityId(user.tenantId)
    if (!entityId) return reply.status(404).send({ error: 'Entity bulunamadı' })

    const overrides = await db.query.entitySidebarNavConfig.findMany({
      where: (t, { eq }) => eq(t.entityId, entityId),
    })
    const overrideByKey = new Map(overrides.map(o => [o.itemKey, o]))

    // Entitlement checks are independent per moduleKey — resolve once per distinct key.
    const entitlementKeys = [...new Set(NAV_CATALOG.map(i => i.requiresEntitlement).filter(Boolean))] as ModuleKey[]
    const entitlementStatus = new Map<string, boolean>()
    await Promise.all(entitlementKeys.map(async k => {
      entitlementStatus.set(k, await hasActiveEntitlement(entityId, k))
    }))

    const role = user.role
    const resolved = NAV_CATALOG
      .filter(item => {
        if (item.requiresEntitlement && !ELEVATED_ROLES.has(role ?? '') && !entitlementStatus.get(item.requiresEntitlement)) return false
        const override = overrideByKey.get(item.key)
        if (override && !override.isVisible) return false
        // Catalog-level defaultRoles is a floor an entity override can only narrow, never re-open.
        if (item.defaultRoles && role && !item.defaultRoles.includes(role)) return false
        const allowedRoles = override?.allowedRoles ?? null
        if (allowedRoles && allowedRoles.length > 0 && role && !allowedRoles.includes(role)) return false
        return true
      })
      .map(item => ({
        item,
        position: overrideByKey.get(item.key)?.position ?? NAV_CATALOG.indexOf(item),
      }))
      .sort((a, b) => a.position - b.position)

    const groups = NAV_GROUPS
      .map(g => ({
        key: g.key,
        label: g.label,
        icon: g.icon,
        items: resolved.filter(r => r.item.group === g.key).map(r => ({
          key: r.item.key,
          label: r.item.label,
          icon: r.item.icon,
          route: r.item.route,
          kind: r.item.kind,
        })),
      }))
      .filter(g => g.items.length > 0)

    return { groups }
  })

  const putSchema = z.object({
    items: z.array(z.object({
      itemKey: z.string().min(1),
      position: z.number().int(),
      isVisible: z.boolean(),
      allowedRoles: z.array(z.string()).nullable().optional(),
    })),
  })

  app.put('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null; role?: string }
    if (!user.role || !ELEVATED_ROLES.has(user.role)) {
      return reply.status(403).send({ error: 'Navigasyon ayarlarını yalnızca yetkili kullanıcılar değiştirebilir' })
    }
    const entityId = await resolveEntityId(user.tenantId)
    if (!entityId) return reply.status(404).send({ error: 'Entity bulunamadı' })

    const body = putSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const knownKeys = new Set(NAV_CATALOG.map(i => i.key))
    for (const item of body.data.items) {
      if (!knownKeys.has(item.itemKey)) continue // unknown key — silently ignored, never reaches SQL
      await db.insert(entitySidebarNavConfig).values({
        entityId,
        itemKey: item.itemKey,
        position: item.position,
        isVisible: item.isVisible,
        allowedRoles: item.allowedRoles ?? null,
      }).onConflictDoUpdate({
        target: [entitySidebarNavConfig.entityId, entitySidebarNavConfig.itemKey],
        set: {
          position: item.position,
          isVisible: item.isVisible,
          allowedRoles: item.allowedRoles ?? null,
          updatedAt: new Date(),
        },
      })
    }

    return { ok: true }
  })

  // GET /nav-config/catalog — the full unfiltered catalog, for the Entity Settings
  // "Navigasyon" admin tab to render checkboxes/reorder controls against (includes items
  // hidden for the CURRENT user/entity, which the admin still needs to see to re-enable them).
  app.get('/catalog', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { tenantId: string | null; role?: string }
    if (!user.role || !ELEVATED_ROLES.has(user.role)) {
      return reply.status(403).send({ error: 'Yalnızca yetkili kullanıcılar erişebilir' })
    }
    const entityId = await resolveEntityId(user.tenantId)
    if (!entityId) return reply.status(404).send({ error: 'Entity bulunamadı' })

    const overrides = await db.query.entitySidebarNavConfig.findMany({
      where: (t, { eq }) => eq(t.entityId, entityId),
    })
    const overrideByKey = new Map(overrides.map(o => [o.itemKey, o]))

    return {
      groups: NAV_GROUPS,
      items: NAV_CATALOG.map((item, i) => {
        const o = overrideByKey.get(item.key)
        return {
          key: item.key,
          group: item.group,
          label: item.label,
          icon: item.icon,
          kind: item.kind,
          defaultRoles: item.defaultRoles ?? null,
          position: o?.position ?? i,
          isVisible: o?.isVisible ?? true,
          allowedRoles: o?.allowedRoles ?? null,
        }
      }),
    }
  })
}

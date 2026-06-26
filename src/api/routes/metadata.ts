// FAZ 4.4: read-only metadata API for DynamicForm — exposes kibi_modules/kibi_fields so
// the frontend can render a form from field metadata instead of hardcoded JSX per module.
import type { FastifyPluginAsync } from 'fastify'
import { db } from '../../lib/db.js'

async function resolveEntityId(tenantId: string | null): Promise<string | null> {
  const isUUID = (s: string | null | undefined) =>
    !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  if (!isUUID(tenantId)) return null
  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.entityId, tenantId!),
    columns: { id: true, isProvisioned: true },
  })
  if (!entity?.isProvisioned) return null
  return entity.id
}

export const metadataRoutes: FastifyPluginAsync = async (app) => {
  app.get('/:moduleKey/fields', { onRequest: [app.authenticate] }, async (req, reply) => {
    const entityId = await resolveEntityId((req.user as any).tenantId)
    if (!entityId) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { moduleKey } = req.params as { moduleKey: string }

    const moduleRow = await db.query.kibiModules.findFirst({
      where: (t, { eq, and }) => and(eq(t.entityId, entityId), eq(t.key, moduleKey)),
    })
    if (!moduleRow) return reply.status(404).send({ error: 'Modül bulunamadı' })

    const fields = await db.query.kibiFields.findMany({
      where: (t, { eq }) => eq(t.moduleId, moduleRow.id),
      orderBy: (t, { asc }) => asc(t.position),
    })

    return {
      module: { key: moduleRow.key, label: moduleRow.label, icon: moduleRow.icon },
      fields: fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        isRequired: f.isRequired,
        isSystem: f.isSystem,
        config: f.config,
        position: f.position,
      })),
    }
  })
}

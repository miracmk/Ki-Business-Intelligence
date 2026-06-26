// FAZ 4.4: read-only metadata API for DynamicForm — exposes kibi_modules/kibi_fields so
// the frontend can render a form from field metadata instead of hardcoded JSX per module.
// FAZ 8.3: write endpoints for the "add custom field" wizard (list-based, not drag-drop
// canvas — same scope call as FAZ 6.3). System fields (is_system=true) can never be edited
// or deleted here — only custom fields a tenant added on top of the Base registry.
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db } from '../../lib/db.js'
import { kibiFields } from '../../../db/schema.js'
import { invalidateModuleSchemaCache } from '../../lib/metadata/resolver.js'

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
        id: f.id,
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

  const newFieldSchema = z.object({
    key: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9]*$/, 'camelCase olmalı'),
    label: z.string().min(1),
    type: z.enum(['text', 'number', 'date', 'boolean', 'select', 'relation', 'ai']),
    isRequired: z.boolean().optional(),
    config: z.record(z.unknown()).optional(),
  })

  app.post('/:moduleKey/fields', { onRequest: [app.authenticate] }, async (req, reply) => {
    const entityId = await resolveEntityId((req.user as any).tenantId)
    if (!entityId) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { moduleKey } = req.params as { moduleKey: string }
    const body = newFieldSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const moduleRow = await db.query.kibiModules.findFirst({
      where: (t, { eq, and }) => and(eq(t.entityId, entityId), eq(t.key, moduleKey)),
    })
    if (!moduleRow) return reply.status(404).send({ error: 'Modül bulunamadı' })

    const existing = await db.query.kibiFields.findMany({ where: (t, { eq }) => eq(t.moduleId, moduleRow.id) })
    if (existing.some((f) => f.key === body.data.key)) return reply.status(409).send({ error: 'Bu alan adı zaten kullanılıyor' })

    const [row] = await db.insert(kibiFields).values({
      moduleId: moduleRow.id,
      key: body.data.key,
      columnName: null, // custom field — always lives in custom_fields JSONB, never a real column
      label: body.data.label,
      type: body.data.type,
      isSystem: false,
      isRequired: body.data.isRequired ?? false,
      config: body.data.config ?? {},
      position: existing.length,
    }).returning()

    invalidateModuleSchemaCache(entityId)
    return reply.status(201).send({ field: row })
  })

  app.delete('/:moduleKey/fields/:fieldId', { onRequest: [app.authenticate] }, async (req, reply) => {
    const entityId = await resolveEntityId((req.user as any).tenantId)
    if (!entityId) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { moduleKey, fieldId } = req.params as { moduleKey: string; fieldId: string }

    const moduleRow = await db.query.kibiModules.findFirst({
      where: (t, { eq, and }) => and(eq(t.entityId, entityId), eq(t.key, moduleKey)),
    })
    if (!moduleRow) return reply.status(404).send({ error: 'Modül bulunamadı' })

    const field = await db.query.kibiFields.findFirst({ where: (t, { eq, and }) => and(eq(t.id, fieldId), eq(t.moduleId, moduleRow.id)) })
    if (!field) return reply.status(404).send({ error: 'Alan bulunamadı' })
    if (field.isSystem) return reply.status(403).send({ error: 'Sistem alanları silinemez' })

    await db.delete(kibiFields).where(eq(kibiFields.id, fieldId))
    invalidateModuleSchemaCache(entityId)
    return { ok: true }
  })

  // Bulk reorder — drives the wizard's up/down (or future drag-drop) field ordering.
  app.post('/:moduleKey/fields/reorder', { onRequest: [app.authenticate] }, async (req, reply) => {
    const entityId = await resolveEntityId((req.user as any).tenantId)
    if (!entityId) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { moduleKey } = req.params as { moduleKey: string }
    const body = z.object({ order: z.array(z.string().uuid()) }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const moduleRow = await db.query.kibiModules.findFirst({
      where: (t, { eq, and }) => and(eq(t.entityId, entityId), eq(t.key, moduleKey)),
    })
    if (!moduleRow) return reply.status(404).send({ error: 'Modül bulunamadı' })

    for (let i = 0; i < body.data.order.length; i++) {
      await db.update(kibiFields).set({ position: i }).where(and(eq(kibiFields.id, body.data.order[i]), eq(kibiFields.moduleId, moduleRow.id)))
    }
    invalidateModuleSchemaCache(entityId)
    return { ok: true }
  })
}

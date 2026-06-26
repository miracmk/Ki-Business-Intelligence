// FAZ 6.1/6.2: blueprint transitions CRUD + approval inbox. Approve/reject apply the change
// directly via queryEntitySchema (registry-resolved column, same pattern as the FAZ 5.5
// update_field handler) — NEVER by calling back into the module's PUT route, which would
// re-enter the beforeSave gate and could loop or re-deny the very change being approved.
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../../lib/db.js'
import { blueprintTransitions, blueprintApprovals } from '../../../db/schema.js'
import { queryEntitySchema } from '../../lib/entity-provisioner.js'
import { getModuleSchema } from '../../lib/metadata/resolver.js'

const transitionSchema = z.object({
  moduleKey: z.string().min(1),
  fieldKey: z.string().min(1),
  fromState: z.string().min(1),
  toState: z.string().min(1),
  conditions: z.unknown().optional().nullable(),
  requiresApprovalRole: z.string().optional().nullable(),
})

const isUUID = (s: string | null | undefined): boolean =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

async function resolveEntityId(tenantId: string | null): Promise<string | null> {
  if (!isUUID(tenantId)) return null
  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.entityId, tenantId!),
    columns: { id: true, isProvisioned: true },
  })
  if (!entity?.isProvisioned) return null
  return entity.id
}

export const blueprintRoutes: FastifyPluginAsync = async (app) => {
  // ── Transitions ────────────────────────────────────────────────────────────
  app.get('/transitions', { onRequest: [app.authenticate] }, async (req, reply) => {
    const entityId = await resolveEntityId((req.user as any).tenantId)
    if (!entityId) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { moduleKey } = req.query as { moduleKey?: string }
    const rows = await db.query.blueprintTransitions.findMany({
      where: (t, { eq, and }) => moduleKey
        ? and(eq(t.entityId, entityId), eq(t.moduleKey, moduleKey))
        : eq(t.entityId, entityId),
    })
    return { transitions: rows }
  })

  app.post('/transitions', { onRequest: [app.authenticate] }, async (req, reply) => {
    const entityId = await resolveEntityId((req.user as any).tenantId)
    if (!entityId) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = transitionSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const [row] = await db.insert(blueprintTransitions).values({
      entityId,
      moduleKey: body.data.moduleKey,
      fieldKey: body.data.fieldKey,
      fromState: body.data.fromState,
      toState: body.data.toState,
      conditions: body.data.conditions ?? null,
      requiresApprovalRole: body.data.requiresApprovalRole ?? null,
    }).returning()
    return reply.status(201).send({ transition: row })
  })

  app.delete('/transitions/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const entityId = await resolveEntityId((req.user as any).tenantId)
    if (!entityId) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await db.delete(blueprintTransitions).where(and(eq(blueprintTransitions.id, id), eq(blueprintTransitions.entityId, entityId)))
    return { ok: true }
  })

  // ── Approvals ──────────────────────────────────────────────────────────────
  app.get('/approvals', { onRequest: [app.authenticate] }, async (req, reply) => {
    const entityId = await resolveEntityId((req.user as any).tenantId)
    if (!entityId) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { status } = req.query as { status?: string }
    const rows = await db.query.blueprintApprovals.findMany({
      where: (t, { eq, and }) => status
        ? and(eq(t.entityId, entityId), eq(t.status, status as any))
        : eq(t.entityId, entityId),
      orderBy: (t, { desc }) => desc(t.createdAt),
    })
    return { approvals: rows }
  })

  app.post('/approvals/:id/approve', { onRequest: [app.authenticate] }, async (req, reply) => {
    const entityId = await resolveEntityId((req.user as any).tenantId)
    if (!entityId) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }

    const approval = await db.query.blueprintApprovals.findFirst({
      where: (t, { eq, and }) => and(eq(t.id, id), eq(t.entityId, entityId)),
    })
    if (!approval) return reply.status(404).send({ error: 'Onay bulunamadı' })
    if (approval.status !== 'pending') return reply.status(409).send({ error: 'Bu onay zaten sonuçlanmış' })

    const entity = await db.query.kibiEntities.findFirst({ where: (t, { eq }) => eq(t.id, entityId), columns: { entityDbSchema: true } })
    if (!entity?.entityDbSchema) return reply.status(404).send({ error: 'Entity şeması hazır değil' })

    // approval.fieldKey/toState come from OUR own blueprint_transitions row (set when the
    // approval was created), never directly from this request — safe to resolve+interpolate.
    const moduleSchema = await getModuleSchema(entityId, approval.moduleKey)
    const columnName = moduleSchema?.columnMap[approval.fieldKey] ?? approval.fieldKey
    const closingStages = ['won', 'lost']
    const extraSet = closingStages.includes(approval.toState) ? `, closed_at = NOW()` : ''
    await queryEntitySchema(
      entity.entityDbSchema,
      `UPDATE ${approval.table} SET ${columnName} = $1, updated_at = NOW()${extraSet} WHERE id = $2`,
      [approval.toState, approval.recordId],
    )

    await db.update(blueprintApprovals).set({
      status: 'approved',
      resolvedByUserId: isUUID((req.user as any).sub) ? (req.user as any).sub : null,
      resolvedAt: new Date(),
    }).where(eq(blueprintApprovals.id, id))

    return { ok: true }
  })

  app.post('/approvals/:id/reject', { onRequest: [app.authenticate] }, async (req, reply) => {
    const entityId = await resolveEntityId((req.user as any).tenantId)
    if (!entityId) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const result = await db.update(blueprintApprovals).set({
      status: 'rejected',
      resolvedByUserId: isUUID((req.user as any).sub) ? (req.user as any).sub : null,
      resolvedAt: new Date(),
    }).where(and(eq(blueprintApprovals.id, id), eq(blueprintApprovals.entityId, entityId), eq(blueprintApprovals.status, 'pending'))).returning()
    if (result.length === 0) return reply.status(409).send({ error: 'Onay bulunamadı veya zaten sonuçlanmış' })
    return { ok: true }
  })
}

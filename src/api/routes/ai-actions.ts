// FAZ 10.3/10.4: AI write approval inbox. Approve applies the proposal directly via
// records-bridge.ts (recordsCreate/Update/Delete) — never by calling back into a native
// CRUD route, same re-entrancy discipline as FAZ 6's blueprint approvals.
// Authorization: elevated roles may resolve ANY proposal (the dedicated inbox,
// frontend/src/pages/AiActions.tsx) — but the user who ASKED the AI to do this in the first
// place may also approve/reject their OWN proposal directly, e.g. by confirming in the same
// chat ("evet, onaylıyorum"). This isn't a privilege escalation: they already have ordinary
// CRUD access to this module via the native routes: approving their own AI-drafted version
// of an action they could already perform themselves isn't a new capability — same record-
// level scope rules from FAZ 9 still apply, this only removes the *human-only-if-elevated*
// detour for confirming your own request.
import type { FastifyPluginAsync } from 'fastify'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../../lib/db.js'
import { aiPendingActions, users } from '../../../db/schema.js'
import { recordsCreate, recordsUpdate, recordsDelete } from '../../engine/functions/records-bridge.js'

const ELEVATED_ROLES = new Set(['admin', 'supervisor', 'entity_main', 'entity_supervisor'])
const isUUID = (s: string | null | undefined): boolean =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

async function resolveEntity(tenantId: string | null): Promise<{ id: string; schema: string } | null> {
  if (!isUUID(tenantId)) return null
  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.entityId, tenantId!),
    columns: { id: true, isProvisioned: true, entityDbSchema: true },
  })
  if (!entity?.isProvisioned || !entity.entityDbSchema) return null
  return { id: entity.id, schema: entity.entityDbSchema }
}

export const aiActionRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const entity = await resolveEntity((req.user as any).tenantId)
    if (!entity) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { status } = req.query as { status?: string }
    const rows = await db.query.aiPendingActions.findMany({
      where: (t, { eq, and }) => status
        ? and(eq(t.entityId, entity.id), eq(t.status, status as any))
        : eq(t.entityId, entity.id),
      orderBy: (t, { desc }) => desc(t.createdAt),
      limit: 100,
    })
    return { actions: rows }
  })

  app.post('/:id/approve', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as any
    const entity = await resolveEntity(user.tenantId)
    if (!entity) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }

    const proposal = await db.query.aiPendingActions.findFirst({
      where: (t, { eq, and }) => and(eq(t.id, id), eq(t.entityId, entity.id)),
    })
    if (!proposal) return reply.status(404).send({ error: 'Öneri bulunamadı' })
    const isOwnRequest = isUUID(user.sub) && proposal.requestedByUserId === user.sub
    if (!ELEVATED_ROLES.has(user.role) && !isOwnRequest) {
      return reply.status(403).send({ error: 'Bu öneriyi yalnızca isteyen kişi veya yetkili bir kullanıcı onaylayabilir' })
    }
    if (proposal.status !== 'pending') return reply.status(409).send({ error: 'Bu öneri zaten sonuçlanmış' })

    // Mark approved BEFORE the actual write, not after: if this (trivial, in-DB) update were
    // to fail, nothing has been written yet — safe. Doing it the other way around once let a
    // write succeed, then fail to record as 'approved', leaving the proposal re-approvable
    // and producing a duplicate create on retry (caught live while testing this endpoint).
    const updated = await db.update(aiPendingActions).set({
      status: 'approved',
      resolvedByUserId: isUUID(user.sub) ? user.sub : null,
      resolvedAt: new Date(),
    }).where(and(eq(aiPendingActions.id, id), eq(aiPendingActions.status, 'pending'))).returning()
    if (updated.length === 0) return reply.status(409).send({ error: 'Bu öneri zaten sonuçlanmış' })

    try {
      if (proposal.action === 'create') {
        // Stamp ownership on AI-drafted creates: the AI never sets owner_id/created_by_user_id
        // itself (it doesn't know who's approving), and recordsCreate only writes registry-known
        // columns — for modules where these aren't registered fields this is a harmless no-op.
        // Without this, FAZ 9 scope filtering hides the new record from its own creator (caught
        // live when a self-approved AI-created contact had owner_id NULL).
        const ownerUserId = proposal.requestedByUserId ?? user.sub
        const data = {
          ...(proposal.proposedData ?? {}),
          ownerId: ownerUserId,
          createdByUserId: ownerUserId,
        }
        await recordsCreate(entity.id, entity.schema, proposal.moduleKey, data)
      } else if (proposal.action === 'update' || proposal.action === 'delete') {
        if (!proposal.recordId) throw new Error('recordId eksik')
        // FAZ 10.4 fix: re-apply FAZ 9 record-level scope using the ORIGINAL REQUESTER's
        // identity+role, not the approver's. The AI acted on the requester's behalf, so it may
        // only touch what the requester could already touch via the native CRUD routes — an
        // elevated approver clearing someone else's proposal doesn't grant the requester's
        // proposal extra reach. If requestedByUserId is missing (shouldn't happen for new
        // proposals — entity-agent.ts always sets it), scopeCondition fails CLOSED (1=0) for
        // owner-scoped modules rather than silently allowing the write.
        const requester = proposal.requestedByUserId
          ? await db.query.users.findFirst({ where: eq(users.id, proposal.requestedByUserId), columns: { role: true } })
          : null
        const actor = { sub: proposal.requestedByUserId ?? undefined, role: requester?.role }
        if (proposal.action === 'update') {
          await recordsUpdate(entity.id, entity.schema, proposal.moduleKey, proposal.recordId, proposal.proposedData ?? {}, actor)
        } else {
          await recordsDelete(entity.id, entity.schema, proposal.moduleKey, proposal.recordId, actor)
        }
      }
    } catch (err) {
      // Proposal stays 'approved' even though the write failed — visible/inspectable rather
      // than silently re-approvable (which is what caused the duplicate-write bug above).
      return reply.status(500).send({ error: `Onaylandı ama uygulanamadı: ${(err as Error).message}` })
    }

    return { ok: true }
  })

  app.post('/:id/reject', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as any
    const entity = await resolveEntity(user.tenantId)
    if (!entity) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }

    const proposal = await db.query.aiPendingActions.findFirst({
      where: (t, { eq, and }) => and(eq(t.id, id), eq(t.entityId, entity.id)),
    })
    if (!proposal) return reply.status(404).send({ error: 'Öneri bulunamadı' })
    const isOwnRequest = isUUID(user.sub) && proposal.requestedByUserId === user.sub
    if (!ELEVATED_ROLES.has(user.role) && !isOwnRequest) {
      return reply.status(403).send({ error: 'Bu öneriyi yalnızca isteyen kişi veya yetkili bir kullanıcı reddedebilir' })
    }

    const result = await db.update(aiPendingActions).set({
      status: 'rejected',
      resolvedByUserId: isUUID(user.sub) ? user.sub : null,
      resolvedAt: new Date(),
    }).where(and(eq(aiPendingActions.id, id), eq(aiPendingActions.entityId, entity.id), eq(aiPendingActions.status, 'pending'))).returning()

    if (result.length === 0) return reply.status(409).send({ error: 'Öneri bulunamadı veya zaten sonuçlanmış' })
    return { ok: true }
  })
}

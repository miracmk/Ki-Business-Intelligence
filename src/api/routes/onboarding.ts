// FAZ 8.1: industry template catalog + apply-to-entity. Applying a template only writes
// custom (is_system=false) kibi_fields rows on top of the already-seeded Base modules
// (FAZ 4.1) — no entity-schema migration needed, custom fields live in custom_fields JSONB.
import type { FastifyPluginAsync } from 'fastify'
import { db } from '../../lib/db.js'
import { kibiModules, kibiFields, blueprintTransitions, workflowRules } from '../../../db/schema.js'
import { invalidateModuleSchemaCache } from '../../lib/metadata/resolver.js'

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

interface TemplatePackage {
  fields: Array<{ moduleKey: string; key: string; label: string; type: string; config?: Record<string, unknown> }>
  blueprints: Array<{ moduleKey: string; fieldKey: string; fromState: string; toState: string; conditions?: unknown; requiresApprovalRole?: string }>
  rules: Array<{ moduleKey: string; name: string; trigger: string; conditions?: unknown; actions: unknown[] }>
}

export const onboardingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/templates', { onRequest: [app.authenticate] }, async () => {
    const rows = await db.query.industryTemplates.findMany()
    return { templates: rows.map((r) => ({ key: r.key, label: r.label })) }
  })

  app.post('/templates/:key/apply', { onRequest: [app.authenticate] }, async (req, reply) => {
    const entityId = await resolveEntityId((req.user as any).tenantId)
    if (!entityId) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { key } = req.params as { key: string }

    const template = await db.query.industryTemplates.findFirst({ where: (t, { eq }) => eq(t.key, key) })
    if (!template) return reply.status(404).send({ error: 'Şablon bulunamadı' })
    const pkg = template.packageJson as TemplatePackage

    const summary = { fields: 0, blueprints: 0, rules: 0, skippedModules: [] as string[] }

    for (const field of pkg.fields ?? []) {
      const moduleRow = await db.query.kibiModules.findFirst({
        where: (t, { eq, and }) => and(eq(t.entityId, entityId), eq(t.key, field.moduleKey)),
      })
      if (!moduleRow) { summary.skippedModules.push(field.moduleKey); continue }

      const existingFields = await db.query.kibiFields.findMany({ where: (t, { eq }) => eq(t.moduleId, moduleRow.id) })
      const nextPosition = existingFields.length

      await db.insert(kibiFields).values({
        moduleId: moduleRow.id,
        key: field.key,
        columnName: null,
        label: field.label,
        type: field.type as any,
        isSystem: false,
        isRequired: false,
        config: field.config ?? {},
        position: nextPosition,
      }).onConflictDoUpdate({
        target: [kibiFields.moduleId, kibiFields.key],
        set: { label: field.label, type: field.type as any, config: field.config ?? {} },
      })
      summary.fields++
    }

    for (const bp of pkg.blueprints ?? []) {
      await db.insert(blueprintTransitions).values({
        entityId,
        moduleKey: bp.moduleKey,
        fieldKey: bp.fieldKey,
        fromState: bp.fromState,
        toState: bp.toState,
        conditions: bp.conditions ?? null,
        requiresApprovalRole: bp.requiresApprovalRole ?? null,
      })
      summary.blueprints++
    }

    for (const rule of pkg.rules ?? []) {
      await db.insert(workflowRules).values({
        entityId,
        moduleKey: rule.moduleKey,
        name: rule.name,
        trigger: rule.trigger as any,
        conditions: rule.conditions ?? null,
        actions: rule.actions ?? [],
      })
      summary.rules++
    }

    invalidateModuleSchemaCache(entityId)
    return { ok: true, applied: summary }
  })
}

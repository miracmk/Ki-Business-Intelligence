// YFZ 34 Faz 3: native Base CRM CRUD — contacts/companies/deals/activities, written
// directly to entity-schema crm_* tables via queryEntitySchema (parameterized SQL,
// these tables aren't modeled in db/schema.ts). Separate file from crm.ts on purpose:
// crm.ts is entirely external-connector lifecycle (OAuth/sync/DB-test) — keeping native
// CRUD here avoids any risk of regressing the connector wizard. See KIBIPR.md §6/§14.2.
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '../../lib/db.js'
import { blueprintApprovals } from '../../../db/schema.js'
import { queryEntitySchema } from '../../lib/entity-provisioner.js'
import { getModuleSchema, type ModuleSchema } from '../../lib/metadata/resolver.js'
import { runHooks, runBeforeSaveHooks } from '../../lib/hooks/lifecycle.js'

const contactSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  fullName: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  emailSecondary: z.string().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  companyName: z.string().optional(),
  jobTitle: z.string().optional(),
  department: z.string().optional(),
  website: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  contactType: z.enum(['lead', 'contact', 'customer', 'partner', 'vendor']).optional(),
  leadSource: z.string().optional(),
  leadStatus: z.string().optional(),
  status: z.string().optional(),
  leadScore: z.number().optional(),
  opportunityScore: z.number().optional(),
  companyId: z.string().uuid().optional().nullable(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.unknown()).optional(),
  doNotContact: z.boolean().optional(),
}).passthrough()
// .passthrough(): registry-driven custom fields (FAZ 4.3/8.1) are dynamic keys this static
// schema can't know about ahead of time. Without it Zod silently drops them before
// buildInsert/buildUpdate ever see them — found live while testing an applied industry
// template's custom field (contractValue never reached custom_fields). buildInsert/buildUpdate
// remain the safety boundary: only registry-known keys (columnMap or customFieldKeys) are
// ever used, so passthrough here doesn't widen what can reach SQL.

const companySchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional(),
  industry: z.string().optional(),
  subIndustry: z.string().optional(),
  companyType: z.enum(['prospect', 'customer', 'partner', 'vendor', 'competitor']).optional(),
  employeeCount: z.number().optional(),
  annualRevenue: z.number().optional(),
  currency: z.string().optional(),
  website: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  linkedinUrl: z.string().optional(),
  taxNumber: z.string().optional(),
  taxOffice: z.string().optional(),
  mersisNumber: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  accountScore: z.number().optional(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  parentCompanyId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.unknown()).optional(),
}).passthrough() // see contactSchema's .passthrough() comment above

const dealSchema = z.object({
  title: z.string().min(1),
  contactId: z.string().uuid().optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  pipelineName: z.string().optional(),
  stage: z.enum(['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost']).optional(),
  probability: z.number().optional(),
  dealValue: z.number().optional(),
  currency: z.string().optional(),
  recurringRevenue: z.number().optional(),
  expectedCloseDate: z.string().optional(),
  actualCloseDate: z.string().optional(),
  leadSource: z.string().optional(),
  lostReason: z.string().optional(),
  wonReason: z.string().optional(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.unknown()).optional(),
}).passthrough() // see contactSchema's .passthrough() comment above

const activitySchema = z.object({
  type: z.enum(['call', 'email', 'meeting', 'task', 'note', 'demo']),
  subject: z.string().optional(),
  description: z.string().optional(),
  contactId: z.string().uuid().optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  dealId: z.string().uuid().optional().nullable(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  status: z.enum(['planned', 'in_progress', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueDate: z.string().optional(),
  startDate: z.string().optional(),
  location: z.string().optional(),
  outcome: z.string().optional(),
  followUpRequired: z.boolean().optional(),
  followUpDate: z.string().optional(),
})

const COLUMN_MAP: Record<string, Record<string, string>> = {
  crm_contacts: {
    firstName: 'first_name', lastName: 'last_name', fullName: 'full_name', email: 'email',
    emailSecondary: 'email_secondary', phone: 'phone', mobile: 'mobile', companyName: 'company_name',
    jobTitle: 'job_title', department: 'department', website: 'website',
    addressLine1: 'address_line1', addressLine2: 'address_line2', city: 'city', state: 'state',
    country: 'country', postalCode: 'postal_code', contactType: 'contact_type', leadSource: 'lead_source',
    leadStatus: 'lead_status', status: 'status', leadScore: 'lead_score', opportunityScore: 'opportunity_score',
    companyId: 'company_id', assignedToUserId: 'assigned_to_user_id', tags: 'tags',
    customFields: 'custom_fields', doNotContact: 'do_not_contact',
  },
  crm_companies: {
    name: 'name', legalName: 'legal_name', industry: 'industry', subIndustry: 'sub_industry',
    companyType: 'company_type', employeeCount: 'employee_count', annualRevenue: 'annual_revenue',
    currency: 'currency', website: 'website', email: 'email', phone: 'phone', linkedinUrl: 'linkedin_url',
    taxNumber: 'tax_number', taxOffice: 'tax_office', mersisNumber: 'mersis_number',
    addressLine1: 'address_line1', addressLine2: 'address_line2', city: 'city', state: 'state',
    country: 'country', postalCode: 'postal_code', accountScore: 'account_score',
    assignedToUserId: 'assigned_to_user_id', parentCompanyId: 'parent_company_id', tags: 'tags',
    customFields: 'custom_fields',
  },
  crm_deals: {
    title: 'title', contactId: 'contact_id', companyId: 'company_id', pipelineName: 'pipeline_name',
    stage: 'stage', probability: 'probability', dealValue: 'deal_value', currency: 'currency',
    recurringRevenue: 'recurring_revenue', expectedCloseDate: 'expected_close_date',
    actualCloseDate: 'actual_close_date', leadSource: 'lead_source', lostReason: 'lost_reason',
    wonReason: 'won_reason', assignedToUserId: 'assigned_to_user_id', tags: 'tags', customFields: 'custom_fields',
  },
  crm_activities: {
    type: 'type', subject: 'subject', description: 'description', contactId: 'contact_id',
    companyId: 'company_id', dealId: 'deal_id', assignedToUserId: 'assigned_to_user_id',
    status: 'status', priority: 'priority', dueDate: 'due_date', startDate: 'start_date',
    location: 'location', outcome: 'outcome', followUpRequired: 'follow_up_required', followUpDate: 'follow_up_date',
  },
}

function selectCols(table: keyof typeof COLUMN_MAP, extra: string[] = []): string {
  const fieldCols = Object.entries(COLUMN_MAP[table]).map(([camel, snake]) => `${snake} AS "${camel}"`)
  return ['id', ...fieldCols, ...extra].join(', ')
}

// FAZ 4.3: `moduleSchema` (registry-driven, see resolver.ts) overrides COLUMN_MAP when
// present; registry-empty modules fall back to the static COLUMN_MAP unchanged. Keys not
// in the column map but listed as a registry custom field merge into custom_fields JSONB
// instead of being silently dropped — this is the new capability 4.4's dynamic form will
// rely on. No registry-defined custom field may be named 'customFields' (reserved for the
// legacy full-object body field, which keeps overwriting custom_fields wholesale).
function buildInsert(table: keyof typeof COLUMN_MAP, data: Record<string, unknown>, moduleSchema?: ModuleSchema | null) {
  // Merge per-key, not whole-module replace: a key missing from the registry (e.g. not
  // seeded yet) still resolves via the static COLUMN_MAP instead of silently dropping.
  const map = { ...COLUMN_MAP[table], ...(moduleSchema?.columnMap ?? {}) }
  const customKeys = moduleSchema?.customFieldKeys
  const cols: string[] = []
  const params: unknown[] = []
  let customPayload: Record<string, unknown> | undefined
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue
    if (map[key] === 'custom_fields' && val && typeof val === 'object') {
      customPayload = { ...customPayload, ...(val as Record<string, unknown>) }
      continue
    }
    if (map[key]) {
      cols.push(map[key])
      params.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val)
    } else if (customKeys?.has(key)) {
      customPayload = { ...customPayload, [key]: val }
    }
  }
  if (customPayload) {
    cols.push('custom_fields')
    params.push(JSON.stringify(customPayload))
  }
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  return { cols, placeholders, params }
}

function buildUpdate(table: keyof typeof COLUMN_MAP, data: Record<string, unknown>, moduleSchema?: ModuleSchema | null) {
  // Merge per-key, not whole-module replace — see buildInsert comment above.
  const map = { ...COLUMN_MAP[table], ...(moduleSchema?.columnMap ?? {}) }
  const customKeys = moduleSchema?.customFieldKeys
  const sets: string[] = []
  const params: unknown[] = []
  let customPayload: Record<string, unknown> | undefined
  let fullOverwrite = false
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue
    if (map[key] === 'custom_fields' && val && typeof val === 'object') {
      customPayload = { ...customPayload, ...(val as Record<string, unknown>) }
      fullOverwrite = true
      continue
    }
    if (map[key]) {
      params.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val)
      sets.push(`${map[key]} = $${params.length}`)
      continue
    }
    if (customKeys?.has(key)) {
      customPayload = { ...customPayload, [key]: val }
    }
  }
  if (customPayload) {
    params.push(JSON.stringify(customPayload))
    // Legacy `customFields` body field keeps its full-overwrite semantics; genuinely
    // dynamic per-field custom keys merge non-destructively into existing JSONB instead.
    sets.push(fullOverwrite
      ? `custom_fields = $${params.length}`
      : `custom_fields = custom_fields || $${params.length}::jsonb`)
  }
  return { sets, params }
}

const isUUID = (s: string | null | undefined): boolean =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

async function resolveEntityContext(tenantId: string | null): Promise<{ entityId: string; schema: string } | null> {
  if (!isUUID(tenantId)) return null
  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.entityId, tenantId!),
    columns: { id: true, entityDbSchema: true, isProvisioned: true },
  })
  if (!entity?.isProvisioned || !entity.entityDbSchema) return null
  return { entityId: entity.id, schema: entity.entityDbSchema }
}

export const crmNativeRoutes: FastifyPluginAsync = async (app) => {

  // ── Contacts ───────────────────────────────────────────────────────────────
  app.get('/contacts', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { type, search } = req.query as Record<string, string>
    const conditions = ['deleted_at IS NULL']
    const params: unknown[] = []
    if (type) { params.push(type); conditions.push(`contact_type = $${params.length}`) }
    if (search) { params.push(`%${search}%`); conditions.push(`(full_name ILIKE $${params.length} OR email ILIKE $${params.length} OR company_name ILIKE $${params.length})`) }
    const contacts = await queryEntitySchema(ctx.schema, `
      SELECT ${selectCols('crm_contacts', ['created_at AS "createdAt"', 'updated_at AS "updatedAt"'])}
      FROM crm_contacts WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC
    `, params)
    return { contacts }
  })

  app.post('/contacts', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = contactSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const data = { ...body.data, fullName: body.data.fullName || [body.data.firstName, body.data.lastName].filter(Boolean).join(' ') || undefined }
    const moduleSchema = await getModuleSchema(ctx.entityId, 'crm_contacts')
    const { cols, placeholders, params } = buildInsert('crm_contacts', data, moduleSchema)
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO crm_contacts (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
      RETURNING ${selectCols('crm_contacts')}
    `, params)
    await runHooks('afterSave', { entityId: ctx.entityId, schema: ctx.schema, moduleKey: 'crm_contacts', table: 'crm_contacts', trigger: 'on_create', record: rows[0] })
    return reply.status(201).send({ contact: rows[0] })
  })

  app.put('/contacts/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const body = contactSchema.partial().safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const moduleSchema = await getModuleSchema(ctx.entityId, 'crm_contacts')
    const { sets, params } = buildUpdate('crm_contacts', body.data, moduleSchema)
    if (sets.length === 0) return { ok: true }
    params.push(id)
    await queryEntitySchema(ctx.schema, `UPDATE crm_contacts SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params)
    const [updated] = await queryEntitySchema(ctx.schema, `SELECT ${selectCols('crm_contacts')} FROM crm_contacts WHERE id = $1`, [id])
    if (updated) await runHooks('afterSave', { entityId: ctx.entityId, schema: ctx.schema, moduleKey: 'crm_contacts', table: 'crm_contacts', trigger: 'on_update', record: updated })
    return { ok: true }
  })

  app.delete('/contacts/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    // Soft delete — consistent with deleted_at column + GDPR-minded entity-schema design
    await queryEntitySchema(ctx.schema, `UPDATE crm_contacts SET deleted_at = NOW() WHERE id = $1`, [id])
    return { ok: true }
  })

  // ── Companies ──────────────────────────────────────────────────────────────
  app.get('/companies', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { search } = req.query as Record<string, string>
    const conditions = ['deleted_at IS NULL']
    const params: unknown[] = []
    if (search) { params.push(`%${search}%`); conditions.push(`name ILIKE $${params.length}`) }
    const companies = await queryEntitySchema(ctx.schema, `
      SELECT ${selectCols('crm_companies', ['created_at AS "createdAt"', 'updated_at AS "updatedAt"'])}
      FROM crm_companies WHERE ${conditions.join(' AND ')} ORDER BY name ASC
    `, params)
    return { companies }
  })

  app.post('/companies', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = companySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const moduleSchema = await getModuleSchema(ctx.entityId, 'crm_companies')
    const { cols, placeholders, params } = buildInsert('crm_companies', body.data, moduleSchema)
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO crm_companies (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
      RETURNING ${selectCols('crm_companies')}
    `, params)
    await runHooks('afterSave', { entityId: ctx.entityId, schema: ctx.schema, moduleKey: 'crm_companies', table: 'crm_companies', trigger: 'on_create', record: rows[0] })
    return reply.status(201).send({ company: rows[0] })
  })

  app.put('/companies/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const body = companySchema.partial().safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const moduleSchema = await getModuleSchema(ctx.entityId, 'crm_companies')
    const { sets, params } = buildUpdate('crm_companies', body.data, moduleSchema)
    if (sets.length === 0) return { ok: true }
    params.push(id)
    await queryEntitySchema(ctx.schema, `UPDATE crm_companies SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params)
    const [updated] = await queryEntitySchema(ctx.schema, `SELECT ${selectCols('crm_companies')} FROM crm_companies WHERE id = $1`, [id])
    if (updated) await runHooks('afterSave', { entityId: ctx.entityId, schema: ctx.schema, moduleKey: 'crm_companies', table: 'crm_companies', trigger: 'on_update', record: updated })
    return { ok: true }
  })

  app.delete('/companies/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await queryEntitySchema(ctx.schema, `UPDATE crm_companies SET deleted_at = NOW() WHERE id = $1`, [id])
    return { ok: true }
  })

  // ── Deals ──────────────────────────────────────────────────────────────────
  app.get('/deals', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { stage } = req.query as Record<string, string>
    const conditions = ['deleted_at IS NULL']
    const params: unknown[] = []
    if (stage) { params.push(stage); conditions.push(`stage = $${params.length}`) }
    const deals = await queryEntitySchema(ctx.schema, `
      SELECT ${selectCols('crm_deals', ['created_at AS "createdAt"', 'updated_at AS "updatedAt"', 'closed_at AS "closedAt"'])}
      FROM crm_deals WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC
    `, params)
    return { deals }
  })

  app.post('/deals', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = dealSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const moduleSchema = await getModuleSchema(ctx.entityId, 'crm_deals')
    const { cols, placeholders, params } = buildInsert('crm_deals', body.data, moduleSchema)
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO crm_deals (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
      RETURNING ${selectCols('crm_deals')}
    `, params)
    await runHooks('afterSave', { entityId: ctx.entityId, schema: ctx.schema, moduleKey: 'crm_deals', table: 'crm_deals', trigger: 'on_create', record: rows[0] })
    return reply.status(201).send({ deal: rows[0] })
  })

  app.put('/deals/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const body = dealSchema.partial().safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const moduleSchema = await getModuleSchema(ctx.entityId, 'crm_deals')
    const { sets, params } = buildUpdate('crm_deals', body.data, moduleSchema)
    if (sets.length === 0) return { ok: true }

    // FAZ 6.2: beforeSave gate. `record` here is the PROJECTED post-write state
    // ({...prev, ...patch}) — not just the patch — so conditions can reference fields the
    // caller didn't touch (e.g. dealValue when only `stage` is in the request body).
    const [prev] = await queryEntitySchema(ctx.schema, `SELECT ${selectCols('crm_deals')} FROM crm_deals WHERE id = $1`, [id])
    if (!prev) return reply.status(404).send({ error: 'Anlaşma bulunamadı' })
    const projected = { ...prev, ...body.data }
    const gate = await runBeforeSaveHooks({ entityId: ctx.entityId, schema: ctx.schema, moduleKey: 'crm_deals', table: 'crm_deals', trigger: 'on_update', record: projected, prev })
    if (!gate.allowed) {
      if (gate.pendingApproval && gate.transitionId) {
        await db.insert(blueprintApprovals).values({
          entityId: ctx.entityId,
          moduleKey: 'crm_deals',
          table: 'crm_deals',
          recordId: id,
          fieldKey: 'stage',
          fromState: String(prev.stage),
          toState: String(projected.stage),
          transitionId: gate.transitionId,
          requestedByUserId: isUUID((req.user as any).sub) ? (req.user as any).sub : null,
        })
        return reply.status(202).send({ pendingApproval: true, reason: gate.reason })
      }
      return reply.status(422).send({ error: gate.reason ?? 'Geçişe izin verilmiyor' })
    }

    const closingStages = ['won', 'lost']
    const extraSet = body.data.stage && closingStages.includes(body.data.stage) ? `, closed_at = NOW()` : ''
    params.push(id)
    await queryEntitySchema(ctx.schema, `UPDATE crm_deals SET ${sets.join(', ')}, updated_at = NOW()${extraSet} WHERE id = $${params.length}`, params)
    const [updated] = await queryEntitySchema(ctx.schema, `SELECT ${selectCols('crm_deals')} FROM crm_deals WHERE id = $1`, [id])
    if (updated) await runHooks('afterSave', { entityId: ctx.entityId, schema: ctx.schema, moduleKey: 'crm_deals', table: 'crm_deals', trigger: 'on_update', record: updated })
    return { ok: true }
  })

  app.delete('/deals/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await queryEntitySchema(ctx.schema, `UPDATE crm_deals SET deleted_at = NOW() WHERE id = $1`, [id])
    return { ok: true }
  })

  // ── Activities ─────────────────────────────────────────────────────────────
  app.get('/activities', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { dealId, contactId } = req.query as Record<string, string>
    const conditions: string[] = []
    const params: unknown[] = []
    if (dealId) { params.push(dealId); conditions.push(`deal_id = $${params.length}`) }
    if (contactId) { params.push(contactId); conditions.push(`contact_id = $${params.length}`) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const activities = await queryEntitySchema(ctx.schema, `
      SELECT ${selectCols('crm_activities', ['created_at AS "createdAt"', 'updated_at AS "updatedAt"', 'completed_at AS "completedAt"', 'duration_minutes AS "durationMinutes"'])}
      FROM crm_activities ${where} ORDER BY COALESCE(due_date, created_at) DESC
    `, params)
    return { activities }
  })

  app.post('/activities', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = activitySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const moduleSchema = await getModuleSchema(ctx.entityId, 'crm_activities')
    const { cols, placeholders, params } = buildInsert('crm_activities', body.data, moduleSchema)
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO crm_activities (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
      RETURNING ${selectCols('crm_activities')}
    `, params)
    // aiFieldHook self-skips crm_activities (no custom_fields column); ruleEngineHook still runs.
    await runHooks('afterSave', { entityId: ctx.entityId, schema: ctx.schema, moduleKey: 'crm_activities', table: 'crm_activities', trigger: 'on_create', record: rows[0] })
    return reply.status(201).send({ activity: rows[0] })
  })

  app.put('/activities/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const body = activitySchema.partial().safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const moduleSchema = await getModuleSchema(ctx.entityId, 'crm_activities')
    const { sets, params } = buildUpdate('crm_activities', body.data, moduleSchema)
    if (sets.length === 0) return { ok: true }
    const extraSet = body.data.status === 'completed' ? `, completed_at = NOW()` : ''
    params.push(id)
    await queryEntitySchema(ctx.schema, `UPDATE crm_activities SET ${sets.join(', ')}, updated_at = NOW()${extraSet} WHERE id = $${params.length}`, params)
    const [updated] = await queryEntitySchema(ctx.schema, `SELECT ${selectCols('crm_activities')} FROM crm_activities WHERE id = $1`, [id])
    if (updated) await runHooks('afterSave', { entityId: ctx.entityId, schema: ctx.schema, moduleKey: 'crm_activities', table: 'crm_activities', trigger: 'on_update', record: updated })
    return { ok: true }
  })

  app.delete('/activities/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await queryEntitySchema(ctx.schema, `DELETE FROM crm_activities WHERE id = $1`, [id])
    return { ok: true }
  })
}

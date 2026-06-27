// FAZ 7.2: ctx.records.* host implementation. Reuses the FAZ 4.3 registry (getModuleSchema)
// for column resolution — same discipline as the FAZ 5.5 update_field handler: a function's
// `moduleKey`/field keys are user input (the function author's code), so the only strings
// that ever reach SQL are columns WE already know exist via the registry, never raw user data.
// Hard-locked to the `schema`/`entityId` passed in by the caller — a function can never
// address another tenant's schema because there's no parameter through which to pass one.
import { db } from '../../lib/db.js'
import { queryEntitySchema } from '../../lib/entity-provisioner.js'
import { getModuleSchema } from '../../lib/metadata/resolver.js'
import { applyScope, scopeCondition, type ScopeUser } from '../../lib/security/scope.js'

const MAX_FIND_ROWS = 50

// FAZ 10.4 fix: mirrors exactly which modules crm-native.ts already scopes natively (FAZ 9) —
// not every module has an owner/creator column (most ERP/Accounting tables don't), so this is
// intentionally a small allowlist, not a registry-derived guess. `actor` is optional and only
// the AI tool layer (src/engine/ai/crud-tools.ts) passes one: Custom Functions (FAZ 7) and the
// Import flow (FAZ 8) call these unscoped, same as before — they run with the operator's own
// already-elevated configuration, not on behalf of a chatting end user.
const OWNER_COLUMN_BY_MODULE: Record<string, string> = {
  crm_contacts: 'owner_id',
  crm_companies: 'owner_id',
  crm_deals: 'owner_id',
  crm_activities: 'created_by_user_id',
}

async function moduleRowFor(entityId: string, moduleKey: string): Promise<{ physicalTable: string | null; hasDeletedAt: boolean } | null> {
  const moduleRow = await db.query.kibiModules.findFirst({
    where: (t, { eq, and }) => and(eq(t.entityId, entityId), eq(t.key, moduleKey)),
  })
  if (!moduleRow) return null
  return { physicalTable: moduleRow.physicalTable, hasDeletedAt: moduleRow.hasDeletedAt }
}

async function physicalTableFor(entityId: string, moduleKey: string): Promise<string | null> {
  const row = await moduleRowFor(entityId, moduleKey)
  return row?.physicalTable ?? null
}

export async function recordsFind(entityId: string, schema: string, moduleKey: string, filter: Record<string, unknown>, actor?: ScopeUser): Promise<unknown[]> {
  const moduleRow = await moduleRowFor(entityId, moduleKey)
  if (!moduleRow?.physicalTable) throw new Error(`Modül bulunamadı: ${moduleKey}`)
  const moduleSchema = await getModuleSchema(entityId, moduleKey)
  if (!moduleSchema) return []

  // FAZ 10.2: only filter by deleted_at when the registry says this table actually has the
  // column (kibiModules.hasDeletedAt) — most ERP/Accounting tables don't, and hardcoding this
  // used to make every find() on those tables silently return [] via the catch-all below.
  const conditions: string[] = moduleRow.hasDeletedAt ? ['deleted_at IS NULL'] : []
  const params: unknown[] = []
  if (actor && OWNER_COLUMN_BY_MODULE[moduleKey]) {
    applyScope(conditions, params, actor, OWNER_COLUMN_BY_MODULE[moduleKey])
  }
  for (const [key, val] of Object.entries(filter ?? {})) {
    const col = moduleSchema.columnMap[key]
    if (!col) continue // unknown filter key — silently ignored, never reaches SQL
    params.push(val)
    conditions.push(`${col} = $${params.length}`)
  }

  const selectCols = Object.entries(moduleSchema.columnMap).map(([camel, col]) => `${col} AS "${camel}"`).join(', ')
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = await queryEntitySchema(
    schema,
    `SELECT id, ${selectCols} FROM ${moduleRow.physicalTable} ${where} LIMIT ${MAX_FIND_ROWS}`,
    params,
  )
  return rows
}

export async function recordsCreate(entityId: string, schema: string, moduleKey: string, data: Record<string, unknown>): Promise<unknown> {
  const table = await physicalTableFor(entityId, moduleKey)
  if (!table) throw new Error(`Modül bulunamadı: ${moduleKey}`)
  const moduleSchema = await getModuleSchema(entityId, moduleKey)
  if (!moduleSchema) throw new Error(`Modül registry'de tanımlı değil: ${moduleKey}`)

  const cols: string[] = []
  const params: unknown[] = []
  let customPayload: Record<string, unknown> | undefined
  for (const [key, val] of Object.entries(data ?? {})) {
    if (val === undefined) continue
    const col = moduleSchema.columnMap[key]
    if (col) {
      cols.push(col)
      params.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val)
    } else if (moduleSchema.customFieldKeys.has(key)) {
      customPayload = { ...customPayload, [key]: val }
    }
  }
  if (customPayload) {
    cols.push('custom_fields')
    params.push(JSON.stringify(customPayload))
  }
  if (cols.length === 0) throw new Error('Geçerli alan yok (registry ile eşleşmedi)')

  const placeholders = cols.map((_, i) => `$${i + 1}`)
  const [row] = await queryEntitySchema(schema, `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`, params)
  return row
}

export async function recordsUpdate(entityId: string, schema: string, moduleKey: string, id: string, data: Record<string, unknown>, actor?: ScopeUser): Promise<void> {
  const table = await physicalTableFor(entityId, moduleKey)
  if (!table) throw new Error(`Modül bulunamadı: ${moduleKey}`)
  const moduleSchema = await getModuleSchema(entityId, moduleKey)
  if (!moduleSchema) throw new Error(`Modül registry'de tanımlı değil: ${moduleKey}`)

  const sets: string[] = []
  const params: unknown[] = []
  let customPayload: Record<string, unknown> | undefined
  for (const [key, val] of Object.entries(data ?? {})) {
    if (val === undefined) continue
    const col = moduleSchema.columnMap[key]
    if (col) {
      params.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val)
      sets.push(`${col} = $${params.length}`)
    } else if (moduleSchema.customFieldKeys.has(key)) {
      customPayload = { ...customPayload, [key]: val }
    }
  }
  if (customPayload) {
    params.push(JSON.stringify(customPayload))
    sets.push(`custom_fields = custom_fields || $${params.length}::jsonb`)
  }
  if (sets.length === 0) return

  params.push(id)
  const idPlaceholder = params.length
  // FAZ 10.4 fix: an `actor` here (only ever passed by the AI approval path) re-applies FAZ 9
  // record-level scope at the actual write — without this, an AI-proposed update could be
  // self-approved by its requester to silently modify a record they could never touch via the
  // native CRUD routes (caught in review, not live testing — see KIBIPR.md FAZ 10.4).
  const scope = actor && OWNER_COLUMN_BY_MODULE[moduleKey] ? scopeCondition(params, actor, OWNER_COLUMN_BY_MODULE[moduleKey]) : ''
  const result = await queryEntitySchema(schema, `UPDATE ${table} SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idPlaceholder}${scope} RETURNING id`, params)
  if (actor && OWNER_COLUMN_BY_MODULE[moduleKey] && (result as unknown[]).length === 0) {
    throw new Error('Bu kaydı güncelleme yetkiniz yok veya kayıt bulunamadı')
  }
}

// FAZ 10.3: generic delete for the AI approval queue. Uses the registry's hasDeletedAt flag
// (soft-delete if the table has it, hard DELETE otherwise) — this is a deliberately generic
// default, NOT each native route's bespoke "delete" semantics (e.g. erp_suppliers flips
// is_active, erp_orders sets status='cancelled'). A human approves every delete anyway; if
// a module needs its specific native behavior, use that module's own UI instead.
export async function recordsDelete(entityId: string, schema: string, moduleKey: string, id: string, actor?: ScopeUser): Promise<void> {
  const moduleRow = await moduleRowFor(entityId, moduleKey)
  if (!moduleRow?.physicalTable) throw new Error(`Modül bulunamadı: ${moduleKey}`)
  const params: unknown[] = [id]
  // Same FAZ 10.4 fix as recordsUpdate above — re-apply FAZ 9 scope at the actual delete.
  const scope = actor && OWNER_COLUMN_BY_MODULE[moduleKey] ? scopeCondition(params, actor, OWNER_COLUMN_BY_MODULE[moduleKey]) : ''
  const result = moduleRow.hasDeletedAt
    ? await queryEntitySchema(schema, `UPDATE ${moduleRow.physicalTable} SET deleted_at = NOW() WHERE id = $1${scope} RETURNING id`, params)
    : await queryEntitySchema(schema, `DELETE FROM ${moduleRow.physicalTable} WHERE id = $1${scope} RETURNING id`, params)
  if (actor && OWNER_COLUMN_BY_MODULE[moduleKey] && (result as unknown[]).length === 0) {
    throw new Error('Bu kaydı silme yetkiniz yok veya kayıt bulunamadı')
  }
}

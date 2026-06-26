// FAZ 7.2: ctx.records.* host implementation. Reuses the FAZ 4.3 registry (getModuleSchema)
// for column resolution — same discipline as the FAZ 5.5 update_field handler: a function's
// `moduleKey`/field keys are user input (the function author's code), so the only strings
// that ever reach SQL are columns WE already know exist via the registry, never raw user data.
// Hard-locked to the `schema`/`entityId` passed in by the caller — a function can never
// address another tenant's schema because there's no parameter through which to pass one.
import { db } from '../../lib/db.js'
import { queryEntitySchema } from '../../lib/entity-provisioner.js'
import { getModuleSchema } from '../../lib/metadata/resolver.js'

const MAX_FIND_ROWS = 50

async function physicalTableFor(entityId: string, moduleKey: string): Promise<string | null> {
  const moduleRow = await db.query.kibiModules.findFirst({
    where: (t, { eq, and }) => and(eq(t.entityId, entityId), eq(t.key, moduleKey)),
  })
  return moduleRow?.physicalTable ?? null
}

export async function recordsFind(entityId: string, schema: string, moduleKey: string, filter: Record<string, unknown>): Promise<unknown[]> {
  const table = await physicalTableFor(entityId, moduleKey)
  if (!table) throw new Error(`Modül bulunamadı: ${moduleKey}`)
  const moduleSchema = await getModuleSchema(entityId, moduleKey)
  if (!moduleSchema) return []

  const conditions: string[] = ['deleted_at IS NULL']
  const params: unknown[] = []
  for (const [key, val] of Object.entries(filter ?? {})) {
    const col = moduleSchema.columnMap[key]
    if (!col) continue // unknown filter key — silently ignored, never reaches SQL
    params.push(val)
    conditions.push(`${col} = $${params.length}`)
  }

  const selectCols = Object.entries(moduleSchema.columnMap).map(([camel, col]) => `${col} AS "${camel}"`).join(', ')
  const rows = await queryEntitySchema(
    schema,
    `SELECT id, ${selectCols} FROM ${table} WHERE ${conditions.join(' AND ')} LIMIT ${MAX_FIND_ROWS}`,
    params,
  ).catch(() => []) // deleted_at may not exist on every table — fall back gracefully
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

export async function recordsUpdate(entityId: string, schema: string, moduleKey: string, id: string, data: Record<string, unknown>): Promise<void> {
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
  await queryEntitySchema(schema, `UPDATE ${table} SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params)
}

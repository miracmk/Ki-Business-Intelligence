// FAZ 5.5: update_field action handler. `field` comes from workflow_rules.actions JSONB —
// admin-authored, but never trusted as a raw SQL identifier. We resolve it through the same
// FAZ 4.3 registry (getModuleSchema) the native routes use, so the only string that ever
// reaches SQL is a column name WE already know exists, never the job payload's `field`
// itself. Unknown fields are rejected rather than silently dropped.
import { queryEntitySchema } from '../../lib/entity-provisioner.js'
import { getModuleSchema } from '../../lib/metadata/resolver.js'

export interface UpdateFieldJobData {
  entityId: string
  schema: string
  moduleKey: string
  table: string
  recordId: string
  field: string
  value: unknown
}

export async function updateFieldHandler(data: UpdateFieldJobData): Promise<void> {
  const moduleSchema = await getModuleSchema(data.entityId, data.moduleKey)
  const columnName = moduleSchema?.columnMap[data.field]
  const isCustomField = moduleSchema?.customFieldKeys.has(data.field)

  const serialized = typeof data.value === 'object' && data.value !== null ? JSON.stringify(data.value) : data.value

  if (columnName) {
    await queryEntitySchema(
      data.schema,
      `UPDATE ${data.table} SET ${columnName} = $1, updated_at = NOW() WHERE id = $2`,
      [serialized, data.recordId],
    )
  } else if (isCustomField) {
    await queryEntitySchema(
      data.schema,
      `UPDATE ${data.table} SET custom_fields = custom_fields || $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify({ [data.field]: data.value }), data.recordId],
    )
  } else {
    throw new Error(`update_field: '${data.field}' alanı ${data.moduleKey} registry'sinde bulunamadı`)
  }
}

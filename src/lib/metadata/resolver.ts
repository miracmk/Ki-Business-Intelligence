// FAZ 4.3: registry-driven column mapping for native CRUD routes. Callers keep their
// own static COLUMN_MAP and pass `getModuleSchema(...)` result into buildInsert/buildUpdate
// — when the registry has no rows for a module, resolved schema is null and callers fall
// back to the static COLUMN_MAP untouched (kademeli geçiş, see KIBI-PLATFORM-ROADMAP.md FAZ 4.3).
import { db } from '../db.js'

export interface ModuleSchema {
  columnMap: Record<string, string>   // camelKey -> real column (system fields)
  customFieldKeys: Set<string>        // camelKey -> merges into custom_fields JSONB (custom fields)
}

const cache = new Map<string, ModuleSchema | null>()

export async function getModuleSchema(entityId: string, moduleKey: string): Promise<ModuleSchema | null> {
  const cacheKey = `${entityId}:${moduleKey}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)!

  const moduleRow = await db.query.kibiModules.findFirst({
    where: (t, { eq, and }) => and(eq(t.entityId, entityId), eq(t.key, moduleKey)),
  })
  if (!moduleRow) {
    cache.set(cacheKey, null)
    return null
  }

  const fields = await db.query.kibiFields.findMany({
    where: (t, { eq }) => eq(t.moduleId, moduleRow.id),
  })
  if (fields.length === 0) {
    cache.set(cacheKey, null)
    return null
  }

  const columnMap: Record<string, string> = {}
  const customFieldKeys = new Set<string>()
  for (const f of fields) {
    if (f.columnName) columnMap[f.key] = f.columnName
    else customFieldKeys.add(f.key)
  }

  const resolved: ModuleSchema = { columnMap, customFieldKeys }
  cache.set(cacheKey, resolved)
  return resolved
}

// Call after kibi_fields/kibi_modules rows change for an entity (e.g. FAZ 4.4 field
// management endpoints) so getModuleSchema picks up the new shape on the next call.
export function invalidateModuleSchemaCache(entityId?: string): void {
  if (!entityId) { cache.clear(); return }
  for (const k of cache.keys()) if (k.startsWith(`${entityId}:`)) cache.delete(k)
}

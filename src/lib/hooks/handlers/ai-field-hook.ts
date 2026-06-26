// FAZ 5.2: routes the FAZ 4.5 AI-field computation through the afterSave hook instead of
// being called directly from crm-native.ts. runAiFields itself is untouched — it already
// persists via its own merge UPDATE, never a full-object overwrite.
import type { HookContext } from '../lifecycle.js'
import { runAiFields } from '../../metadata/ai-fields.js'

// crm_activities has no custom_fields column (see KIBIPR.md FAZ 4.5) — AI fields can't
// write there yet, so skip rather than let runAiFields fail every save.
const NO_CUSTOM_FIELDS_TABLES = new Set(['crm_activities'])

export async function aiFieldHook(ctx: HookContext): Promise<void> {
  if (NO_CUSTOM_FIELDS_TABLES.has(ctx.table)) return
  const updates = await runAiFields(ctx.entityId, ctx.schema, ctx.moduleKey, ctx.table, ctx.record)
  if (Object.keys(updates).length === 0) return
  const existing = (ctx.record.customFields as Record<string, unknown>) ?? {}
  ctx.record.customFields = { ...existing, ...updates }
}

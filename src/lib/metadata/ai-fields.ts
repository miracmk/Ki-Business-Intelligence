// FAZ 4.5: AI field type (Attio AI Attributes muadili). kibi_fields.type='ai' rows carry
// a prompt + source field list in `config`; on save we call the AI gateway and write the
// result into custom_fields[fieldKey]. Synchronous for now — the roadmap moves heavy
// prompts to a BullMQ worker once FAZ 5's lifecycle hooks land; this function is written
// so that move is a call-site change, not a rewrite (it's already isolated + best-effort).
import { db } from '../db.js'
import { queryEntitySchema } from '../entity-provisioner.js'
import { aiComplete, type Message } from '../../engine/ai/gateway.js'
import { getModelForRole } from '../../engine/ai/model-config.js'

interface AiFieldConfig {
  prompt?: string
  sourceFields?: string[]
  trigger?: 'on_save' | 'manual'
  model?: string
}

// Best-effort: AI field failures must never block (or roll back) the save that triggered
// them. Call this *after* the INSERT/UPDATE that produced `record` has committed.
export async function runAiFields(
  entityId: string,
  schema: string,
  moduleKey: string,
  table: string,
  record: Record<string, unknown> & { id: string },
): Promise<Record<string, string>> {
  const moduleRow = await db.query.kibiModules.findFirst({
    where: (t, { eq, and }) => and(eq(t.entityId, entityId), eq(t.key, moduleKey)),
  })
  if (!moduleRow) return {}

  const aiFields = await db.query.kibiFields.findMany({
    where: (t, { eq, and }) => and(eq(t.moduleId, moduleRow.id), eq(t.type, 'ai')),
  })
  if (aiFields.length === 0) return {}

  // aiComplete/getModelForRole key entity-scoped config off tenants.id, not kibi_entities.id
  // — resolve it once, same as kibi-agent.ts's completeWithRole.
  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.id, entityId),
    columns: { entityId: true },
  })
  const tenantId = entity?.entityId

  const updates: Record<string, string> = {}
  for (const field of aiFields) {
    const config = (field.config ?? {}) as AiFieldConfig
    if (config.trigger === 'manual' || !config.prompt) continue

    const context = (config.sourceFields ?? [])
      .map((key) => `${key}: ${record[key] ?? ''}`)
      .join('\n')
    const messages: Message[] = [{ role: 'user', content: context ? `${config.prompt}\n\n${context}` : config.prompt }]

    let chain: string[]
    if (config.model) {
      chain = [config.model]
    } else {
      const { primary, fallbacks } = await getModelForRole('conversation', 'entity', tenantId)
      chain = [primary, ...fallbacks].filter(Boolean)
    }

    let computed: string | null = null
    for (const modelStr of chain) {
      try {
        const norm = modelStr.includes('::') ? modelStr : `openrouter::${modelStr}`
        const result = await aiComplete(norm, messages, tenantId ?? null)
        computed = result.content.trim()
        break
      } catch (err) {
        console.warn(`[AI Field] ${moduleKey}.${field.key} model ${modelStr} başarısız:`, (err as Error).message)
      }
    }
    if (computed === null) {
      console.error(`[AI Field] ${moduleKey}.${field.key} hesaplanamadı: tüm modeller başarısız`)
      continue
    }
    updates[field.key] = computed
  }

  if (Object.keys(updates).length === 0) return {}
  // `table` always comes from the caller's own literal (never request data) — safe to interpolate.
  await queryEntitySchema(
    schema,
    `UPDATE ${table} SET custom_fields = custom_fields || $1::jsonb WHERE id = $2`,
    [JSON.stringify(updates), record.id],
  )
  return updates
}

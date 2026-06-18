/**
 * DB-backed platform model config reader
 *
 * Reads model assignments from kibi_model_configs (scope='platform').
 * Falls back to hardcoded ANALYSIS_MODELS / CONVERSATION_MODELS if DB is
 * unavailable or the role has no config row yet.
 *
 * Cache TTL: 5 minutes (invalidated immediately on admin PUT /models/:role)
 */

import { db } from '../../lib/db.js'
import { kibiModelConfigs } from '../../../db/schema.js'
import { ANALYSIS_MODELS, CONVERSATION_MODELS } from './gateway.js'

const PLAN_SCOPE_MAP: Record<string, string> = {
  free:          'entity_free',
  basic:         'entity_basic',
  premium:       'entity_premium',
  enterprise:    'entity_enterprise',
  custom_models: 'entity_custom_models',
}

const PLAN_CACHE_TTL_MS = 5 * 60 * 1000
const planCache = new Map<string, { planName: string; ts: number }>()

/** Resolve an entity's plan-specific model scope (entity_free/basic/premium/enterprise/custom_models). */
async function getEntityScope(tenantId: string): Promise<string> {
  const now    = Date.now()
  const cached = planCache.get(tenantId)
  if (cached && now - cached.ts < PLAN_CACHE_TTL_MS) return PLAN_SCOPE_MAP[cached.planName] ?? 'entity_free'

  try {
    const entity = await db.query.kibiEntities.findFirst({
      where:   (t, { eq }) => eq(t.entityId, tenantId),
      columns: { planName: true },
    })
    const planName = entity?.planName ?? 'free'
    planCache.set(tenantId, { planName, ts: now })
    return PLAN_SCOPE_MAP[planName] ?? 'entity_free'
  } catch {
    return 'entity_free'
  }
}

type ModelRole =
  | 'conversation'
  | 'db_search'
  | 'qdrant_search'
  | 'redis_search'
  | 'intent'
  | 'support_intent'
  | 'support_refine'
  | 'support_resolver'
  | 'support_answering'
  | 'intent_analysis'
  | 'support_problem'
  | 'support_solution'
  | 'support_generator'
  | 'sales_intent'
  | 'sales_conversation'
  | 'consulting_intent'
  | 'consulting_recommendation'
  | 'master_conversation'
  | 'db_query'
  | 'kb_vector'
  | 'connector'
  | 'kb_signal_writer'

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { models: string[]; ts: number }>()

/** Call this after any PUT /admin/models/:role to force a fresh DB read */
export function invalidateModelCache(role?: string) {
  if (role) {
    for (const k of cache.keys()) {
      if (k.endsWith(`:${role}`)) cache.delete(k)
    }
  } else {
    cache.clear()
  }
}

/**
 * Returns the ordered model list [primary, fallback1, fallback2, ...] for a
 * given role, reading from kibi_model_configs first and falling back to the
 * provided defaults.
 */
export async function getPlatformModels(
  role: ModelRole,
  defaults: readonly string[],
  scope: string = 'platform',
): Promise<string[]> {
  const cacheKey = `${scope}:${role}`
  const now      = Date.now()
  const cached   = cache.get(cacheKey)
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.models

  try {
    const row = await db.query.kibiModelConfigs.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.scope, scope), eq(t.modelRole, role as any)),
    })

    if (row && row.isActive) {
      const models = [row.primaryModel, row.fallback1, row.fallback2, row.fallback3]
        .filter(Boolean) as string[]
      if (models.length > 0) {
        cache.set(cacheKey, { models, ts: now })
        return models
      }
    }
  } catch (e) {
    console.warn(`[MODEL-CONFIG] DB read failed for role "${role}" scope "${scope}", using defaults:`, (e as Error).message)
  }

  return [...defaults]
}

/** Get models for a role in a specific DB scope (entity_free, entity_basic, etc.) */
export function getScopedModels(role: ModelRole, dbScope: string): Promise<string[]> {
  return getPlatformModels(role, CONVERSATION_MODELS, dbScope)
}

/** Convenience wrappers for the two main model families — reads NEW roles with provider::model format */
export const getAnalysisModels     = () => getPlatformModels('db_query',           ANALYSIS_MODELS)
export const getConversationModels = () => getPlatformModels('master_conversation', CONVERSATION_MODELS)
export const getIntentModels       = () => getPlatformModels('intent_analysis',     ANALYSIS_MODELS)

/**
 * Get model(s) for a given role in a specific scope.
 * Returns { primary, fallbacks } suitable for completeWithFallback.
 *
 * Lookup order:
 * 1. Entity override (if tenantId + ai_configs.settings.modelOverrides[role])
 * 2. kibi_model_configs (scope + role) with 5min cache — for scope='entity', the
 *    DB scope is resolved from the entity's actual plan (entity_free/basic/premium/
 *    enterprise/custom_models), not hardcoded to entity_free.
 * 3. Hardcoded fallback (ANALYSIS_MODELS / CONVERSATION_MODELS)
 */
export async function getModelForRole(
  role: ModelRole,
  scope: 'platform' | 'entity',
  tenantId?: string,
): Promise<{ primary: string; fallbacks: string[] }> {
  const dbScope = scope === 'platform' ? 'platform' : await getEntityScope(tenantId ?? '')

  // Step 1: Check entity override
  if (tenantId) {
    try {
      const entity = await db.query.aiConfigs.findFirst({
        where: (t, { eq }) => eq(t.tenantId, tenantId as any),
        columns: { settings: true },
      })
      if (entity?.settings) {
        const settings = entity.settings as any
        const override = settings.modelOverrides?.[role]
        if (override) {
          const primary = typeof override === 'string' ? override : override.primary
          const fallbacks = Array.isArray(override) ? override : (override.fallbacks ?? [])
          return { primary, fallbacks }
        }
      }
    } catch (e) {
      console.warn(`[MODEL-CONFIG] Entity override lookup failed for ${role}:`, (e as Error).message)
    }
  }

  // Step 2: DB config with cache
  try {
    const row = await getPlatformModels(role, CONVERSATION_MODELS, dbScope)
    const fallbacks = row.slice(1)
    return { primary: row[0], fallbacks }
  } catch (e) {
    console.warn(`[MODEL-CONFIG] Config lookup failed for ${role}:`, (e as Error).message)
  }

  // Step 3: Hardcoded fallback
  const defaults = (role.includes('db_') || role.includes('search') || role === 'intent' || role === 'db_query')
    ? ANALYSIS_MODELS
    : CONVERSATION_MODELS
  return { primary: defaults[0], fallbacks: defaults.slice(1) as string[] }
}

/**
 * Seed default platform model configs if none exist.
 * Called from POST /admin/models/seed.
 */
export async function seedDefaultModelConfigs(): Promise<number> {

  const defaults: Array<{
    modelRole: ModelRole
    primaryModel: string
    fallback1: string
    fallback2: string
    fallback3: string | null
  }> = [
    {
      modelRole:    'conversation',
      primaryModel: CONVERSATION_MODELS[0],
      fallback1:    CONVERSATION_MODELS[1] ?? '',
      fallback2:    CONVERSATION_MODELS[2] ?? '',
      fallback3:    null,
    },
    {
      modelRole:    'db_search',
      primaryModel: ANALYSIS_MODELS[0],
      fallback1:    ANALYSIS_MODELS[1] ?? '',
      fallback2:    ANALYSIS_MODELS[2] ?? '',
      fallback3:    null,
    },
    {
      modelRole:    'qdrant_search',
      primaryModel: ANALYSIS_MODELS[0],
      fallback1:    ANALYSIS_MODELS[1] ?? '',
      fallback2:    ANALYSIS_MODELS[2] ?? '',
      fallback3:    null,
    },
    {
      modelRole:    'intent',
      primaryModel: ANALYSIS_MODELS[0],
      fallback1:    ANALYSIS_MODELS[1] ?? '',
      fallback2:    ANALYSIS_MODELS[2] ?? '',
      fallback3:    null,
    },
    {
      modelRole:    'support_intent',
      primaryModel: ANALYSIS_MODELS[0],
      fallback1:    ANALYSIS_MODELS[1] ?? '',
      fallback2:    ANALYSIS_MODELS[2] ?? '',
      fallback3:    null,
    },
    {
      modelRole:    'support_refine',
      primaryModel: CONVERSATION_MODELS[0],
      fallback1:    CONVERSATION_MODELS[1] ?? '',
      fallback2:    CONVERSATION_MODELS[2] ?? '',
      fallback3:    null,
    },
    {
      modelRole:    'support_resolver',
      primaryModel: ANALYSIS_MODELS[0],
      fallback1:    ANALYSIS_MODELS[1] ?? '',
      fallback2:    ANALYSIS_MODELS[2] ?? '',
      fallback3:    null,
    },
    {
      modelRole:    'support_answering',
      primaryModel: CONVERSATION_MODELS[0],
      fallback1:    CONVERSATION_MODELS[1] ?? '',
      fallback2:    CONVERSATION_MODELS[2] ?? '',
      fallback3:    null,
    },
    // 13 semantic roles
    { modelRole: 'intent_analysis',          primaryModel: ANALYSIS_MODELS[0],     fallback1: ANALYSIS_MODELS[1],     fallback2: ANALYSIS_MODELS[2],     fallback3: null },
    { modelRole: 'support_problem',          primaryModel: ANALYSIS_MODELS[0],     fallback1: ANALYSIS_MODELS[1],     fallback2: ANALYSIS_MODELS[2],     fallback3: null },
    { modelRole: 'support_solution',         primaryModel: CONVERSATION_MODELS[0], fallback1: ANALYSIS_MODELS[0],     fallback2: ANALYSIS_MODELS[1],     fallback3: null },
    { modelRole: 'support_generator',        primaryModel: CONVERSATION_MODELS[0], fallback1: ANALYSIS_MODELS[0],     fallback2: ANALYSIS_MODELS[1],     fallback3: null },
    { modelRole: 'sales_intent',             primaryModel: ANALYSIS_MODELS[0],     fallback1: ANALYSIS_MODELS[1],     fallback2: ANALYSIS_MODELS[2],     fallback3: null },
    { modelRole: 'sales_conversation',       primaryModel: CONVERSATION_MODELS[0], fallback1: CONVERSATION_MODELS[1], fallback2: CONVERSATION_MODELS[2], fallback3: null },
    { modelRole: 'consulting_intent',        primaryModel: ANALYSIS_MODELS[0],     fallback1: ANALYSIS_MODELS[1],     fallback2: ANALYSIS_MODELS[2],     fallback3: null },
    { modelRole: 'consulting_recommendation',primaryModel: CONVERSATION_MODELS[0], fallback1: ANALYSIS_MODELS[0],     fallback2: ANALYSIS_MODELS[1],     fallback3: null },
    { modelRole: 'master_conversation',      primaryModel: CONVERSATION_MODELS[0], fallback1: CONVERSATION_MODELS[1], fallback2: CONVERSATION_MODELS[2], fallback3: null },
    { modelRole: 'db_query',                 primaryModel: ANALYSIS_MODELS[0],     fallback1: ANALYSIS_MODELS[1],     fallback2: ANALYSIS_MODELS[2],     fallback3: null },
    { modelRole: 'kb_vector',                primaryModel: 'huggingface::BAAI/bge-m3', fallback1: 'huggingface::sentence-transformers/all-MiniLM-L6-v2', fallback2: '', fallback3: null },
    { modelRole: 'connector',                primaryModel: ANALYSIS_MODELS[0],     fallback1: ANALYSIS_MODELS[1],     fallback2: ANALYSIS_MODELS[2],     fallback3: null },
    { modelRole: 'kb_signal_writer',         primaryModel: ANALYSIS_MODELS[0],     fallback1: ANALYSIS_MODELS[1],     fallback2: '',                     fallback3: null },
  ]

  let seeded = 0
  for (const d of defaults) {
    const existing = await db.query.kibiModelConfigs.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.scope, 'platform'), eq(t.modelRole, d.modelRole as any)),
    })
    if (!existing) {
      // Extract provider from model string if format is "provider::model"
      const primaryProvider = d.primaryModel.includes('::')
        ? d.primaryModel.split('::')[0]
        : 'openrouter'

      await db.insert(kibiModelConfigs).values({
        scope:        'platform',
        modelRole:    d.modelRole as any,
        primaryModel: d.primaryModel,
        fallback1:    d.fallback1 || null,
        fallback2:    d.fallback2 || null,
        fallback3:    d.fallback3,
        provider:     primaryProvider,
        isActive:     true,
        updatedAt:    new Date(),
      })
      seeded++
    }
  }

  invalidateModelCache()
  return seeded
}

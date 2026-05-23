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

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { models: string[]; ts: number }>()

/** Call this after any PUT /admin/models/:role to force a fresh DB read */
export function invalidateModelCache(role?: string) {
  if (role) {
    cache.delete(role)
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
): Promise<string[]> {
  const now    = Date.now()
  const cached = cache.get(role)
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.models

  try {
    const row = await db.query.kibiModelConfigs.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.scope, 'platform'), eq(t.modelRole, role as any)),
    })

    if (row && row.isActive) {
      const models = [row.primaryModel, row.fallback1, row.fallback2, row.fallback3]
        .filter(Boolean) as string[]
      if (models.length > 0) {
        cache.set(role, { models, ts: now })
        return models
      }
    }
  } catch (e) {
    console.warn(`[MODEL-CONFIG] DB read failed for role "${role}", using defaults:`, (e as Error).message)
  }

  return [...defaults]
}

/** Convenience wrappers for the two main model families */
export const getAnalysisModels     = () => getPlatformModels('db_search',    ANALYSIS_MODELS)
export const getConversationModels = () => getPlatformModels('conversation',  CONVERSATION_MODELS)
export const getIntentModels       = () => getPlatformModels('intent',        ANALYSIS_MODELS)

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
  ]

  let seeded = 0
  for (const d of defaults) {
    const existing = await db.query.kibiModelConfigs.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.scope, 'platform'), eq(t.modelRole, d.modelRole as any)),
    })
    if (!existing) {
      await db.insert(kibiModelConfigs).values({
        scope:        'platform',
        modelRole:    d.modelRole as any,
        primaryModel: d.primaryModel,
        fallback1:    d.fallback1 || null,
        fallback2:    d.fallback2 || null,
        fallback3:    d.fallback3,
        provider:     'openrouter',
        isActive:     true,
        updatedAt:    new Date(),
      })
      seeded++
    }
  }

  invalidateModelCache()
  return seeded
}

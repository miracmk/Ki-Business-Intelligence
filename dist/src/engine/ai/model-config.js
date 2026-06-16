/**
 * DB-backed platform model config reader
 *
 * Reads model assignments from kibi_model_configs (scope='platform').
 * Falls back to hardcoded ANALYSIS_MODELS / CONVERSATION_MODELS if DB is
 * unavailable or the role has no config row yet.
 *
 * Cache TTL: 5 minutes (invalidated immediately on admin PUT /models/:role)
 */
import { db } from '../../lib/db.js';
import { kibiModelConfigs } from '../../../db/schema.js';
import { ANALYSIS_MODELS, CONVERSATION_MODELS } from './gateway.js';
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();
/** Call this after any PUT /admin/models/:role to force a fresh DB read */
export function invalidateModelCache(role) {
    if (role) {
        cache.delete(role);
    }
    else {
        cache.clear();
    }
}
/**
 * Returns the ordered model list [primary, fallback1, fallback2, ...] for a
 * given role, reading from kibi_model_configs first and falling back to the
 * provided defaults.
 */
export async function getPlatformModels(role, defaults) {
    const now = Date.now();
    const cached = cache.get(role);
    if (cached && now - cached.ts < CACHE_TTL_MS)
        return cached.models;
    try {
        const row = await db.query.kibiModelConfigs.findFirst({
            where: (t, { and, eq }) => and(eq(t.scope, 'platform'), eq(t.modelRole, role)),
        });
        if (row && row.isActive) {
            const models = [row.primaryModel, row.fallback1, row.fallback2, row.fallback3]
                .filter(Boolean);
            if (models.length > 0) {
                cache.set(role, { models, ts: now });
                return models;
            }
        }
    }
    catch (e) {
        console.warn(`[MODEL-CONFIG] DB read failed for role "${role}", using defaults:`, e.message);
    }
    return [...defaults];
}
/** Convenience wrappers for the two main model families */
export const getAnalysisModels = () => getPlatformModels('db_search', ANALYSIS_MODELS);
export const getConversationModels = () => getPlatformModels('conversation', CONVERSATION_MODELS);
export const getIntentModels = () => getPlatformModels('intent', ANALYSIS_MODELS);
/**
 * Get model(s) for a given role in a specific scope.
 * Returns { primary, fallbacks } suitable for completeWithFallback.
 *
 * Lookup order:
 * 1. Entity override (if tenantId + ai_configs.settings.modelOverrides[role])
 * 2. kibi_model_configs (scope + role) with 5min cache
 * 3. Hardcoded fallback (ANALYSIS_MODELS / CONVERSATION_MODELS)
 */
export async function getModelForRole(role, scope, tenantId) {
    const dbScope = scope === 'platform' ? 'platform' : 'entity_free';
    // Step 1: Check entity override
    if (tenantId) {
        try {
            const entity = await db.query.aiConfigs.findFirst({
                where: (t, { eq }) => eq(t.tenantId, tenantId),
                columns: { settings: true },
            });
            if (entity?.settings) {
                const settings = entity.settings;
                const override = settings.modelOverrides?.[role];
                if (override) {
                    const primary = typeof override === 'string' ? override : override.primary;
                    const fallbacks = Array.isArray(override) ? override : (override.fallbacks ?? []);
                    return { primary, fallbacks };
                }
            }
        }
        catch (e) {
            console.warn(`[MODEL-CONFIG] Entity override lookup failed for ${role}:`, e.message);
        }
    }
    // Step 2: DB config with cache
    try {
        const row = await getPlatformModels(role, CONVERSATION_MODELS);
        const fallbacks = row.slice(1);
        return { primary: row[0], fallbacks };
    }
    catch (e) {
        console.warn(`[MODEL-CONFIG] Config lookup failed for ${role}:`, e.message);
    }
    // Step 3: Hardcoded fallback
    const defaults = (role.includes('db_') || role.includes('search') || role === 'intent' || role === 'db_query')
        ? ANALYSIS_MODELS
        : CONVERSATION_MODELS;
    return { primary: defaults[0], fallbacks: defaults.slice(1) };
}
/**
 * Seed default platform model configs if none exist.
 * Called from POST /admin/models/seed.
 */
export async function seedDefaultModelConfigs() {
    const defaults = [
        {
            modelRole: 'conversation',
            primaryModel: CONVERSATION_MODELS[0],
            fallback1: CONVERSATION_MODELS[1] ?? '',
            fallback2: CONVERSATION_MODELS[2] ?? '',
            fallback3: null,
        },
        {
            modelRole: 'db_search',
            primaryModel: ANALYSIS_MODELS[0],
            fallback1: ANALYSIS_MODELS[1] ?? '',
            fallback2: ANALYSIS_MODELS[2] ?? '',
            fallback3: null,
        },
        {
            modelRole: 'qdrant_search',
            primaryModel: ANALYSIS_MODELS[0],
            fallback1: ANALYSIS_MODELS[1] ?? '',
            fallback2: ANALYSIS_MODELS[2] ?? '',
            fallback3: null,
        },
        {
            modelRole: 'intent',
            primaryModel: ANALYSIS_MODELS[0],
            fallback1: ANALYSIS_MODELS[1] ?? '',
            fallback2: ANALYSIS_MODELS[2] ?? '',
            fallback3: null,
        },
        {
            modelRole: 'support_intent',
            primaryModel: ANALYSIS_MODELS[0],
            fallback1: ANALYSIS_MODELS[1] ?? '',
            fallback2: ANALYSIS_MODELS[2] ?? '',
            fallback3: null,
        },
        {
            modelRole: 'support_refine',
            primaryModel: CONVERSATION_MODELS[0],
            fallback1: CONVERSATION_MODELS[1] ?? '',
            fallback2: CONVERSATION_MODELS[2] ?? '',
            fallback3: null,
        },
        {
            modelRole: 'support_resolver',
            primaryModel: ANALYSIS_MODELS[0],
            fallback1: ANALYSIS_MODELS[1] ?? '',
            fallback2: ANALYSIS_MODELS[2] ?? '',
            fallback3: null,
        },
        {
            modelRole: 'support_answering',
            primaryModel: CONVERSATION_MODELS[0],
            fallback1: CONVERSATION_MODELS[1] ?? '',
            fallback2: CONVERSATION_MODELS[2] ?? '',
            fallback3: null,
        },
        // 13 new semantic roles (YFZ 19-21 / FAZ A)
        {
            modelRole: 'intent_analysis',
            primaryModel: `openrouter::${ANALYSIS_MODELS[1]}`,
            fallback1: `openrouter::${ANALYSIS_MODELS[0]}`,
            fallback2: `openrouter::${ANALYSIS_MODELS[2]}`,
            fallback3: null,
        },
        {
            modelRole: 'support_problem',
            primaryModel: `openrouter::${ANALYSIS_MODELS[1]}`,
            fallback1: `openrouter::${ANALYSIS_MODELS[0]}`,
            fallback2: `openrouter::${ANALYSIS_MODELS[2]}`,
            fallback3: null,
        },
        {
            modelRole: 'support_solution',
            primaryModel: `openrouter::${ANALYSIS_MODELS[0]}`,
            fallback1: `openrouter::${CONVERSATION_MODELS[0]}`,
            fallback2: `openrouter::${ANALYSIS_MODELS[1]}`,
            fallback3: null,
        },
        {
            modelRole: 'support_generator',
            primaryModel: `openrouter::${ANALYSIS_MODELS[0]}`,
            fallback1: `openrouter::${CONVERSATION_MODELS[0]}`,
            fallback2: `openrouter::${ANALYSIS_MODELS[1]}`,
            fallback3: null,
        },
        {
            modelRole: 'sales_intent',
            primaryModel: `openrouter::${ANALYSIS_MODELS[1]}`,
            fallback1: `openrouter::${ANALYSIS_MODELS[0]}`,
            fallback2: `openrouter::${ANALYSIS_MODELS[2]}`,
            fallback3: null,
        },
        {
            modelRole: 'sales_conversation',
            primaryModel: `openrouter::${CONVERSATION_MODELS[0]}`,
            fallback1: `openrouter::${CONVERSATION_MODELS[1]}`,
            fallback2: `openrouter::${CONVERSATION_MODELS[2]}`,
            fallback3: null,
        },
        {
            modelRole: 'consulting_intent',
            primaryModel: `openrouter::${ANALYSIS_MODELS[1]}`,
            fallback1: `openrouter::${ANALYSIS_MODELS[0]}`,
            fallback2: `openrouter::${ANALYSIS_MODELS[2]}`,
            fallback3: null,
        },
        {
            modelRole: 'consulting_recommendation',
            primaryModel: `openrouter::${ANALYSIS_MODELS[0]}`,
            fallback1: `openrouter::${CONVERSATION_MODELS[0]}`,
            fallback2: `openrouter::${ANALYSIS_MODELS[1]}`,
            fallback3: null,
        },
        {
            modelRole: 'master_conversation',
            primaryModel: `openrouter::${CONVERSATION_MODELS[0]}`,
            fallback1: `openrouter::${CONVERSATION_MODELS[1]}`,
            fallback2: `openrouter::${CONVERSATION_MODELS[2]}`,
            fallback3: null,
        },
        {
            modelRole: 'db_query',
            primaryModel: `openrouter::${ANALYSIS_MODELS[0]}`,
            fallback1: `openrouter::${ANALYSIS_MODELS[1]}`,
            fallback2: `openrouter::${ANALYSIS_MODELS[2]}`,
            fallback3: null,
        },
        {
            modelRole: 'kb_vector',
            primaryModel: 'huggingface::BAAI/bge-m3',
            fallback1: 'huggingface::sentence-transformers/all-MiniLM-L6-v2',
            fallback2: '',
            fallback3: null,
        },
        {
            modelRole: 'connector',
            primaryModel: `openrouter::${ANALYSIS_MODELS[0]}`,
            fallback1: `openrouter::${ANALYSIS_MODELS[1]}`,
            fallback2: `openrouter::${ANALYSIS_MODELS[2]}`,
            fallback3: null,
        },
        {
            modelRole: 'kb_signal_writer',
            primaryModel: `openrouter::${ANALYSIS_MODELS[1]}`,
            fallback1: `openrouter::${ANALYSIS_MODELS[0]}`,
            fallback2: '',
            fallback3: null,
        },
    ];
    let seeded = 0;
    for (const d of defaults) {
        const existing = await db.query.kibiModelConfigs.findFirst({
            where: (t, { and, eq }) => and(eq(t.scope, 'platform'), eq(t.modelRole, d.modelRole)),
        });
        if (!existing) {
            // Extract provider from model string if format is "provider::model"
            const primaryProvider = d.primaryModel.includes('::')
                ? d.primaryModel.split('::')[0]
                : 'openrouter';
            await db.insert(kibiModelConfigs).values({
                scope: 'platform',
                modelRole: d.modelRole,
                primaryModel: d.primaryModel,
                fallback1: d.fallback1 || null,
                fallback2: d.fallback2 || null,
                fallback3: d.fallback3,
                provider: primaryProvider,
                isActive: true,
                updatedAt: new Date(),
            });
            seeded++;
        }
    }
    invalidateModelCache();
    return seeded;
}
//# sourceMappingURL=model-config.js.map
import { db } from '../../lib/db.js';
export const DEFAULT_MODEL_CHAINS = {
    conversation: [
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemini-2.0-flash-exp:free',
        'google/gemini-flash-1.5:free',
    ],
    db_search: [
        'nvidia/llama-3.1-nemotron-70b-instruct:free',
        'google/gemini-2.0-flash-exp:free',
        'meta-llama/llama-3.3-70b-instruct:free',
    ],
    qdrant_search: [
        'google/gemini-2.0-flash-exp:free',
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemini-flash-1.5:free',
    ],
    redis_search: [
        'google/gemini-2.0-flash-exp:free',
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemini-flash-1.5:free',
    ],
    intent: [
        'google/gemini-2.0-flash-exp:free',
        'meta-llama/llama-3.3-70b-instruct:free',
        'mistralai/mistral-7b-instruct:free',
    ],
    support_intent: [
        'google/gemini-2.0-flash-exp:free',
        'meta-llama/llama-3.3-70b-instruct:free',
        'mistralai/mistral-7b-instruct:free',
    ],
    support_refine: [
        'nvidia/llama-3.1-nemotron-70b-instruct:free',
        'google/gemini-2.0-flash-exp:free',
        'meta-llama/llama-3.3-70b-instruct:free',
    ],
    support_resolver: [
        'nvidia/llama-3.1-nemotron-70b-instruct:free',
        'google/gemini-2.0-flash-exp:free',
        'meta-llama/llama-3.3-70b-instruct:free',
    ],
    support_answering: [
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemini-2.0-flash-exp:free',
        'google/gemini-flash-1.5:free',
    ],
};
export async function getModelChain(role, entityId) {
    if (entityId) {
        const entityConfig = await db.query.kibiModelConfigs.findFirst({
            where: (t, { eq, and }) => and(eq(t.modelRole, role), eq(t.scope, 'entity'), eq(t.scopeId, entityId), eq(t.isActive, true)),
        });
        if (entityConfig) {
            return buildChainFromConfig(entityConfig);
        }
    }
    const platformConfig = await db.query.kibiModelConfigs.findFirst({
        where: (t, { eq, and }) => and(eq(t.modelRole, role), eq(t.scope, 'platform'), eq(t.isActive, true)),
    });
    if (platformConfig) {
        return buildChainFromConfig(platformConfig);
    }
    return DEFAULT_MODEL_CHAINS[role] ?? [];
}
function buildChainFromConfig(config) {
    const chain = [];
    if (config.primaryModel)
        chain.push(config.primaryModel);
    for (const key of ['fallback1', 'fallback2', 'fallback3']) {
        if (config[key])
            chain.push(config[key]);
    }
    return [...new Set(chain)];
}
//# sourceMappingURL=models.js.map
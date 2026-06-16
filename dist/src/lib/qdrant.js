import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '../../config/env.js';
import { db } from './db.js';
import { kibiModelConfigs } from '../../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { aiEmbed } from '../engine/ai/gateway.js';
import { parseModelString } from '../engine/ai/providers.js';
export const qdrant = new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY,
});
export const COLLECTIONS = {
    knowledgeBase: env.QDRANT_COLLECTION, // 'ki_knowledge_base'
    serviceInfo: 'ki_crm_serviceinfo', // Ki Business service docs
};
export async function ensureQdrantConnection() {
    await qdrant.getCollections();
    console.log('✓ Qdrant connected');
}
// ── Configurable embedding via kibi_model_configs (role='qdrant_search') ─────
let _embeddingModelCache = null;
const EMBED_MODEL_TTL = 5 * 60 * 1000;
async function resolveEmbeddingModel() {
    if (_embeddingModelCache && Date.now() - _embeddingModelCache.ts < EMBED_MODEL_TTL) {
        return _embeddingModelCache.model;
    }
    try {
        const rows = await db.select({ primaryModel: kibiModelConfigs.primaryModel })
            .from(kibiModelConfigs)
            .where(and(eq(kibiModelConfigs.scope, 'platform'), eq(kibiModelConfigs.modelRole, 'qdrant_search')))
            .limit(1);
        const model = rows[0]?.primaryModel ?? null;
        if (model)
            _embeddingModelCache = { model, ts: Date.now() };
        return model;
    }
    catch {
        return null;
    }
}
/** Invalidate embedding model cache (call after admin updates qdrant_search role) */
export function invalidateEmbeddingModelCache() {
    _embeddingModelCache = null;
}
/**
 * Embed using the admin-configured model (kibi_model_configs: scope=platform, role=qdrant_search).
 * Falls back to the hardcoded BAAI/bge-m3 via HF pipeline if no model is configured.
 */
export async function embedConfigured(texts) {
    const configuredModel = await resolveEmbeddingModel();
    if (configuredModel) {
        const parsed = parseModelString(configuredModel);
        if (parsed) {
            return aiEmbed(texts, configuredModel, null);
        }
    }
    // Fall back to legacy HF pipeline
    return embed(texts);
}
// ── HuggingFace embeddings (free, same as n8n used: BAAI/bge-m3) ─────────────
const HF_MODEL = 'BAAI/bge-m3';
const HF_API = 'https://api-inference.huggingface.co/pipeline/feature-extraction';
export async function embed(texts) {
    const key = env.HUGGINGFACE_API_KEY;
    const res = await fetch(`${HF_API}/${HF_MODEL}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({ inputs: texts, options: { wait_for_model: true } }),
    });
    if (!res.ok) {
        throw new Error(`HuggingFace embed error: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    // HF returns [[[...vectors]]] for multiple inputs, [[...]] for one
    if (Array.isArray(data[0]?.[0])) {
        return data.map((d) => d[0]);
    }
    return data;
}
// ── Vector search helper ──────────────────────────────────────────────────────
export async function vectorSearch(collection, queryText, limit = 5, filter) {
    const [vector] = await embed([queryText]);
    if (!vector)
        return [];
    const results = await qdrant.search(collection, {
        vector,
        limit,
        with_payload: true,
        filter,
    });
    return results.map((r) => ({
        id: r.id,
        score: r.score,
        payload: (r.payload ?? {}),
    }));
}
// ── Upsert to knowledge base ──────────────────────────────────────────────────
export async function upsertKnowledge(collection, items) {
    if (!items.length)
        return;
    const vectors = await embed(items.map((i) => i.text));
    await qdrant.upsert(collection, {
        wait: true,
        points: items.map((item, idx) => ({
            id: item.id,
            vector: vectors[idx],
            payload: item.payload,
        })),
    });
}
//# sourceMappingURL=qdrant.js.map
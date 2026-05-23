import { QdrantClient } from '@qdrant/js-client-rest'
import { env } from '../../config/env.js'

export const qdrant = new QdrantClient({
  url:    env.QDRANT_URL,
  apiKey: env.QDRANT_API_KEY,
})

export const COLLECTIONS = {
  knowledgeBase: env.QDRANT_COLLECTION,      // 'ki_knowledge_base'
  serviceInfo:   'ki_crm_serviceinfo',       // Ki Business service docs
} as const

export async function ensureQdrantConnection() {
  await qdrant.getCollections()
  console.log('✓ Qdrant connected')
}

// ── HuggingFace embeddings (free, same as n8n used: BAAI/bge-m3) ─────────────
const HF_MODEL = 'BAAI/bge-m3'
const HF_API   = 'https://api-inference.huggingface.co/pipeline/feature-extraction'

export async function embed(texts: string[]): Promise<number[][]> {
  const key = env.HUGGINGFACE_API_KEY
  const res = await fetch(`${HF_API}/${HF_MODEL}`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ inputs: texts, options: { wait_for_model: true } }),
  })

  if (!res.ok) {
    throw new Error(`HuggingFace embed error: ${res.status} ${await res.text()}`)
  }

  const data = await res.json() as number[][] | number[][][]
  // HF returns [[[...vectors]]] for multiple inputs, [[...]] for one
  if (Array.isArray(data[0]?.[0])) {
    return (data as number[][][]).map((d) => d[0]!)
  }
  return data as number[][]
}

// ── Vector search helper ──────────────────────────────────────────────────────
export async function vectorSearch(
  collection: string,
  queryText:  string,
  limit = 5,
  filter?: object,
): Promise<Array<{ id: string | number; score: number; payload: Record<string, unknown> }>> {
  const [vector] = await embed([queryText])
  if (!vector) return []

  const results = await qdrant.search(collection, {
    vector,
    limit,
    with_payload: true,
    filter,
  })

  return results.map((r) => ({
    id:      r.id,
    score:   r.score,
    payload: (r.payload ?? {}) as Record<string, unknown>,
  }))
}

// ── Upsert to knowledge base ──────────────────────────────────────────────────
export async function upsertKnowledge(
  collection: string,
  items: Array<{
    id:      string
    text:    string
    payload: Record<string, unknown>
  }>,
) {
  if (!items.length) return

  const vectors = await embed(items.map((i) => i.text))

  await qdrant.upsert(collection, {
    wait: true,
    points: items.map((item, idx) => ({
      id:      item.id,
      vector:  vectors[idx]!,
      payload: item.payload,
    })),
  })
}

/**
 * KB indexing engine — YFZ 33.
 *
 * Shared by Entity KB (scope='entity', per-tenant Qdrant collection `entity_{entityId}`)
 * and KIBI AI KB (scope='kibi', single collection `kibi_ai_kb`).
 *
 * Hash-based incremental indexing: re-indexing a document only embeds chunks whose
 * normalized content hash is new, and removes Qdrant points for chunks that disappeared
 * from the latest version — unchanged chunks are left untouched.
 */
import { eq, and }   from 'drizzle-orm'
import { db }        from '../../lib/db.js'
import { qdrant, embedConfigured } from '../../lib/qdrant.js'
import { kbChunks, kbDocuments } from '../../../db/schema.js'
import { prepareChunks, qdrantPointId } from './chunking.js'

export const KIBI_AI_KB_COLLECTION = 'kibi_ai_kb'

export function collectionForScope(scope: 'entity' | 'kibi', entityId: string | null): string {
  if (scope === 'kibi') return KIBI_AI_KB_COLLECTION
  if (!entityId) throw new Error('entityId required for scope=entity')
  return `entity_${entityId}`
}

export interface IndexDocumentResult {
  added:     number
  unchanged: number
  removed:   number
}

export interface IndexDocumentParams {
  documentId: string
  scope:      'entity' | 'kibi'
  entityId:   string | null
  category:   string
  text:       string
  fileName?:  string
  tags?:      string[]
}

export async function indexDocument(params: IndexDocumentParams): Promise<IndexDocumentResult> {
  const { documentId, scope, entityId, category, text, fileName, tags } = params
  const collection = collectionForScope(scope, entityId)

  const prepared = prepareChunks(text)
  const newHashes = new Set(prepared.map((c) => c.hash))

  const existing = await db.select({ id: kbChunks.id, chunkHash: kbChunks.chunkHash, qdrantPointId: kbChunks.qdrantPointId })
    .from(kbChunks)
    .where(and(eq(kbChunks.documentId, documentId), eq(kbChunks.active, true)))

  const existingHashes = new Set(existing.map((c) => c.chunkHash))
  const toAdd    = prepared.filter((c) => !existingHashes.has(c.hash))
  const toRemove = existing.filter((c) => !newHashes.has(c.chunkHash))

  await ensureCollection(collection)

  if (toAdd.length) {
    const vectors = await embedConfigured(toAdd.map((c) => c.text))
    await qdrant.upsert(collection, {
      wait: true,
      points: toAdd.map((chunk, i) => ({
        id:     qdrantPointId(documentId, chunk.hash),
        vector: vectors[i]!,
        payload: {
          document_id: documentId,
          chunk_hash:  chunk.hash,
          category,
          file_name:   fileName ?? null,
          entity_id:   entityId,
          tags:        tags ?? [],
          text:        chunk.text,
        },
      })),
    })

    await db.insert(kbChunks).values(toAdd.map((chunk) => ({
      documentId,
      chunkIndex:    chunk.index,
      chunkHash:     chunk.hash,
      chunkText:     chunk.text,
      qdrantPointId: qdrantPointId(documentId, chunk.hash),
    })))
  }

  if (toRemove.length) {
    await qdrant.delete(collection, { wait: true, points: toRemove.map((c) => c.qdrantPointId) })
    for (const c of toRemove) {
      await db.update(kbChunks).set({ active: false }).where(eq(kbChunks.id, c.id))
    }
  }

  await db.update(kbDocuments)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(kbDocuments.id, documentId))

  return { added: toAdd.length, unchanged: prepared.length - toAdd.length, removed: toRemove.length }
}

export async function deleteDocumentFromIndex(documentId: string, scope: 'entity' | 'kibi', entityId: string | null) {
  const collection = collectionForScope(scope, entityId)
  const existing = await db.select({ id: kbChunks.id, qdrantPointId: kbChunks.qdrantPointId })
    .from(kbChunks)
    .where(and(eq(kbChunks.documentId, documentId), eq(kbChunks.active, true)))

  if (existing.length) {
    await qdrant.delete(collection, { wait: true, points: existing.map((c) => c.qdrantPointId) }).catch(() => {})
    await db.update(kbChunks).set({ active: false }).where(eq(kbChunks.documentId, documentId))
  }
}

async function ensureCollection(name: string) {
  try {
    await qdrant.getCollection(name)
  } catch {
    // Vector size must match the configured embedding model's output — bge-m3 default is 1024.
    await qdrant.createCollection(name, { vectors: { size: 1024, distance: 'Cosine' } })
  }
}

import { vectorSearch } from '../../lib/qdrant.js'

export interface QdrantSearchResult {
  results: Array<{ content: string; score: number; source: string }>
  summary: string
}

export async function searchKnowledge(params: { query: string; collection: string; entityContext?: object; limit?: number }): Promise<QdrantSearchResult> {
  const collection = params.collection
  const limit = params.limit ?? 5
  const rawResults = await vectorSearch(collection, params.query, limit)
  const results = rawResults.map((hit) => ({
    content: String(hit.payload.text ?? hit.payload.content ?? ''),
    score: hit.score ?? 0,
    source: String(hit.payload.source ?? hit.payload.ticketId ?? hit.payload.id ?? 'unknown'),
  }))
  const summary = results.length > 0 ? `Found ${results.length} knowledge hits.` : 'No knowledge results found.'
  return { results, summary }
}

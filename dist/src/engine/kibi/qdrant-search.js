import { vectorSearch } from '../../lib/qdrant.js';
export async function searchKnowledge(params) {
    const collection = params.collection;
    const limit = params.limit ?? 5;
    const rawResults = await vectorSearch(collection, params.query, limit);
    const results = rawResults.map((hit) => ({
        content: String(hit.payload.text ?? hit.payload.content ?? ''),
        score: hit.score ?? 0,
        source: String(hit.payload.source ?? hit.payload.ticketId ?? hit.payload.id ?? 'unknown'),
    }));
    const summary = results.length > 0 ? `Found ${results.length} knowledge hits.` : 'No knowledge results found.';
    return { results, summary };
}
//# sourceMappingURL=qdrant-search.js.map
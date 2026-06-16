import { db } from '../../lib/db.js';
import { sql } from 'drizzle-orm';
import { runDbQuery } from '../tools/db-query.js';
import { getModelChain } from './models.js';
export async function searchEntityData(params) {
    const { connectionId, question } = params;
    const connectionFilter = connectionId ? `connection_id = '${connectionId}' AND ` : '';
    const query = `SELECT data FROM crm_records WHERE ${connectionFilter}data IS NOT NULL LIMIT 20`;
    const result = await runDbQuery(query, connectionId);
    if (result.error)
        return `Sorgu sırasında hata: ${result.error}`;
    if (!result.rows.length)
        return 'Bu entity için CRM verisi bulunamadı.';
    const dataSummaries = result.rows.slice(0, 5).map((row) => JSON.stringify(row.data)).join('\n');
    const chain = await getModelChain('db_search', params.entityId);
    const systemPrompt = `Sen bir CRM veri sorgu uzmanısın. Aşağıdaki CRM verilerini kullanarak soruya doğal dilde yanıt ver.`;
    const userPrompt = `Soru: ${question}\n\nVeri:\n${dataSummaries}`;
    const { content } = await import('../ai/gateway.js').then(({ defaultGateway }) => defaultGateway).then(async (gateway) => gateway.completeWithFallback([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ], chain, { temperature: 0.3, maxTokens: 800 }));
    return content || 'Veri bulunamadı.';
}
export async function getPlatformStats(question) {
    const latest = await db.execute(sql.raw(`SELECT * FROM platform_metrics ORDER BY metric_date DESC LIMIT 1`));
    const tokenRows = await db.execute(sql.raw(`SELECT entity_id, SUM(total_tokens) AS tokens, SUM(cost_usd) AS cost FROM kibi_token_usage GROUP BY entity_id ORDER BY tokens DESC LIMIT 5`));
    const metrics = latest.rows[0] ?? {};
    const topEntities = tokenRows.rows.map((row) => `${row.entity_id} → ${row.tokens} token`).join('\n');
    return `Platform istatistikleri:\nToplam entity: ${metrics.total_entities ?? 0}\nAktif entity (30g): ${metrics.active_entities_30d ?? 0}\nToplam kullanıcı: ${metrics.total_users ?? 0}\nToplam token kullanımı: ${metrics.total_tokens_used ?? 0}\nToplam maliyet USD: ${metrics.total_cost_usd ?? 0}\nEn çok token kullanan entityler:\n${topEntities}`;
}
//# sourceMappingURL=db-search.js.map
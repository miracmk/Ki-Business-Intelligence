/**
 * Connector AI — Semantic katalog üretimi
 * Bağlantı kurulunca çalışır, tablo/modül yapısını analiz eder
 */
import { db } from '../../lib/db.js';
import { entityDataCatalog, aiPipelineLogs } from '../../../db/schema.js';
import { getModelForRole } from '../ai/model-config.js';
import { aiComplete } from '../ai/gateway.js';
const CONNECTOR_SYSTEM_PROMPT = `Sen KIBI AI Connector Motorusun. Görevin: bir veritabanı tablosunu analiz edip semantic katalog üretmek.

Kurallar:
- Tablo ve kolon adları Türkçe, İngilizce, kısaltma veya karma olabilir. Hepsini anlarsın.
- tableIntent: en uygun kategoriyi seç. Emin değilsen 'unknown'.
- Her kolon için semanticRole ata. Emin değilsen 'unknown'.
- queryTemplates: Bu tablo için en sık sorulacak 3-5 SQL şablonu üret. {param_adi} placeholder kullan, tablo adı yerine {raw_table_path} kullan.
- relationships: Diğer tablo adlarından FK tahmin et, confidenceScore ver.
- isWritable: Muhasebe kayıtları, log tabloları → false. Müşteri, lead, not, durum → true.
- SADECE geçerli JSON döndür. Markdown, açıklama YAZMA.`;
export async function analyzeTableStructure(table, otherTableNames, entitySlug, sourceType) {
    const rawTablePath = buildRawTablePath(entitySlug, sourceType, table.name);
    const { primary, fallbacks } = await getModelForRole('connector', 'platform');
    const userMessage = `Tablo: ${table.name}
Kayıtlar: ${table.recordCount}
Alanlar: ${JSON.stringify(table.fields, null, 2)}
Örnek (5 satır): ${JSON.stringify(table.sampleRows, null, 2)}
Diğer tablolar: ${otherTableNames.join(', ')}
Raw tablo yolu: ${rawTablePath}

Döndür (JSON):
{
  "displayName": "Türkçe/İngilizce ad",
  "tableIntent": "customer_entity|lead|invoice|unknown|...",
  "columns": [
    {
      "sourceName": "kolon_adi",
      "displayName": "Görünen Ad",
      "dataType": "varchar|integer|timestamp|...",
      "semanticRole": "identifier|email|phone|amount_money|...",
      "isQueryable": true,
      "isWritable": false,
      "nullRate": 0.0,
      "uniqueRatio": 0.0,
      "isPrimaryKey": false,
      "isForeignKey": false
    }
  ],
  "relationships": [
    {
      "fromTable": "${table.name}",
      "fromColumn": "kolon",
      "toTable": "diger_tablo",
      "toColumn": "id",
      "relationshipType": "many_to_one",
      "confidenceScore": 0.85,
      "isExplicitFK": false
    }
  ],
  "queryTemplates": {
    "find_by_name": "SELECT * FROM ${rawTablePath} WHERE {name_column} ILIKE '%{name}%' LIMIT 20",
    "get_by_id": "SELECT * FROM ${rawTablePath} WHERE {id_column} = '{id}' LIMIT 1"
  },
  "dataQuality": {
    "hasNullIds": false,
    "hasDuplicateIds": false,
    "encodingIssues": false,
    "anomalyFlags": []
  },
  "isQueryable": true,
  "isWritable": false
}`;
    try {
        const result = await aiComplete(`${primary}`, [{ role: 'user', content: userMessage }], undefined, {
            maxTokens: 4000,
        });
        const raw = result.content;
        const clean = raw.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        return {
            tableName: table.name,
            recordCount: table.recordCount,
            ...parsed,
        };
    }
    catch (e) {
        console.warn(`[CONNECTOR-AI] Parse failed for ${table.name}:`, e.message);
        return buildFallbackCatalog(table, rawTablePath);
    }
}
export async function runConnectorAnalysis(connectionId, entityId, entitySlug, sourceType, scannedTables, sendEvent) {
    const otherTableNames = scannedTables.map(t => t.name);
    const total = scannedTables.length;
    const startTime = Date.now();
    for (let i = 0; i < scannedTables.length; i++) {
        const table = scannedTables[i];
        const percent = Math.round((i / total) * 100);
        sendEvent({
            type: 'progress',
            table: table.name,
            percent,
            message: `'${table.name}' analiz ediliyor...`,
        });
        try {
            const catalogEntry = await analyzeTableStructure(table, otherTableNames, entitySlug, sourceType);
            const rawTablePath = buildRawTablePath(entitySlug, sourceType, table.name);
            // entity_data_catalog'a upsert
            await db
                .insert(entityDataCatalog)
                .values({
                entityId,
                connectionId,
                sourceName: sourceType,
                sourceType,
                tableName: table.name,
                displayName: catalogEntry.displayName,
                tableIntent: catalogEntry.tableIntent,
                columns: catalogEntry.columns,
                relationships: catalogEntry.relationships,
                queryTemplates: catalogEntry.queryTemplates,
                dataQuality: catalogEntry.dataQuality,
                rawTablePath,
                isQueryable: catalogEntry.isQueryable,
                isWritable: catalogEntry.isWritable,
                isUserApproved: false,
                recordCount: table.recordCount,
                lastAnalyzedAt: new Date(),
            })
                .onConflictDoUpdate({
                target: [entityDataCatalog.entityId, entityDataCatalog.connectionId, entityDataCatalog.tableName],
                set: {
                    displayName: catalogEntry.displayName,
                    tableIntent: catalogEntry.tableIntent,
                    columns: catalogEntry.columns,
                    relationships: catalogEntry.relationships,
                    queryTemplates: catalogEntry.queryTemplates,
                    dataQuality: catalogEntry.dataQuality,
                    isQueryable: catalogEntry.isQueryable,
                    isWritable: catalogEntry.isWritable,
                    recordCount: table.recordCount,
                    lastAnalyzedAt: new Date(),
                    updatedAt: new Date(),
                },
            });
            // ai_pipeline_logs'a yaz
            await db.insert(aiPipelineLogs).values({
                entityId,
                pipelineType: 'platform',
                modelRole: 'connector',
                modelUsed: 'connector-ai',
                latencyMs: Math.round((Date.now() - startTime) / (i + 1)), // ortalama
                success: true,
                confidenceScore: 85,
            });
            sendEvent({
                type: 'table_done',
                table: table.name,
                percent: Math.round(((i + 1) / total) * 100),
                entry: catalogEntry,
            });
        }
        catch (err) {
            await db.insert(aiPipelineLogs).values({
                entityId,
                pipelineType: 'platform',
                modelRole: 'connector',
                success: false,
                errorMessage: err.message,
                latencyMs: Math.round(Date.now() - startTime),
            });
            sendEvent({
                type: 'error',
                table: table.name,
                message: err.message,
            });
        }
    }
    sendEvent({
        type: 'done',
        totalTables: total,
        percent: 100,
    });
}
export function buildRawTablePath(entitySlug, sourceType, tableName) {
    const clean = (s) => s
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 40);
    const path = `entity_${clean(entitySlug)}.raw_${clean(sourceType)}_${clean(tableName)}`;
    return path.slice(0, 63); // PostgreSQL identifier limit
}
function buildFallbackCatalog(table, rawTablePath) {
    return {
        tableName: table.name,
        displayName: table.name,
        tableIntent: 'unknown',
        columns: table.fields.map(f => ({
            sourceName: f.name,
            displayName: f.name,
            dataType: f.dataType,
            semanticRole: 'unknown',
            isQueryable: true,
            isWritable: false,
            nullRate: 0,
            uniqueRatio: 0,
            sampleValues: f.sampleValues,
            isPrimaryKey: f.isPrimaryKey,
            isForeignKey: f.isForeignKey,
        })),
        relationships: [],
        queryTemplates: {
            list_all: `SELECT * FROM ${rawTablePath} LIMIT 20`,
        },
        dataQuality: {
            totalRows: table.recordCount,
            sampledRows: 5,
            hasNullIds: false,
            hasDuplicateIds: false,
            encodingIssues: false,
            anomalyFlags: [],
        },
        isQueryable: true,
        isWritable: false,
        recordCount: table.recordCount,
    };
}
//# sourceMappingURL=connector-ai.js.map
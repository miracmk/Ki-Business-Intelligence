/**
 * Entity DB Engine (E-4) — YFZ 24
 *
 * Semantic catalog üzerinden dynamic SQL üretir.
 * entity_{slug}.raw_* tablolarını sorgular.
 */

import { aiComplete, type Message } from './gateway.js'
import { getModelForRole }          from './model-config.js'
import { logPipelineStep }          from './pipeline-logger.js'
import { db }                        from '../../lib/db.js'
import { entityDataCatalog }         from '../../../db/schema.js'
import { eq, and }                   from 'drizzle-orm'

// ─── Catalog Loader ───────────────────────────────────────────────────────────

export interface CatalogSummary {
  tableName:       string
  displayName:     string | null
  tableIntent:     string | null
  rawTablePath:    string | null
  isQueryable:     boolean
  isWritable:      boolean
  columns:         any[]
  queryTemplates:  any
}

export async function getCatalogForEntity(entityId: string): Promise<CatalogSummary[]> {
  const rows = await db.query.entityDataCatalog.findMany({
    where: (t, { and, eq }) => and(eq(t.entityId, entityId), eq(t.isUserApproved, true)),
  })
  return rows.map(r => ({
    tableName:    r.tableName,
    displayName:  r.displayName,
    tableIntent:  r.tableIntent,
    rawTablePath: r.rawTablePath,
    isQueryable:  r.isQueryable,
    isWritable:   r.isWritable,
    columns:      Array.isArray(r.columns) ? r.columns : [],
    queryTemplates: r.queryTemplates ?? {},
  }))
}

// ─── SQL Safety ──────────────────────────────────────────────────────────────

const DANGEROUS_PATTERNS = /\b(DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXEC|EXECUTE|XP_|SP_|COPY|VACUUM|ANALYZE|CLUSTER|REINDEX|REFRESH|COMMENT|NOTIFY|LISTEN|UNLISTEN|LOAD|IMPORT)\b/i

function isSafeSelect(sql: string): boolean {
  const trimmed = sql.trim()
  if (!/^SELECT\b/i.test(trimmed)) return false
  if (/\b(INSERT|UPDATE|DELETE)\b/i.test(trimmed)) return false
  if (DANGEROUS_PATTERNS.test(trimmed)) return false
  // Block stacked queries
  if (trimmed.includes(';') && trimmed.indexOf(';') < trimmed.length - 1) return false
  // Block comment injection
  if (/\/\*|--/.test(trimmed)) return false
  return true
}

function isSafeWrite(sql: string): boolean {
  const trimmed = sql.trim()
  if (!/^(INSERT|UPDATE)\b/i.test(trimmed)) return false
  if (/\bDELETE\b/i.test(trimmed)) return false
  if (DANGEROUS_PATTERNS.test(trimmed)) return false
  // Block stacked queries
  if (trimmed.includes(';') && trimmed.indexOf(';') < trimmed.length - 1) return false
  // Block comment injection
  if (/\/\*|--/.test(trimmed)) return false
  return true
}

async function runRawQuery(sql: string): Promise<any[]> {
  const result = await db.execute(sql as any)
  return Array.isArray(result) ? result : (result as any).rows ?? []
}

// ─── Natural Language → SELECT ────────────────────────────────────────────────

export async function queryWithNaturalLanguage(
  entityId:   string,
  tenantId:   string,
  nlQuery:    string,
): Promise<{ sql: string; results: any[]; explanation: string }> {
  const start   = Date.now()
  const catalog = await getCatalogForEntity(entityId)
  if (!catalog.length) return { sql: '', results: [], explanation: 'Bağlı onaylı veri kaynağı bulunamadı.' }

  const queryCatalog = catalog.filter(c => c.isQueryable && c.rawTablePath)

  const systemPrompt = `Doğal dil sorgusunu SQL'e çevir. SADECE JSON döndür.
KURAL: Sadece SELECT yaz. MAX 50 satır (LIMIT 50 ekle).
KURAL: Sadece aşağıdaki tablolardaki kolonlara eriş.

Format: {"target_table":"raw_table_path","sql":"SELECT ... LIMIT 50","explanation":"ne yapıyor","columns_used":[]}`

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Sorgu: "${nlQuery}"
Tablolar:
${JSON.stringify(queryCatalog.map(c => ({
  rawTablePath: c.rawTablePath,
  displayName: c.displayName,
  tableIntent: c.tableIntent,
  columns: (c.columns as any[]).filter(col => col.isQueryable !== false).map((col: any) => ({
    name: col.sourceName ?? col.name,
    displayName: col.displayName,
    semanticRole: col.semanticRole,
    dataType: col.dataType,
  })),
})), null, 2)}`,
    },
  ]

  try {
    const { primary, fallbacks } = await getModelForRole('db_query', 'entity', tenantId)
    const chain = [primary, ...fallbacks].filter(Boolean)

    let content = '', usedModel = 'fallback'
    for (const m of chain) {
      try {
        const norm = m.includes('::') ? m : `openrouter::${m}`
        const res  = await aiComplete(norm, messages, tenantId, { temperature: 0.1, maxTokens: 1000 })
        content = res.content; usedModel = res.usedModel; break
      } catch { /* try next */ }
    }

    const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
    await logPipelineStep({ entityId, pipelineType: 'entity', modelRole: 'db_query', modelUsed: usedModel, latencyMs: Date.now() - start, success: true })

    if (!parsed.sql || !isSafeSelect(parsed.sql)) {
      return { sql: '', results: [], explanation: 'Güvenli sorgu üretilemedi.' }
    }

    const results = await runRawQuery(parsed.sql)
    return { sql: parsed.sql, results: results.slice(0, 50), explanation: parsed.explanation ?? '' }
  } catch (e: any) {
    await logPipelineStep({ entityId, pipelineType: 'entity', modelRole: 'db_query', modelUsed: 'fallback', latencyMs: Date.now() - start, success: false, errorMessage: e.message })
    return { sql: '', results: [], explanation: 'Sorgu oluşturulamadı.' }
  }
}

// ─── Natural Language → INSERT/UPDATE ────────────────────────────────────────

export async function writeWithNaturalLanguage(
  entityId:  string,
  tenantId:  string,
  action:    string,
  data:      Record<string, any>,
): Promise<{ success: boolean; message: string; affectedRows: number }> {
  const start   = Date.now()
  const catalog = await getCatalogForEntity(entityId)
  const writable = catalog.filter(c => c.isWritable && c.rawTablePath)

  if (!writable.length) return { success: false, message: 'Yazma yetkili veri kaynağı yok.', affectedRows: 0 }

  const systemPrompt = `Doğal dil yazma isteğini SQL INSERT/UPDATE'e çevir. SADECE JSON döndür.
KURAL: Sadece INSERT veya UPDATE. DELETE asla.
Format: {"operation":"INSERT|UPDATE","target_table":"raw_table_path","sql":"...","explanation":"..."}`

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `İşlem: "${action}"\nVeri: ${JSON.stringify(data)}
Yazılabilir Tablolar: ${JSON.stringify(writable.map(t => ({
  rawTablePath: t.rawTablePath,
  tableIntent: t.tableIntent,
  columns: (t.columns as any[]).filter((c: any) => c.isWritable !== false).map((c: any) => c.sourceName ?? c.name),
})))}`,
    },
  ]

  try {
    const { primary, fallbacks } = await getModelForRole('db_query', 'entity', tenantId)
    const chain = [primary, ...fallbacks].filter(Boolean)

    let content = '', usedModel = 'fallback'
    for (const m of chain) {
      try {
        const norm = m.includes('::') ? m : `openrouter::${m}`
        const res  = await aiComplete(norm, messages, tenantId, { temperature: 0.1, maxTokens: 800 })
        content = res.content; usedModel = res.usedModel; break
      } catch { /* next */ }
    }

    const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
    await logPipelineStep({ entityId, pipelineType: 'entity', modelRole: 'db_query', modelUsed: usedModel, latencyMs: Date.now() - start, success: true })

    if (!parsed.sql || !isSafeWrite(parsed.sql)) {
      return { success: false, message: 'Geçersiz yazma işlemi.', affectedRows: 0 }
    }

    await runRawQuery(parsed.sql)
    return { success: true, message: parsed.explanation ?? 'İşlem tamamlandı.', affectedRows: 1 }
  } catch (e: any) {
    await logPipelineStep({ entityId, pipelineType: 'entity', modelRole: 'db_query', modelUsed: 'fallback', latencyMs: Date.now() - start, success: false, errorMessage: e.message })
    return { success: false, message: 'İşlem gerçekleştirilemedi.', affectedRows: 0 }
  }
}

/**
 * DB Query Tool — translates "ki_db_query" n8n PostgreSQL tool
 *
 * AI agent calls this first (fast, no rate limit, no external API).
 * Only SELECT — no INSERT/UPDATE/DELETE.
 */

import { db } from '../../lib/db.js'
import { sql } from 'drizzle-orm'

export interface DbQueryResult {
  rows:   Record<string, unknown>[]
  count:  number
  error?: string
}

// Whitelist of allowed table names (security)
const ALLOWED_TABLES = new Set([
  'crm_records', 'crm_modules', 'crm_fields',
  'crm_related_lists', 'crm_sync_state', 'knowledge_entries',
])

export async function runDbQuery(
  query: string,
  connectionId?: string,
): Promise<DbQueryResult> {
  // Safety: only SELECT
  const trimmed = query.trim().toLowerCase()
  if (!trimmed.startsWith('select')) {
    return { rows: [], count: 0, error: 'Only SELECT queries are allowed.' }
  }

  // Safety: block dangerous patterns
  const dangerous = /drop|truncate|delete|insert|update|alter|create|grant|revoke|exec|execute/i
  if (dangerous.test(query)) {
    return { rows: [], count: 0, error: 'Query contains disallowed keywords.' }
  }

  try {
    const result = await db.execute(sql.raw(query))
    const rows   = result.rows as Record<string, unknown>[]
    return { rows, count: rows.length }
  } catch (err) {
    return { rows: [], count: 0, error: String(err) }
  }
}

// ── Convenience: search CRM records by module + JSONB criteria ────────────────
export async function queryCrmRecords(params: {
  connectionId:  string
  module:        string
  jsonbFilters?: Array<{ field: string; value: string }>
  limit?:        number
}): Promise<Record<string, unknown>[]> {
  const { connectionId, module, jsonbFilters = [], limit = 100 } = params

  let whereClause = `connection_id = '${connectionId}' AND module_api_name = '${module}'`
  for (const f of jsonbFilters) {
    whereClause += ` AND data->>'${f.field}' = '${f.value}'`
  }

  const q = `SELECT data FROM crm_records WHERE ${whereClause} LIMIT ${limit}`
  const result = await runDbQuery(q)
  return result.rows.map((r) => r['data'] as Record<string, unknown>)
}

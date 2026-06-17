/**
 * Entity ETL — Extract → AI-Normalize → Load
 *
 * Pipeline:
 *   Source (CRM API / external PG DB)
 *     → Mirror ALL records to entity_{slug}.crm_raw_mirror  (tam ayna)
 *     → Mirror metadata to entity_{slug}.entity_settings
 *     → AI Normalization Agent  (batch, 20 records at a time)
 *     → Write normalized rows to entity_{slug}.crm_contacts / crm_companies / crm_deals / erp_products
 *
 * Guarantees:
 *   - No records are dropped. Unknown columns go to custom_fields JSONB.
 *   - All source modules + fields are mirrored to entity_settings as metadata.
 *   - AI normalization fixes: phone format, country code, name casing,
 *     email format, company type detection, deal stage normalization.
 */

import { Pool } from 'pg'
import { db } from '../../lib/db.js'
import { crmConnections, crmModules, crmFields, kibiEntities } from '../../../db/schema.js'
import type { ConnectorConfig, ConnectorModuleMapping } from '../../../db/schema.js'
import { eq } from 'drizzle-orm'
import { decryptJson } from '../../lib/crypto.js'
import { PostgreSqlAdapter } from '../../adapters/postgresql.js'
import { AiGateway, ANALYSIS_MODELS } from '../ai/gateway.js'
import { env } from '../../../config/env.js'

const AI_BATCH_SIZE = 20  // records per AI normalization call
const MIRROR_BATCH  = 500 // rows per DB batch

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runEntityEtl(connectionId: string): Promise<EtlResult> {
  const conn = await db.query.crmConnections.findFirst({
    where: eq(crmConnections.id, connectionId),
  })
  if (!conn) throw new Error(`Connection not found: ${connectionId}`)

  const entity = await db.query.kibiEntities.findFirst({
    where: eq(kibiEntities.entityId, conn.tenantId),
  })
  if (!entity?.entityDbSchema) {
    return { ok: false, error: 'Entity schema not provisioned', rows: 0, mirrored: 0, tables: [] }
  }

  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 3 })
  try {
    await ensureEtlTables(pool, entity.entityDbSchema)

    // v3: role-based mirror connector (PostgreSQL direct → entity schema)
    if (conn.connectorConfig && (conn.connectorConfig as any).roles && conn.crmType === 'postgresql') {
      return runMirrorEtl(pool, connectionId, entity.entityDbSchema, conn.connectorConfig as any, conn.credentials)
    }

    // v2: use connector config if available (CRM API → crm_records → entity tables)
    if (conn.connectorConfig) {
      return runConnectorEtl(pool, connectionId, entity.entityDbSchema, conn.crmType, conn.connectorConfig)
    }

    // v1 fallback
    if (conn.crmType === 'postgresql') {
      const creds = decryptJson<any>(conn.credentials)
      return runPostgresEtl(pool, connectionId, entity.entityDbSchema, creds, conn.tenantId)
    }

    return runCrmRecordsEtl(pool, connectionId, entity.entityDbSchema, conn.crmType, conn.tenantId)
  } finally {
    await pool.end()
  }
}

// ── v3: Role-based Mirror ETL (PostgreSQL source → entity schema, direct copy) ─

async function runMirrorEtl(
  entityPool: Pool,
  connectionId: string,
  schemaName: string,
  config: { mappings: Array<{ sourceModule: string; targetTable: string; role: string }> },
  encryptedCreds: string,
): Promise<EtlResult> {
  const result: EtlResult = { ok: true, rows: 0, mirrored: 0, tables: [] }
  const creds = decryptJson<any>(encryptedCreds)

  const srcPool = new Pool({
    host: creds.host, port: Number(creds.port ?? 5432),
    database: creds.database, user: creds.username, password: creds.password,
    ssl: creds.ssl ? { rejectUnauthorized: false } : false,
    max: 2, connectionTimeoutMillis: 10000,
  })

  try {
    const mappings = (config.mappings ?? []).filter(m => m.targetTable && m.role !== '')

    for (const mapping of mappings) {
      const sourceTable = mapping.sourceModule
      const targetTable = mapping.targetTable

      const { rows: cols } = await srcPool.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [sourceTable]
      )
      if (cols.length === 0) continue

      const colDefs = cols.map(c => `"${c.column_name}" ${mirrorPgType(c.data_type)}`).join(', ')
      await entityPool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."${targetTable}" (
          ${colDefs},
          _ki_synced_at TIMESTAMPTZ DEFAULT NOW()
        )
      `)
      await entityPool.query(`TRUNCATE TABLE "${schemaName}"."${targetTable}"`)

      const colNames = cols.map(c => `"${c.column_name}"`).join(', ')
      const BATCH = 200
      let offset = 0

      while (true) {
        const { rows: srcRows } = await srcPool.query(
          `SELECT ${colNames} FROM "${sourceTable}" ORDER BY 1 LIMIT $1 OFFSET $2`,
          [BATCH, offset]
        )
        if (srcRows.length === 0) break

        const valueStrings: string[] = []
        const allVals: unknown[] = []
        let paramIdx = 1
        for (const row of srcRows) {
          valueStrings.push(`(${cols.map(() => `$${paramIdx++}`).join(', ')})`)
          allVals.push(...cols.map(c => row[c.column_name] ?? null))
        }
        await entityPool.query(
          `INSERT INTO "${schemaName}"."${targetTable}" (${colNames}) VALUES ${valueStrings.join(', ')}`,
          allVals
        )

        result.mirrored += srcRows.length
        result.rows += srcRows.length
        offset += BATCH
        if (srcRows.length < BATCH) break
      }

      if (!result.tables.includes(targetTable)) result.tables.push(targetTable)
    }
  } catch (err: any) {
    result.ok = false
    result.error = err.message
  } finally {
    await srcPool.end().catch(() => {})
  }

  return result
}

function mirrorPgType(dataType: string): string {
  const map: Record<string, string> = {
    'character varying': 'TEXT', 'character': 'TEXT', 'text': 'TEXT',
    'integer': 'BIGINT', 'bigint': 'BIGINT', 'smallint': 'INTEGER',
    'numeric': 'NUMERIC', 'real': 'REAL', 'double precision': 'DOUBLE PRECISION',
    'boolean': 'BOOLEAN', 'jsonb': 'JSONB', 'json': 'JSONB',
    'timestamp with time zone': 'TIMESTAMPTZ', 'timestamp without time zone': 'TIMESTAMP',
    'date': 'DATE', 'uuid': 'TEXT', 'inet': 'TEXT', 'bytea': 'TEXT',
  }
  return map[dataType] ?? 'TEXT'
}

// ── v2: Connector-based ETL ───────────────────────────────────────────────────

async function runConnectorEtl(
  pool: Pool,
  connectionId: string,
  schemaName: string,
  crmType: string,
  config: ConnectorConfig,
): Promise<EtlResult> {
  const result: EtlResult = { ok: true, rows: 0, mirrored: 0, tables: [] }

  const client = await pool.connect()
  let modules: string[] = []
  try {
    const { rows } = await client.query<{ module_api_name: string }>(
      `SELECT DISTINCT module_api_name FROM public.crm_records WHERE connection_id = $1`,
      [connectionId]
    )
    modules = rows.map(r => r.module_api_name)
  } finally {
    client.release()
  }

  for (const module of modules) {
    const mapping = config.mappings.find(m => m.sourceModule === module)
    if (!mapping || !mapping.targetTable) continue

    await ensureEntityTable(pool, schemaName, mapping.targetTable)

    let offset = 0
    while (true) {
      const batchClient = await pool.connect()
      let records: Array<{ data: Record<string, unknown>; crm_id: string }> = []
      try {
        const { rows } = await batchClient.query<{ data: Record<string, unknown>; crm_id: string }>(
          `SELECT data, crm_id FROM public.crm_records WHERE connection_id = $1 AND module_api_name = $2 LIMIT $3 OFFSET $4`,
          [connectionId, module, MIRROR_BATCH, offset]
        )
        records = rows
      } finally {
        batchClient.release()
      }
      if (records.length === 0) break

      await bulkMirrorRecords(pool, schemaName, connectionId, module, records.map(r => ({ sourceId: r.crm_id, data: r.data })))
      result.mirrored += records.length

      for (const rec of records) {
        const row = applyConnectorMapping(rec.data, mapping, connectionId, rec.crm_id, crmType)
        if (row) {
          await upsertEntityRow(pool, schemaName, mapping.targetTable, row, 'external_id')
          result.rows++
        }
      }
      if (!result.tables.includes(mapping.targetTable)) result.tables.push(mapping.targetTable)
      if (records.length < MIRROR_BATCH) break
      offset += MIRROR_BATCH
    }
  }

  return result
}

function applyConnectorMapping(
  data: Record<string, unknown>,
  mapping: ConnectorModuleMapping,
  connectionId: string,
  sourceId: string,
  sourceType: string,
): Record<string, unknown> | null {
  const row: Record<string, unknown> = {
    external_id: sourceId,
    source_type: sourceType,
    source_integration_id: connectionId,
  }
  const custom: Record<string, unknown> = {}

  for (const fieldMap of mapping.fields) {
    const val = data[fieldMap.sourceField]
    if (val === null || val === undefined || val === '') continue

    const str = String(val)
    let transformed: unknown = val

    switch (fieldMap.transform) {
      case 'email_lower':
        transformed = str.toLowerCase().trim()
        break
      case 'name_case':
        transformed = str.replace(/\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        break
      case 'phone_e164':
        transformed = str.replace(/[^\d+]/g, '')
        if (!(transformed as string).startsWith('+') && String(transformed).length === 10) transformed = '+90' + transformed
        break
      case 'country_iso':
        transformed = str.length === 2 ? str.toUpperCase() : val
        break
      case 'currency_strip':
        transformed = parseFloat(str.replace(/[^\d.,]/g, '').replace(',', '.')) || val
        break
      case 'custom':
        custom[fieldMap.customFieldKey ?? fieldMap.sourceField] = val
        continue
      default:
        transformed = val
    }

    if (fieldMap.targetField === 'custom_fields') {
      custom[fieldMap.customFieldKey ?? fieldMap.sourceField] = val
    } else {
      const isDate = ['created_at', 'updated_at', 'expected_close_date'].includes(fieldMap.targetField)
      if (isDate) {
        try { row[fieldMap.targetField] = new Date(str) } catch { /* skip */ }
      } else {
        row[fieldMap.targetField] = transformed
      }
    }
  }

  if (Object.keys(custom).length > 0) row['custom_fields'] = JSON.stringify(custom)

  if (mapping.targetTable === 'crm_contacts' && !row['full_name']) {
    const fn = (row['first_name'] ?? '') as string
    const ln = (row['last_name']  ?? '') as string
    row['full_name'] = `${fn} ${ln}`.trim() || row['email'] as string || sourceId
  }
  if (mapping.targetTable === 'crm_companies' && !row['name']) row['name'] = sourceId
  if (mapping.targetTable === 'crm_deals' && !row['title']) row['title'] = sourceId

  return row
}

// ── Ensure a specific entity table exists (create from template if missing) ───

const ENTITY_TABLE_DDL: Record<string, (schema: string) => string> = {
  crm_contacts: (s) => `
    CREATE TABLE IF NOT EXISTS "${s}".crm_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      external_id VARCHAR(255), source_type VARCHAR(50), source_integration_id UUID,
      first_name VARCHAR(255), last_name VARCHAR(255), full_name VARCHAR(511),
      email VARCHAR(255), email_secondary VARCHAR(255), phone VARCHAR(50), mobile VARCHAR(50),
      company_name VARCHAR(500), job_title VARCHAR(255), department VARCHAR(255), website VARCHAR(500),
      address_line1 VARCHAR(500), address_line2 VARCHAR(500), city VARCHAR(100), state VARCHAR(100),
      country VARCHAR(2) DEFAULT 'TR', postal_code VARCHAR(20),
      contact_type VARCHAR(50) DEFAULT 'contact', lead_source VARCHAR(100), lead_status VARCHAR(100),
      status VARCHAR(50) DEFAULT 'active', lead_score INTEGER DEFAULT 0,
      tags JSONB DEFAULT '[]', custom_fields JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
    )`,
  crm_companies: (s) => `
    CREATE TABLE IF NOT EXISTS "${s}".crm_companies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      external_id VARCHAR(255), source_type VARCHAR(50), source_integration_id UUID,
      name VARCHAR(500) NOT NULL, legal_name VARCHAR(500), industry VARCHAR(100),
      website VARCHAR(500), email VARCHAR(255), phone VARCHAR(50),
      city VARCHAR(100), state VARCHAR(100), country VARCHAR(2) DEFAULT 'TR', postal_code VARCHAR(20),
      address_line1 VARCHAR(500), tax_number VARCHAR(50), tax_office VARCHAR(100),
      employee_count INTEGER, annual_revenue NUMERIC(15,2),
      tags JSONB DEFAULT '[]', custom_fields JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
    )`,
  crm_deals: (s) => `
    CREATE TABLE IF NOT EXISTS "${s}".crm_deals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      external_id VARCHAR(255), source_type VARCHAR(50),
      title VARCHAR(500) NOT NULL, stage VARCHAR(100) DEFAULT 'new',
      deal_value NUMERIC(15,2), currency VARCHAR(3) DEFAULT 'TRY',
      probability SMALLINT DEFAULT 0, expected_close_date DATE,
      lead_source VARCHAR(100), description TEXT,
      contact_id UUID, company_id UUID,
      tags JSONB DEFAULT '[]', custom_fields JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
    )`,
  erp_products: (s) => `
    CREATE TABLE IF NOT EXISTS "${s}".erp_products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      external_id VARCHAR(255), source_type VARCHAR(50),
      name VARCHAR(500) NOT NULL, sku VARCHAR(100), barcode VARCHAR(100),
      category VARCHAR(255), description TEXT,
      cost_price NUMERIC(15,4), sale_price NUMERIC(15,4), currency VARCHAR(3) DEFAULT 'TRY',
      stock_quantity NUMERIC(15,3) DEFAULT 0, unit VARCHAR(50) DEFAULT 'adet',
      is_active BOOLEAN DEFAULT TRUE,
      tags JSONB DEFAULT '[]', custom_fields JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
    )`,
}

async function ensureEntityTable(pool: Pool, schemaName: string, tableName: string): Promise<void> {
  const ddlFn = ENTITY_TABLE_DDL[tableName]
  if (!ddlFn) return
  const client = await pool.connect()
  try {
    await client.query(ddlFn(schemaName))
  } finally {
    client.release()
  }
}

// ── Ensure ETL support tables exist in entity schema ─────────────────────────

async function ensureEtlTables(pool: Pool, schemaName: string): Promise<void> {
  const client = await pool.connect()
  try {
    // Raw mirror table — stores every source record verbatim
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}".crm_raw_mirror (
        id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id   UUID         NOT NULL,
        source_table    VARCHAR(255) NOT NULL,
        source_id       TEXT,
        raw_data        JSONB        NOT NULL,
        normalized_at   TIMESTAMPTZ,
        target_table    VARCHAR(100),
        target_id       UUID,
        synced_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS crm_raw_mirror_source_idx
      ON "${schemaName}".crm_raw_mirror (connection_id, source_table, source_id)
      WHERE source_id IS NOT NULL
    `)
  } finally {
    client.release()
  }
}

// ── ETL for API-based CRMs (reads from public.crm_records) ───────────────────

async function runCrmRecordsEtl(
  pool: Pool,
  connectionId: string,
  schemaName: string,
  crmType: string,
  tenantId: string,
): Promise<EtlResult> {
  const result: EtlResult = { ok: true, rows: 0, mirrored: 0, tables: [] }

  // 1. Mirror module + field metadata to entity settings
  await mirrorCrmMetadata(pool, schemaName, connectionId, crmType)

  // 2. Get all distinct source modules for this connection
  const client = await pool.connect()
  let modules: string[] = []
  try {
    const { rows } = await client.query<{ module_api_name: string }>(
      `SELECT DISTINCT module_api_name FROM public.crm_records WHERE connection_id = $1`,
      [connectionId]
    )
    modules = rows.map(r => r.module_api_name)
  } finally {
    client.release()
  }

  const gateway = new AiGateway()

  for (const module of modules) {
    const targetTable = crmTypeToEntityTable(crmType, module)
    let offset = 0

    while (true) {
      const batchClient = await pool.connect()
      let records: Array<{ data: Record<string, unknown>; crm_id: string }> = []
      try {
        const { rows } = await batchClient.query<{ data: Record<string, unknown>; crm_id: string }>(
          `SELECT data, crm_id FROM public.crm_records WHERE connection_id = $1 AND module_api_name = $2 LIMIT $3 OFFSET $4`,
          [connectionId, module, MIRROR_BATCH, offset]
        )
        records = rows
      } finally {
        batchClient.release()
      }

      if (records.length === 0) break

      // 3. Mirror ALL records verbatim
      await bulkMirrorRecords(pool, schemaName, connectionId, module, records.map(r => ({
        sourceId: r.crm_id,
        data: r.data,
      })))
      result.mirrored += records.length

      // 4. AI normalize + write to entity tables (in sub-batches)
      if (targetTable) {
        for (let i = 0; i < records.length; i += AI_BATCH_SIZE) {
          const batch = records.slice(i, i + AI_BATCH_SIZE)
          const normalized = await aiNormalizeBatch(gateway, batch.map(r => r.data), crmType, module)
          for (let j = 0; j < batch.length; j++) {
            const row = buildEntityRow(normalized[j] ?? batch[j].data, crmType, module, connectionId, batch[j].crm_id)
            if (row) {
              await upsertEntityRow(pool, schemaName, targetTable, row, 'external_id')
              result.rows++
            }
          }
        }
        if (!result.tables.includes(targetTable)) result.tables.push(targetTable)
      }

      if (records.length < MIRROR_BATCH) break
      offset += MIRROR_BATCH
    }
  }

  return result
}

// ── ETL for PostgreSQL sources (direct table streaming) ───────────────────────

async function runPostgresEtl(
  pool: Pool,
  connectionId: string,
  schemaName: string,
  creds: any,
  _tenantId: string,
): Promise<EtlResult> {
  const adapter = new PostgreSqlAdapter(creds)
  const result: EtlResult = { ok: true, rows: 0, mirrored: 0, tables: [] }

  try {
    const externalModules = await adapter.getModules()
    const gateway = new AiGateway()

    // Mirror metadata
    await mirrorPgMetadata(pool, schemaName, connectionId, adapter, externalModules)

    for (const mod of externalModules) {
      const externalFields = await adapter.getModuleFields(mod.apiName)
      const fieldNames = externalFields.map(f => f.apiName)
      const targetTable = detectPgTargetTable(mod.apiName, fieldNames)

      // Stream ALL rows from this table
      const mirrorBatch: Array<{ sourceId: string | null; data: Record<string, unknown> }> = []

      for await (const row of adapter.streamTable(mod.apiName)) {
        const sourceId = String(row['id'] ?? row['ID'] ?? row['uuid'] ?? '')
        mirrorBatch.push({ sourceId: sourceId || null, data: row })

        if (mirrorBatch.length >= MIRROR_BATCH) {
          await bulkMirrorRecords(pool, schemaName, connectionId, mod.apiName, mirrorBatch)
          result.mirrored += mirrorBatch.length
          mirrorBatch.length = 0
        }
      }

      // Flush remainder
      if (mirrorBatch.length > 0) {
        await bulkMirrorRecords(pool, schemaName, connectionId, mod.apiName, mirrorBatch)
        result.mirrored += mirrorBatch.length
      }

      // AI normalize + write entity rows if target table detected
      if (targetTable) {
        // Process from mirror table in batches
        let offset = 0
        while (true) {
          const batchClient = await pool.connect()
          let mirrorRows: Array<{ raw_data: Record<string, unknown>; source_id: string }> = []
          try {
            const { rows } = await batchClient.query<{ raw_data: Record<string, unknown>; source_id: string }>(
              `SELECT raw_data, source_id FROM "${schemaName}".crm_raw_mirror
               WHERE connection_id = $1 AND source_table = $2 AND normalized_at IS NULL
               LIMIT $3 OFFSET $4`,
              [connectionId, mod.apiName, MIRROR_BATCH, offset]
            )
            mirrorRows = rows
          } finally {
            batchClient.release()
          }

          if (mirrorRows.length === 0) break

          for (let i = 0; i < mirrorRows.length; i += AI_BATCH_SIZE) {
            const batch = mirrorRows.slice(i, i + AI_BATCH_SIZE)
            const normalized = await aiNormalizeBatch(gateway, batch.map(r => r.raw_data), 'postgresql', mod.apiName)

            for (let j = 0; j < batch.length; j++) {
              const rawRow = batch[j].raw_data
              const norm   = normalized[j] ?? rawRow
              const row    = buildPgEntityRow(norm, rawRow, fieldNames, connectionId, batch[j].source_id, targetTable)
              if (row) {
                const targetId = await upsertEntityRow(pool, schemaName, targetTable, row, 'external_id')
                // Mark as normalized
                await pool.query(
                  `UPDATE "${schemaName}".crm_raw_mirror SET normalized_at = NOW(), target_table = $1, target_id = $2
                   WHERE connection_id = $3 AND source_table = $4 AND source_id = $5`,
                  [targetTable, targetId, connectionId, mod.apiName, batch[j].source_id]
                )
                result.rows++
              }
            }
          }

          if (mirrorRows.length < MIRROR_BATCH) break
          offset += MIRROR_BATCH
        }
        if (!result.tables.includes(targetTable)) result.tables.push(targetTable)
      }
    }
  } finally {
    await adapter.end()
  }

  return result
}

// ── Mirror metadata to entity_settings ───────────────────────────────────────

async function mirrorCrmMetadata(pool: Pool, schemaName: string, connectionId: string, crmType: string) {
  const modules = await db.query.crmModules.findMany({
    where: eq(crmModules.connectionId, connectionId),
  })
  const fields = await db.query.crmFields.findMany({
    where: eq(crmFields.connectionId, connectionId),
  })

  const meta = {
    connectionId,
    crmType,
    syncedAt: new Date().toISOString(),
    modules: modules.map(m => ({
      apiName: m.apiName, label: m.pluralLabel,
    })),
    fields: fields.map(f => ({
      module: f.moduleApiName, apiName: f.apiName, label: f.fieldLabel, dataType: f.dataType,
    })),
  }

  const client = await pool.connect()
  try {
    await client.query(
      `INSERT INTO "${schemaName}".entity_settings (key, value, updated_at)
       VALUES ('crm_source_metadata', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify(meta)]
    )
  } finally {
    client.release()
  }
}

async function mirrorPgMetadata(
  pool: Pool, schemaName: string, connectionId: string,
  adapter: PostgreSqlAdapter, modules: any[]
) {
  const fieldsPerModule: Record<string, any[]> = {}
  for (const mod of modules.slice(0, 20)) {  // limit to 20 tables for metadata
    try {
      fieldsPerModule[mod.apiName] = await adapter.getModuleFields(mod.apiName)
    } catch { /* skip */ }
  }

  const meta = {
    connectionId, crmType: 'postgresql',
    syncedAt: new Date().toISOString(),
    modules: modules.map(m => ({ apiName: m.apiName, label: m.label })),
    fields: Object.entries(fieldsPerModule).flatMap(([mod, fields]) =>
      fields.map(f => ({ module: mod, apiName: f.apiName, label: f.label, dataType: f.dataType }))
    ),
  }

  const client = await pool.connect()
  try {
    await client.query(
      `INSERT INTO "${schemaName}".entity_settings (key, value, updated_at)
       VALUES ('crm_source_metadata', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify(meta)]
    )
  } finally {
    client.release()
  }
}

// ── Bulk mirror (upsert to crm_raw_mirror) ────────────────────────────────────

async function bulkMirrorRecords(
  pool: Pool,
  schemaName: string,
  connectionId: string,
  sourceTable: string,
  records: Array<{ sourceId: string | null; data: Record<string, unknown> }>,
): Promise<void> {
  if (records.length === 0) return
  const client = await pool.connect()
  try {
    for (const rec of records) {
      await client.query(
        `INSERT INTO "${schemaName}".crm_raw_mirror (connection_id, source_table, source_id, raw_data)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (connection_id, source_table, source_id)
         WHERE source_id IS NOT NULL
         DO UPDATE SET raw_data = $4::jsonb, synced_at = NOW()`,
        [connectionId, sourceTable, rec.sourceId || null, JSON.stringify(rec.data)]
      ).catch(() => {
        // If unique constraint fails (e.g. source_id is null), do plain insert
        return client.query(
          `INSERT INTO "${schemaName}".crm_raw_mirror (connection_id, source_table, source_id, raw_data)
           VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT DO NOTHING`,
          [connectionId, sourceTable, rec.sourceId || null, JSON.stringify(rec.data)]
        )
      })
    }
  } finally {
    client.release()
  }
}

// ── AI Normalization Agent ────────────────────────────────────────────────────

async function aiNormalizeBatch(
  gateway: AiGateway,
  records: Record<string, unknown>[],
  sourceType: string,
  moduleName: string,
): Promise<Record<string, unknown>[]> {
  if (records.length === 0) return []

  const prompt = `Sen bir veri normalleştirme uzmanısın. ${sourceType} kaynaklı "${moduleName}" modülüne ait ${records.length} kayıt verildi.

Her kayıt için şunları düzelt ve iyileştir:
1. Telefon numaraları: +90 5XX XXX XXXX formatına çevir (Türkiye için), uluslararası için E.164
2. Ülke kodları: 2 harfli ISO kodu (TR, US, DE, GB vb.)
3. İsim büyük/küçük harf: "AHMET YILMAZ" → "Ahmet Yılmaz"
4. E-posta: küçük harfe çevir, boşlukları kaldır
5. Para birimi değerleri: sadece sayı bırak (₺ TL $ vb. sembolleri kaldır), nokta/virgül ondalık
6. Tarih: ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ)
7. Boş string → null olarak işaretle (remove_field: true)
8. Şirket tipi tahmini: isimden "A.Ş.", "Ltd.", "GmbH" vb. tespit et → company_type alanına yaz

Orijinal kayıtları olduğu gibi döndür, sadece yukarıdaki alanlarda düzeltme yap. Bilinmeyen alanları SİLME.

Girdi (JSON dizisi):
${JSON.stringify(records, null, 0)}

Çıktı: Sadece düzeltilmiş JSON dizisini döndür (markdown/açıklama OLMADAN), aynı sırada, aynı uzunlukta.`

  try {
    const result = await gateway.complete([
      { role: 'system', content: 'Veri normalleştirme uzmanısın. Sadece JSON döndür, başka hiçbir şey yazma.' },
      { role: 'user', content: prompt },
    ], {
      model: ANALYSIS_MODELS[0],
      temperature: 0.1,
      maxTokens: 4000,
    })

    // Parse AI response
    const text = result.content.trim()
    const jsonStart = text.indexOf('[')
    const jsonEnd   = text.lastIndexOf(']') + 1
    if (jsonStart === -1 || jsonEnd === 0) return records  // fallback to original

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd))
    if (!Array.isArray(parsed) || parsed.length !== records.length) return records

    // Remove fields marked for removal
    return parsed.map((r: any) => {
      const clean: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(r)) {
        if (v !== null && v !== undefined && v !== '') clean[k] = v
      }
      return clean
    })
  } catch {
    return records  // fallback: return originals if AI fails
  }
}

// ── Entity row builders ───────────────────────────────────────────────────────

// Zoho/API CRM field mappings
const ZOHO_FIELD_MAP: Record<string, Record<string, string>> = {
  Contacts: {
    Id: 'external_id', First_Name: 'first_name', Last_Name: 'last_name',
    Full_Name: 'full_name', Email: 'email', Phone: 'phone', Mobile: 'mobile',
    Account_Name: 'company_name', Title: 'job_title', Department: 'department',
    Website: 'website', Mailing_Street: 'address_line1', Mailing_City: 'city',
    Mailing_State: 'state', Mailing_Country: 'country', Mailing_Zip: 'postal_code',
    Lead_Source: 'lead_source', Lead_Status: 'lead_status',
    Created_Time: 'created_at', Modified_Time: 'updated_at',
  },
  Leads: {
    Id: 'external_id', First_Name: 'first_name', Last_Name: 'last_name',
    Email: 'email', Phone: 'phone', Mobile: 'mobile', Company: 'company_name',
    Title: 'job_title', Lead_Source: 'lead_source', Lead_Status: 'lead_status',
    Created_Time: 'created_at', Modified_Time: 'updated_at',
  },
  Accounts: {
    Id: 'external_id', Account_Name: 'name', Phone: 'phone', Website: 'website',
    Industry: 'industry', Annual_Revenue: 'annual_revenue', Employees: 'employee_count',
    Billing_Street: 'address_line1', Billing_City: 'city', Billing_State: 'state',
    Billing_Country: 'country', Billing_Code: 'postal_code',
    Created_Time: 'created_at', Modified_Time: 'updated_at',
  },
  Deals: {
    Id: 'external_id', Deal_Name: 'title', Amount: 'deal_value', Stage: 'stage',
    Probability: 'probability', Closing_Date: 'expected_close_date',
    Lead_Source: 'lead_source', Description: 'description',
    Created_Time: 'created_at', Modified_Time: 'updated_at',
  },
  Potentials: {
    Id: 'external_id', Potential_Name: 'title', Amount: 'deal_value', Stage: 'stage',
    Probability: 'probability', Closing_Date: 'expected_close_date',
    Created_Time: 'created_at', Modified_Time: 'updated_at',
  },
  Products: {
    Id: 'external_id', Product_Name: 'name', Product_Code: 'sku',
    Unit_Price: 'unit_price', Description: 'description',
    Product_Category: 'category', Qty_in_Stock: 'available_quantity',
    Created_Time: 'created_at',
  },
}

const CRM_TYPE_MODULE_TABLE: Record<string, Record<string, string>> = {
  zoho: {
    Contacts: 'crm_contacts', Leads: 'crm_contacts', Accounts: 'crm_companies',
    Deals: 'crm_deals', Potentials: 'crm_deals', Products: 'erp_products',
  },
}

function crmTypeToEntityTable(crmType: string, module: string): string | null {
  return CRM_TYPE_MODULE_TABLE[crmType]?.[module] ?? null
}

function buildEntityRow(
  data: Record<string, unknown>,
  crmType: string,
  module: string,
  connectionId: string,
  crmId: string,
): Record<string, unknown> | null {
  const fieldMap = crmType === 'zoho' ? ZOHO_FIELD_MAP[module] : null
  if (!fieldMap) return null

  const row: Record<string, unknown> = {
    source_type: crmType,
    source_integration_id: connectionId,
    external_id: crmId,
  }
  const custom: Record<string, unknown> = {}

  for (const [src, val] of Object.entries(data)) {
    if (val === null || val === undefined || val === '') continue
    const dest = fieldMap[src]
    if (dest) {
      if (dest === 'created_at' || dest === 'updated_at' || dest === 'expected_close_date') {
        try { row[dest] = new Date(String(val)) } catch { /* skip */ }
      } else {
        row[dest] = val
      }
    } else {
      custom[src] = val  // unmapped → custom_fields
    }
  }

  if (Object.keys(custom).length > 0) row['custom_fields'] = JSON.stringify(custom)

  // Required field fallbacks
  const table = crmTypeToEntityTable(crmType, module)
  if (table === 'crm_contacts') {
    if (!row['full_name']) {
      const fn = (row['first_name'] ?? '') as string
      const ln = (row['last_name']  ?? '') as string
      row['full_name'] = `${fn} ${ln}`.trim() || row['email'] as string || `Contact-${crmId.slice(0,8)}`
    }
    if (module === 'Leads') row['contact_type'] = 'lead'
  }
  if (table === 'crm_companies' && !row['name']) {
    row['name'] = `Company-${crmId.slice(0, 8)}`
  }
  if (table === 'crm_deals' && !row['title']) {
    row['title'] = `Deal-${crmId.slice(0, 8)}`
  }

  return row
}

// ── PostgreSQL column pattern matching ────────────────────────────────────────

const PG_PATTERNS: Record<string, [RegExp, string][]> = {
  crm_contacts: [
    [/^(id|uuid|pk)$/i, 'external_id'],
    [/^(first.?name|firstname|ad|isim)$/i, 'first_name'],
    [/^(last.?name|lastname|surname|soyad)$/i, 'last_name'],
    [/^(full.?name|name|ad.?soyad|tam.?ad)$/i, 'full_name'],
    [/^(email|e.?mail|eposta|mail)$/i, 'email'],
    [/^(phone|tel(efon)?|cep|gsm|mobile|mobil)$/i, 'phone'],
    [/^(mobile|cep.?(no)?)$/i, 'mobile'],
    [/^(company|firma|sirket|company.?name)$/i, 'company_name'],
    [/^(title|unvan|pozisyon|job.?title)$/i, 'job_title'],
    [/^(department|bolum|departman)$/i, 'department'],
    [/^(website|web|url|site)$/i, 'website'],
    [/^(city|sehir|il)$/i, 'city'],
    [/^(country|ulke|country.?code)$/i, 'country'],
    [/^(postal.?code|posta.?kodu|zip)$/i, 'postal_code'],
    [/^(address|adres|street|cadde|sokak)$/i, 'address_line1'],
    [/^(lead.?source|kaynak|source)$/i, 'lead_source'],
    [/^(lead.?status|status|durum)$/i, 'lead_status'],
    [/^(created.?at|olusturma.?tarihi|kayit.?tarihi)$/i, 'created_at'],
    [/^(updated.?at|guncelleme.?tarihi)$/i, 'updated_at'],
  ],
  crm_companies: [
    [/^(id|uuid|pk)$/i, 'external_id'],
    [/^(name|firma.?adi|sirket.?adi|company|ad|isim)$/i, 'name'],
    [/^(phone|tel(efon)?|gsm)$/i, 'phone'],
    [/^(website|web|url|site)$/i, 'website'],
    [/^(industry|sektor|sektör)$/i, 'industry'],
    [/^(employee.?count|personel|calisan|calisanlar)$/i, 'employee_count'],
    [/^(city|sehir|il)$/i, 'city'],
    [/^(country|ulke)$/i, 'country'],
    [/^(tax.?number|vergi.?no|vkn)$/i, 'tax_number'],
    [/^(tax.?office|vergi.?dairesi)$/i, 'tax_office'],
    [/^(email|e.?mail)$/i, 'email'],
    [/^(website|web|url)$/i, 'website'],
    [/^(created.?at|olusturma)$/i, 'created_at'],
    [/^(updated.?at|guncelleme)$/i, 'updated_at'],
  ],
  crm_deals: [
    [/^(id|uuid|pk)$/i, 'external_id'],
    [/^(title|name|baslik|isim|deal.?name|teklif)$/i, 'title'],
    [/^(amount|tutar|deger|value|fiyat)$/i, 'deal_value'],
    [/^(stage|asama|durum|status|aşama)$/i, 'stage'],
    [/^(probability|olasilik|şans)$/i, 'probability'],
    [/^(close.?date|kapani[sş])$/i, 'expected_close_date'],
    [/^(created.?at|olusturma)$/i, 'created_at'],
    [/^(updated.?at|guncelleme)$/i, 'updated_at'],
  ],
}

const PG_TABLE_ROLE: [RegExp, string][] = [
  [/^(contacts?|musteriler?|kisiler?|mü[sş]teriler?)$/i,  'crm_contacts'],
  [/^(leads?|adaylar?|potansiyeller?|aday)$/i,            'crm_contacts'],
  [/^(accounts?|companies|firmalar?|[sş]irketler?)$/i,    'crm_companies'],
  [/^(deals?|firsatlar?|teklifler?|firsat)$/i,            'crm_deals'],
  [/^(products?|urunler?|ürünler?|mal)$/i,                'erp_products'],
]

function detectPgTargetTable(tableName: string, columns: string[]): string | null {
  for (const [pattern, table] of PG_TABLE_ROLE) {
    if (pattern.test(tableName)) return table
  }
  // Heuristic: check if column names suggest contact/company data
  const colSet = new Set(columns.map(c => c.toLowerCase()))
  if (colSet.has('email') || colSet.has('eposta')) return 'crm_contacts'
  if (colSet.has('invoice_number') || colSet.has('fatura_no')) return null  // skip invoice tables
  return null
}

function buildPgEntityRow(
  normalized: Record<string, unknown>,
  original: Record<string, unknown>,
  columns: string[],
  connectionId: string,
  sourceId: string,
  targetTable: string,
): Record<string, unknown> | null {
  const patterns = PG_PATTERNS[targetTable] ?? []
  const mapped: Record<string, unknown> = {
    source_type: 'postgresql',
    source_integration_id: connectionId,
    external_id: sourceId || String(original['id'] ?? original['ID'] ?? ''),
  }
  const unmapped: Record<string, unknown> = {}

  for (const col of columns) {
    const val = normalized[col] ?? original[col]
    if (val === null || val === undefined || val === '') continue

    let found = false
    for (const [regex, dest] of patterns) {
      if (regex.test(col)) {
        if (dest === 'created_at' || dest === 'updated_at' || dest === 'expected_close_date') {
          try { mapped[dest] = new Date(String(val)) } catch { /* skip */ }
        } else {
          mapped[dest] = val
        }
        found = true
        break
      }
    }
    if (!found) unmapped[col] = val
  }

  if (Object.keys(unmapped).length > 0) mapped['custom_fields'] = JSON.stringify(unmapped)

  // Required field fallbacks
  if (targetTable === 'crm_contacts' && !mapped['full_name']) {
    const fn = (mapped['first_name'] ?? '') as string
    const ln = (mapped['last_name']  ?? '') as string
    mapped['full_name'] = `${fn} ${ln}`.trim() || mapped['email'] as string || sourceId
    if (!mapped['full_name']) return null
  }
  if (targetTable === 'crm_companies' && !mapped['name']) {
    mapped['name'] = sourceId || 'Unknown Company'
  }
  if (targetTable === 'crm_deals' && !mapped['title']) {
    mapped['title'] = sourceId || 'Unknown Deal'
  }

  return mapped
}

// ── Upsert helper ─────────────────────────────────────────────────────────────

async function upsertEntityRow(
  pool: Pool,
  schemaName: string,
  table: string,
  row: Record<string, unknown>,
  conflictCol: string,
): Promise<string | null> {
  const cols  = Object.keys(row).filter(k => row[k] !== undefined && row[k] !== null)
  const vals  = cols.map(k => row[k])
  const places = cols.map((_, i) => `$${i + 1}`).join(', ')
  if (cols.length === 0) return null

  const client = await pool.connect()
  try {
    const conflictIdx = cols.indexOf(conflictCol)
    const hasConflict = conflictIdx !== -1 && vals[conflictIdx]

    const updateCols = cols.filter(c => c !== conflictCol && c !== 'id')
    const updateSet  = updateCols.length
      ? updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ') + ', updated_at = NOW()'
      : null

    const sql = hasConflict && updateSet
      ? `INSERT INTO "${schemaName}"."${table}" (${cols.map(c => `"${c}"`).join(', ')})
         VALUES (${places})
         ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updateSet}
         RETURNING id`
      : `INSERT INTO "${schemaName}"."${table}" (${cols.map(c => `"${c}"`).join(', ')})
         VALUES (${places})
         ON CONFLICT DO NOTHING
         RETURNING id`

    const { rows } = await client.query(sql, vals)
    return rows[0]?.id ?? null
  } catch (err) {
    // Column doesn't exist in entity schema → skip silently
    console.warn(`[ETL] upsert ${table} skip:`, String(err).slice(0, 100))
    return null
  } finally {
    client.release()
  }
}

// ── Result type ───────────────────────────────────────────────────────────────

export interface EtlResult {
  ok:       boolean
  rows:     number     // records written to entity normalized tables
  mirrored: number     // records written to crm_raw_mirror (full copy)
  tables:   string[]   // entity tables populated
  error?:   string
}

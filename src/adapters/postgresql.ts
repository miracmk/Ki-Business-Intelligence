/**
 * PostgreSQL CRM Adapter
 *
 * Treats an external PostgreSQL database as a CRM source.
 * Tables → modules, columns → fields, rows → records.
 * Supports direct schema streaming for ETL (no async bulk-read callback needed).
 */

import { Pool } from 'pg'
import { CrmAdapter, CrmCredentials, CrmModule, CrmRecord, SearchParams, BulkJob } from './base.js'

export interface PgConnectionCreds extends CrmCredentials {
  type: 'postgresql'
  host: string
  port?: number
  database: string
  username: string
  password: string
  ssl?: boolean
}

export class PostgreSqlAdapter extends CrmAdapter {
  readonly type = 'postgresql'
  private pool: Pool

  constructor(creds: CrmCredentials) {
    super(creds)
    const c = creds as PgConnectionCreds
    this.pool = new Pool({
      host:     c.host,
      port:     c.port     ?? 5432,
      database: c.database,
      user:     c.username,
      password: c.password,
      ssl:      c.ssl ? { rejectUnauthorized: false } : false,
      max: 3,
      idleTimeoutMillis: 10_000,
    })
  }

  async validateConnection() {
    try {
      const client = await this.pool.connect()
      await client.query('SELECT 1')
      client.release()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  }

  async getModules(): Promise<CrmModule[]> {
    const c = this.credentials as PgConnectionCreds & { modulesTable?: string }
    if (c.modulesTable) {
      const client = await this.pool.connect()
      try {
        const { rows, fields } = await client.query(`SELECT * FROM "${c.modulesTable}"`)
        if (rows.length === 0) return []
        const colNames = fields.map(f => f.name)
        const apiNameCol = colNames.find(n => /api_name|table_name|name|id|code/i.test(n)) ?? colNames[0]
        const labelCol   = colNames.find(n => /label|title|module_name|description/i.test(n)) ?? colNames[1] ?? apiNameCol

        return rows.map(r => ({
          apiName:  String(r[apiNameCol] ?? ''),
          label:    String(r[labelCol] ?? r[apiNameCol] ?? ''),
          singular: String(r[apiNameCol] ?? '').replace(/_s$/, '').replace(/_/g, ' '),
        })).filter(m => !!m.apiName)
      } finally {
        client.release()
      }
    }

    const client = await this.pool.connect()
    try {
      const { rows } = await client.query<{ table_name: string; comment: string | null }>(`
        SELECT t.table_name,
               obj_description(c.oid) AS comment
        FROM   information_schema.tables t
        LEFT   JOIN pg_class c ON c.relname = t.table_name
        WHERE  t.table_schema = 'public'
          AND  t.table_type   = 'BASE TABLE'
        ORDER  BY t.table_name
      `)
      return rows.map(r => ({
        apiName:  r.table_name,
        label:    r.comment ?? r.table_name,
        singular: r.table_name.replace(/_s$/, '').replace(/_/g, ' '),
      }))
    } finally {
      client.release()
    }
  }

  async getModuleFields(module: string): Promise<any[]> {
    const c = this.credentials as PgConnectionCreds & { fieldsTable?: string }
    if (c.fieldsTable) {
      const client = await this.pool.connect()
      try {
        const checkRes = await client.query(`SELECT * FROM "${c.fieldsTable}" LIMIT 1`)
        const colNames = checkRes.fields.map(f => f.name)
        const moduleCol = colNames.find(n => /module_api_name|module|table_name|table/i.test(n)) ?? colNames[0]
        const apiNameCol = colNames.find(n => /api_name|column_name|name|id|code/i.test(n)) ?? colNames[1] ?? colNames[0]
        const labelCol   = colNames.find(n => /field_label|label|title|description/i.test(n)) ?? colNames[2] ?? apiNameCol
        const typeCol    = colNames.find(n => /data_type|type|datatype/i.test(n)) ?? colNames[3] ?? colNames[0]

        const { rows } = await client.query(
          `SELECT * FROM "${c.fieldsTable}" WHERE "${moduleCol}" = $1`,
          [module]
        )

        return rows.map(r => ({
          apiName:       String(r[apiNameCol] ?? ''),
          label:         String(r[labelCol] ?? r[apiNameCol] ?? ''),
          dataType:      String(r[typeCol] ?? 'text'),
          fieldType:     String(r[typeCol] ?? 'text'),
          isMandatory:   false,
          isReadOnly:    false,
          isCustomField: false,
        })).filter(f => !!f.apiName)
      } finally {
        client.release()
      }
    }

    const client = await this.pool.connect()
    try {
      const { rows } = await client.query<{
        column_name: string; data_type: string; is_nullable: string; column_default: string | null
      }>(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM   information_schema.columns
        WHERE  table_schema = 'public' AND table_name = $1
        ORDER  BY ordinal_position
      `, [module])
      return rows.map(r => ({
        apiName:       r.column_name,
        label:         r.column_name.replace(/_/g, ' '),
        dataType:      r.data_type,
        fieldType:     r.data_type,
        isMandatory:   r.is_nullable === 'NO' && !r.column_default,
        isReadOnly:    false,
        isCustomField: false,
      }))
    } finally {
      client.release()
    }
  }

  async getRelatedLists(module: string): Promise<any[]> {
    const client = await this.pool.connect()
    try {
      const { rows } = await client.query<{
        constraint_name: string; foreign_table_name: string; column_name: string
      }>(`
        SELECT tc.constraint_name,
               ccu.table_name  AS foreign_table_name,
               kcu.column_name
        FROM   information_schema.table_constraints tc
        JOIN   information_schema.key_column_usage         kcu ON tc.constraint_name  = kcu.constraint_name
        JOIN   information_schema.referential_constraints  rc  ON tc.constraint_name  = rc.constraint_name
        JOIN   information_schema.constraint_column_usage  ccu ON rc.unique_constraint_name = ccu.constraint_name
        WHERE  tc.table_schema = 'public'
          AND  tc.table_name   = $1
          AND  tc.constraint_type = 'FOREIGN KEY'
      `, [module])
      return rows.map(r => ({
        apiName:      r.constraint_name,
        displayLabel: `${r.column_name} → ${r.foreign_table_name}`,
        module:       r.foreign_table_name,
        type:         'foreign_key',
      }))
    } finally {
      client.release()
    }
  }

  async search(params: SearchParams): Promise<CrmRecord[]> {
    const c = this.credentials as PgConnectionCreds & { dataTable?: string }
    if (c.dataTable) {
      const client = await this.pool.connect()
      try {
        const page    = params.page    ?? 1
        const perPage = params.perPage ?? 200
        const offset  = (page - 1) * perPage

        const checkRes = await client.query(`SELECT * FROM "${c.dataTable}" LIMIT 1`)
        const colNames = checkRes.fields.map(f => f.name)
        const moduleCol = colNames.find(n => /module_api_name|module|table_name|table/i.test(n)) ?? colNames[0]
        const idCol     = colNames.find(n => /crm_id|record_id|id|uuid/i.test(n)) ?? colNames[0]
        const dataCol   = colNames.find(n => /data|json|payload/i.test(n))

        const { rows } = await client.query(
          `SELECT * FROM "${c.dataTable}" WHERE "${moduleCol}" = $1 LIMIT $2 OFFSET $3`,
          [params.module, perPage, offset]
        )

        return rows.map(row => {
          let recordData: Record<string, unknown> = {}
          if (dataCol && typeof row[dataCol] === 'object') {
            recordData = row[dataCol] as Record<string, unknown>
          } else {
            recordData = row
          }
          const id = String(row[idCol] ?? recordData['id'] ?? recordData['ID'] ?? '')
          return {
            id,
            module: params.module,
            crm_id: id || JSON.stringify(row).slice(0, 40),
            crm_id_field: idCol,
            data: recordData,
            createdTime: row['created_at']?.toString() ?? row['createdat']?.toString(),
            modifiedTime: row['updated_at']?.toString() ?? row['updatedat']?.toString(),
          }
        })
      } finally {
        client.release()
      }
    }

    const client = await this.pool.connect()
    try {
      const page    = params.page    ?? 1
      const perPage = params.perPage ?? 200
      const offset  = (page - 1) * perPage
      const cols    = params.fields?.length ? params.fields.map(f => `"${f}"`).join(', ') : '*'

      const { rows } = await client.query(
        `SELECT ${cols} FROM "${params.module}" LIMIT $1 OFFSET $2`,
        [perPage, offset]
      )
      return rows.map(row => this.rowToRecord(params.module, row))
    } finally {
      client.release()
    }
  }

  async getRecord(module: string, id: string): Promise<CrmRecord | null> {
    const client = await this.pool.connect()
    try {
      const { rows } = await client.query(
        `SELECT * FROM "${module}" WHERE id = $1 LIMIT 1`, [id]
      )
      return rows[0] ? this.rowToRecord(module, rows[0]) : null
    } finally {
      client.release()
    }
  }

  async createRecord(module: string, data: Record<string, unknown>): Promise<CrmRecord> {
    const client = await this.pool.connect()
    try {
      const cols   = Object.keys(data)
      const vals   = Object.values(data)
      const places = cols.map((_, i) => `$${i + 1}`).join(', ')
      const { rows } = await client.query(
        `INSERT INTO "${module}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${places}) RETURNING *`,
        vals
      )
      return this.rowToRecord(module, rows[0])
    } finally {
      client.release()
    }
  }

  async updateRecord(module: string, id: string, data: Record<string, unknown>): Promise<CrmRecord> {
    const client = await this.pool.connect()
    try {
      const cols = Object.keys(data)
      const vals = Object.values(data)
      const sets = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ')
      const { rows } = await client.query(
        `UPDATE "${module}" SET ${sets} WHERE id = $${vals.length + 1} RETURNING *`,
        [...vals, id]
      )
      return this.rowToRecord(module, rows[0] ?? { id, ...data })
    } finally {
      client.release()
    }
  }

  async deleteRecord(module: string, id: string): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query(`DELETE FROM "${module}" WHERE id = $1`, [id])
    } finally {
      client.release()
    }
  }

  // PostgreSQL has no async bulk-read callback — sync happens synchronously via streamTable()
  async startBulkRead(module: string, _callbackUrl: string): Promise<BulkJob> {
    return { jobId: `pg_direct_${module}_${Date.now()}`, module, status: 'done' }
  }

  // Not used — ETL reads directly via streamTable()
  async *downloadBulkResult(_jobId: string): AsyncIterable<Record<string, unknown>> {}

  async subscribeNotifications() { return { channelId: '', expiresAt: '' } }
  async renewNotifications()     { return { channelId: '', expiresAt: '' } }

  // ── PostgreSQL-specific helpers ───────────────────────────────────────────────

  /** Stream rows from an external table in batches (for ETL). */
  async *streamTable(tableName: string, batchSize = 500): AsyncIterable<Record<string, unknown>> {
    const client = await this.pool.connect()
    try {
      let offset = 0
      while (true) {
        const { rows } = await client.query(
          `SELECT * FROM "${tableName}" LIMIT $1 OFFSET $2`,
          [batchSize, offset]
        )
        if (rows.length === 0) break
        for (const row of rows) yield row
        if (rows.length < batchSize) break
        offset += batchSize
      }
    } finally {
      client.release()
    }
  }

  async getTableCount(tableName: string): Promise<number> {
    const client = await this.pool.connect()
    try {
      const { rows } = await client.query<{ n: string }>(
        `SELECT COUNT(*) AS n FROM "${tableName}"`
      )
      return parseInt(rows[0]?.n ?? '0')
    } finally {
      client.release()
    }
  }

  async end() {
    await this.pool.end()
  }

  private rowToRecord(module: string, row: Record<string, unknown>): CrmRecord {
    const id = String(row['id'] ?? row['ID'] ?? row['uuid'] ?? '')
    return {
      id,
      module,
      crm_id:       id || JSON.stringify(row).slice(0, 40),
      crm_id_field: row['id'] !== undefined ? 'id' : 'ID',
      data:         row,
      createdTime:  row['created_at']?.toString() ?? row['createdat']?.toString(),
      modifiedTime: row['updated_at']?.toString() ?? row['updatedat']?.toString(),
    }
  }
}

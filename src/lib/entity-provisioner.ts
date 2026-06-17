/**
 * Entity Provisioner
 *
 * Creates an isolated PostgreSQL schema for a new entity.
 * Schema name: entity_{slug}  (e.g. entity_acme_corp)
 *
 * Called once when a new entity (tenant) is onboarded.
 * Idempotent: safe to re-run if provisioning was interrupted.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { Pool, PoolClient } from 'pg'
import { db } from './db.js'
import { kibiEntities } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { env } from '../../config/env.js'

// Template SQL loaded once at module load
const TEMPLATE_PATH = resolve(process.cwd(), 'db/entity-schema-template.sql')
const TEMPLATE_SQL  = readFileSync(TEMPLATE_PATH, 'utf8')

/**
 * Derive a safe PostgreSQL schema name from an entity slug.
 * Only lowercase letters, digits, underscores — max 63 chars total.
 */
export function deriveSchemaName(slug: string): string {
  const safe = slug.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 50)
  return `entity_${safe}`
}

/**
 * Provision a new entity schema in the central PostgreSQL database.
 * Also initialises:
 *  - Qdrant collection (entity-specific)
 *  - Redis namespace prefix
 *
 * @param kibiEntityId  — id from kibi_entities table
 * @param slug          — entity slug (from tenants.slug)
 */
export async function provisionEntity(kibiEntityId: string, slug: string): Promise<ProvisionResult> {
  const schemaName = deriveSchemaName(slug)

  // Use a direct pool connection for DDL (Drizzle doesn't handle schema creation)
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 })
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // 1. Check if schema already exists
    const exists = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = $1)`,
      [schemaName]
    )

    if (!exists.rows[0].exists) {
      // 2. Execute template with schema name substituted
      const sql = TEMPLATE_SQL.replaceAll('":schema"', `"${schemaName}"`)
      await client.query(sql)
    }

    // 3. Mark entity as provisioned in central DB
    const redisPrefix  = `ent:${slug}:`
    const qdrantColl   = `entity_${slug}`

    await db.update(kibiEntities)
      .set({
        entityDbSchema:         schemaName,
        entityRedisPrefix:      redisPrefix,
        entityQdrantCollection: qdrantColl,
        isProvisioned:          true,
        updatedAt:              new Date(),
      })
      .where(eq(kibiEntities.id, kibiEntityId))

    await client.query('COMMIT')

    return { ok: true, schemaName, redisPrefix, qdrantCollection: qdrantColl }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

/**
 * Execute a raw SQL query within an entity's schema.
 * Use this for Entity AI tool calls that read entity data.
 */
export async function queryEntitySchema(schemaName: string, sql: string, params: unknown[] = []): Promise<any[]> {
  const pool   = new Pool({ connectionString: env.DATABASE_URL, max: 1 })
  const client = await pool.connect()
  try {
    // Set search_path to entity schema so unqualified table names resolve correctly
    await client.query(`SET search_path TO "${schemaName}", public`)
    const result = await client.query(sql, params as any[])
    return result.rows
  } finally {
    client.release()
    await pool.end()
  }
}

/**
 * Get an entity's schema name by kibiEntityId.
 * Returns null if entity not found or not provisioned.
 */
export async function getEntitySchema(kibiEntityId: string): Promise<string | null> {
  const rows = await db
    .select({ entityDbSchema: kibiEntities.entityDbSchema })
    .from(kibiEntities)
    .where(eq(kibiEntities.id, kibiEntityId))
    .limit(1)

  return rows[0]?.entityDbSchema ?? null
}

/**
 * Build a simple analytics query for Entity AI.
 * Returns a safe, parameterised summary of entity data.
 */
export async function getEntityDataSummary(schemaName: string): Promise<EntityDataSummary> {
  const pool   = new Pool({ connectionString: env.DATABASE_URL, max: 1 })
  const client = await pool.connect()
  try {
    await client.query(`SET search_path TO "${schemaName}", public`)

    const [contacts, companies, deals, products, orders, staff, invoices, expenses] = await Promise.all([
      client.query<{ count: string }>(`SELECT COUNT(*) FROM crm_records WHERE module_api_name IN ('Contacts', 'Leads')`),
      client.query<{ count: string }>(`SELECT COUNT(*) FROM crm_records WHERE module_api_name = 'Accounts'`),
      client.query<{ count: string; total_value: string }>(
        `SELECT COUNT(*), COALESCE(SUM((data->>'Amount')::numeric), 0) AS total_value FROM crm_records WHERE module_api_name = 'Deals'`
      ),
      client.query<{ count: string; low_stock: string }>(
        `SELECT COUNT(*), SUM(CASE WHEN reorder_point IS NOT NULL AND available_quantity <= reorder_point THEN 1 ELSE 0 END) AS low_stock FROM erp_products WHERE deleted_at IS NULL AND is_active = TRUE`
      ),
      client.query<{ count: string; total: string }>(
        `SELECT COUNT(*), COALESCE(SUM(total),0) AS total FROM erp_orders WHERE order_date >= CURRENT_DATE - INTERVAL '30 days'`
      ),
      client.query<{ count: string; on_leave: string }>(
        `SELECT COUNT(*), SUM(CASE WHEN status = 'on_leave' THEN 1 ELSE 0 END) AS on_leave FROM erp_staff WHERE status != 'terminated'`
      ),
      client.query<{ receivable: string; overdue: string }>(
        `SELECT COALESCE(SUM(remaining_amount),0) AS receivable, COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND status NOT IN ('paid','cancelled') THEN remaining_amount ELSE 0 END),0) AS overdue FROM acc_invoices WHERE invoice_type = 'sale'`
      ),
      client.query<{ total: string }>(
        `SELECT COALESCE(SUM(total_amount),0) AS total FROM acc_expenses WHERE expense_date >= DATE_TRUNC('month', CURRENT_DATE)`
      ),
    ])

    return {
      crm: {
        contacts:  parseInt(contacts.rows[0].count),
        companies: parseInt(companies.rows[0].count),
        openDeals: parseInt(deals.rows[0].count),
        pipelineValue: parseFloat(deals.rows[0].total_value),
      },
      erp: {
        products:     parseInt(products.rows[0].count),
        lowStockItems: parseInt(products.rows[0].low_stock),
        ordersLast30d: parseInt(orders.rows[0].count),
        ordersValue:   parseFloat(orders.rows[0].total),
        activeStaff:   parseInt(staff.rows[0].count),
        staffOnLeave:  parseInt(staff.rows[0].on_leave),
      },
      accounting: {
        totalReceivable: parseFloat(invoices.rows[0].receivable),
        overdueReceivable: parseFloat(invoices.rows[0].overdue),
        expensesThisMonth: parseFloat(expenses.rows[0].total),
      },
    }
  } finally {
    client.release()
    await pool.end()
  }
}

export interface ProvisionResult {
  ok:              boolean
  schemaName:      string
  redisPrefix:     string
  qdrantCollection: string
}

export interface EntityDataSummary {
  crm: {
    contacts:     number
    companies:    number
    openDeals:    number
    pipelineValue: number
  }
  erp: {
    products:      number
    lowStockItems: number
    ordersLast30d: number
    ordersValue:   number
    activeStaff:   number
    staffOnLeave:  number
  }
  accounting: {
    totalReceivable:   number
    overdueReceivable: number
    expensesThisMonth: number
  }
}

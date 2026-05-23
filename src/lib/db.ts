import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '../../db/schema.js'
import { env } from '../../config/env.js'

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

export const db = drizzle(pool, { schema })
export type Db = typeof db

export async function closeDb() {
  await pool.end()
}

// Test connection on startup
export async function ensureDbConnection() {
  const client = await pool.connect()
  await client.query('SELECT 1')
  client.release()
  console.log('✓ PostgreSQL connected')
}

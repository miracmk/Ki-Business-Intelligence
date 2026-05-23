/**
 * Bulk Sync Engine
 * Translates:
 *   "CRM Bulk Read Initiator"  — startBulkSync()
 *   "CRM Bulk Read Processor"  — processBulkCallback()
 *
 * n8n flow:
 *   Get Modules → Loop → Get Fields → Build Job → Create Bulk Read Job →
 *   Parse Response → Save Job to DB → Wait 2s → Next module
 *
 *   [webhook callback] → Parse → Download ZIP → Extract → Parse CSV →
 *   Map Records → Upsert Records → Update Sync State → Mark Job Done
 */

import { db } from '../../lib/db.js'
import { redis, redisKeys } from '../../lib/redis.js'
import { crmBulkJobs, crmRecords, crmSyncState, crmSyncLog, crmFields, crmModules } from '../../../db/schema.js'
import { createAdapter } from '../../adapters/index.js'
import { decryptJson } from '../../lib/crypto.js'
import { eq, and } from 'drizzle-orm'
import type { CrmCredentials } from '../../adapters/base.js'

const BETWEEN_MODULES_DELAY_MS = 2_000  // n8n "Wait Between Modules" = 2s

export interface BulkSyncOptions {
  modules?:     string[]   // if empty, sync all modules from crm_modules table
  callbackUrl:  string     // where CRM will POST when job completes
}

// ── Initiator: start jobs for all (or selected) modules ──────────────────────
export async function startBulkSync(
  connectionId: string,
  options:      BulkSyncOptions,
): Promise<{ started: number; failed: string[] }> {
  const conn = await loadConnection(connectionId)
  const adapter = createAdapter(conn.creds)

  // Get module list from DB (already synced via metadata sync)
  let modulesToSync: string[]
  if (options.modules?.length) {
    modulesToSync = options.modules
  } else {
    const dbModules = await db.query.crmModules.findMany({
      where: (t, { eq }) => eq(t.connectionId, connectionId),
      columns: { apiName: true },
    })
    modulesToSync = dbModules.map((m) => m.apiName)
  }

  let started = 0
  const failed: string[] = []

  for (const module of modulesToSync) {
    // Check sync lock (prevent duplicate jobs)
    const lockKey = redisKeys.syncLock(connectionId, module)
    const locked  = await redis.set(lockKey, '1', 'EX', 3600, 'NX')
    if (!locked) {
      console.log(`[BulkSync] ${module} already running, skipping`)
      continue
    }

    try {
      const job = await adapter.startBulkRead(module, options.callbackUrl)

      // Save job to DB (n8n "Save Job to DB" node)
      await db.insert(crmBulkJobs).values({
        connectionId,
        jobId:         job.jobId,
        moduleApiName: module,
        status:        'pending',
        createdAt:     new Date(),
      }).onConflictDoNothing()

      console.log(`[BulkSync] Job created: ${module} → ${job.jobId}`)
      started++

    } catch (err) {
      failed.push(`${module}: ${String(err)}`)
      await redis.del(lockKey)

      // Log error (n8n "Log Job Error" node)
      await db.insert(crmSyncLog).values({
        connectionId,
        syncType:      'bulk_read_failed',
        moduleApiName: module,
        status:        'error',
        errorMessage:  String(err),
      }).catch(() => {})
    }

    await delay(BETWEEN_MODULES_DELAY_MS)
  }

  return { started, failed }
}

// ── Processor: called when CRM webhook fires with job complete ────────────────
export interface BulkCallbackPayload {
  job_id:  string
  state:   string    // 'COMPLETED' | 'FAILED' | etc.
  result?: {
    download_url?:  string
    count?:         number
    more_records?:  boolean
    next_page_token?: string
  }
  query?: { module?: { api_name?: string } }
}

export async function processBulkCallback(
  connectionId: string,
  payload:      BulkCallbackPayload,
): Promise<{ processed: number; module: string }> {
  const { job_id, state, result, query } = payload
  const moduleApiName = query?.module?.api_name ?? 'unknown'

  // ── Is it completed? (n8n "Is Completed?" node) ──────────────────────────
  if (state !== 'COMPLETED') {
    await db.update(crmBulkJobs)
      .set({ status: 'failed', completedAt: new Date(), errorMessage: `state=${state}` })
      .where(and(eq(crmBulkJobs.connectionId, connectionId), eq(crmBulkJobs.jobId, job_id)))
    return { processed: 0, module: moduleApiName }
  }

  // Mark as downloading
  await db.update(crmBulkJobs)
    .set({
      status:      'downloading',
      completedAt: new Date(),
      downloadUrl: result?.download_url,
      recordsCount: result?.count,
    })
    .where(and(eq(crmBulkJobs.connectionId, connectionId), eq(crmBulkJobs.jobId, job_id)))

  const conn    = await loadConnection(connectionId)
  const adapter = createAdapter(conn.creds)

  // ── Download + process records (n8n "Download ZIP → Extract → Parse CSV → Map → Upsert") ─
  let processed = 0
  const now     = new Date()

  try {
    for await (const row of adapter.downloadBulkResult(job_id)) {
      const crmId = String(row['Id'] ?? row['id'] ?? '')
      if (!crmId) continue

      // Upsert record (n8n "Upsert Records" node)
      await db.insert(crmRecords).values({
        connectionId,
        tenantId:      conn.tenantId,
        moduleApiName,
        crmId,
        crmIdField:    'Id',
        data:          row,
        createdTime:   row['Created_Time'] ? new Date(String(row['Created_Time'])) : null,
        modifiedTime:  row['Modified_Time'] ? new Date(String(row['Modified_Time'])) : null,
        lastSyncedAt:  now,
      }).onConflictDoUpdate({
        target: [crmRecords.connectionId, crmRecords.moduleApiName, crmRecords.crmId],
        set:    { data: row, modifiedTime: row['Modified_Time'] ? new Date(String(row['Modified_Time'])) : undefined, lastSyncedAt: now },
      })
      processed++
    }

    // Update sync state (n8n "Update Sync State" node)
    await db.insert(crmSyncState).values({
      connectionId,
      moduleApiName,
      lastFullSync:  now,
      totalRecords:  result?.count ?? processed,
      status:        'done',
    }).onConflictDoUpdate({
      target: [crmSyncState.connectionId, crmSyncState.moduleApiName],
      set:    { lastFullSync: now, totalRecords: result?.count ?? processed, status: 'done' },
    })

    // Mark job done
    await db.update(crmBulkJobs)
      .set({ status: 'done' })
      .where(and(eq(crmBulkJobs.connectionId, connectionId), eq(crmBulkJobs.jobId, job_id)))

    // Release sync lock
    await redis.del(redisKeys.syncLock(connectionId, moduleApiName))

  } catch (err) {
    await db.update(crmBulkJobs)
      .set({ status: 'failed', errorMessage: String(err) })
      .where(and(eq(crmBulkJobs.connectionId, connectionId), eq(crmBulkJobs.jobId, job_id)))
    throw err
  }

  return { processed, module: moduleApiName }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function loadConnection(connectionId: string) {
  const conn = await db.query.crmConnections.findFirst({
    where: (t, { eq }) => eq(t.id, connectionId),
  })
  if (!conn) throw new Error(`Connection not found: ${connectionId}`)
  const creds = decryptJson<CrmCredentials>(conn.credentials)
  return { ...conn, creds }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

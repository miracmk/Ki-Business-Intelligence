/**
 * Periyodik CRM Sync Scheduler
 * Plan bazlı otomatik entity ETL tetikleme:
 *   free       → günde 1 (86400s)
 *   starter    → 4 saatte 1 (14400s)
 *   growth     → saatte 1 (3600s)
 *   enterprise → 15 dakikada 1 (900s)
 */

import { db } from '../../lib/db.js'
import { crmConnections, kibiEntities, subscriptions } from '../../../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { runEntityEtl } from './entity-etl.js'

const PLAN_INTERVALS: Record<string, number> = {
  free:       86_400_000,
  starter:    14_400_000,
  growth:      3_600_000,
  enterprise:    900_000,
}

const CHECK_INTERVAL = 5 * 60 * 1000  // check every 5 minutes

export async function startCrmScheduler(): Promise<void> {
  console.log('[CrmScheduler] Started')
  while (true) {
    try {
      await runSchedulerCycle()
    } catch (err) {
      console.error('[CrmScheduler] Cycle error:', err)
    }
    await sleep(CHECK_INTERVAL)
  }
}

async function runSchedulerCycle(): Promise<void> {
  // Fetch all active CRM connections with tenant plan info
  const connections = await db.query.crmConnections.findMany({
    where: (t, { eq }) => eq(t.isActive, true),
  })

  const now = Date.now()

  for (const conn of connections) {
    try {
      // Get entity to find plan
      const entity = await db.query.kibiEntities.findFirst({
        where: eq(kibiEntities.entityId, conn.tenantId),
      })
      if (!entity?.entityDbSchema) continue

      const sub = await db.query.subscriptions.findFirst({
        where: and(eq(subscriptions.entityId, entity.id), eq(subscriptions.status, 'active')),
        with: { plan: true },
      })
      const planName = (sub as any)?.plan?.name ?? 'free'
      const interval = PLAN_INTERVALS[planName] ?? PLAN_INTERVALS.free

      // Check last sync time
      const lastSync = conn.lastSyncAt ? conn.lastSyncAt.getTime() : 0
      if (now - lastSync < interval) continue

      console.log(`[CrmScheduler] Triggering ETL for connection ${conn.id} (${conn.name}, plan=${planName})`)
      runEntityEtl(conn.id).catch(err =>
        console.error(`[CrmScheduler] ETL failed for ${conn.id}:`, err)
      )
    } catch (err) {
      console.error(`[CrmScheduler] Error processing connection ${conn.id}:`, err)
    }
  }
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

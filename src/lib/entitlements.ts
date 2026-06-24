// YFZ 34: Premium AI + native Add-on entitlement framework.
// Single source of truth for entity_module_entitlements reads/writes — used by
// the entitlements API, the AI gate (ai.ts), and the monthly billing cycle.
import { db } from './db.js'
import { entityModuleEntitlements } from '../../db/schema.js'
import { eq, and } from 'drizzle-orm'

export const ADDON_MODULE_KEYS = [
  'addon_customer_service',
  'addon_fulfillment',
  'addon_ecommerce',
  'addon_marketing',
  'addon_event',
  'addon_personnel_management',
] as const

export const ALL_MODULE_KEYS = ['ai_premium', ...ADDON_MODULE_KEYS] as const

export type ModuleKey = typeof ALL_MODULE_KEYS[number]

const ACTIVE_STATUSES = ['active', 'trial']

export async function listEntitlements(entityId: string) {
  return db.query.entityModuleEntitlements.findMany({
    where: (t, { eq }) => eq(t.entityId, entityId),
  })
}

export async function hasActiveEntitlement(entityId: string, moduleKey: ModuleKey): Promise<boolean> {
  const row = await db.query.entityModuleEntitlements.findFirst({
    where: (t, { eq, and }) => and(eq(t.entityId, entityId), eq(t.moduleKey, moduleKey)),
  })
  return !!row && ACTIVE_STATUSES.includes(row.status)
}

export async function activateEntitlement(entityId: string, moduleKey: ModuleKey, opts?: { status?: 'trial' | 'active'; priceUsd?: string }) {
  const status = opts?.status ?? 'active'
  const existing = await db.query.entityModuleEntitlements.findFirst({
    where: (t, { eq, and }) => and(eq(t.entityId, entityId), eq(t.moduleKey, moduleKey)),
  })
  if (existing) {
    const [row] = await db.update(entityModuleEntitlements)
      .set({ status, cancelledAt: null, updatedAt: new Date(), ...(opts?.priceUsd ? { priceUsd: opts.priceUsd } : {}) })
      .where(eq(entityModuleEntitlements.id, existing.id))
      .returning()
    return row
  }
  const [row] = await db.insert(entityModuleEntitlements).values({
    entityId,
    moduleKey,
    status,
    priceUsd: opts?.priceUsd ?? '0',
  }).returning()
  return row
}

export async function deactivateEntitlement(entityId: string, moduleKey: ModuleKey) {
  const [row] = await db.update(entityModuleEntitlements)
    .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(entityModuleEntitlements.entityId, entityId), eq(entityModuleEntitlements.moduleKey, moduleKey)))
    .returning()
  return row
}

export async function sumActiveEntitlementCharges(entityId: string): Promise<number> {
  const rows = await listEntitlements(entityId)
  return rows
    .filter(r => r.status === 'active')
    .reduce((sum, r) => sum + Number(r.priceUsd ?? 0), 0)
}

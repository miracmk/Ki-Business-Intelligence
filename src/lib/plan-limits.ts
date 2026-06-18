/**
 * Plan Limits — YFZ 27, rewired onto the YFZ 32 5-tier pricing system
 * Merkezi plan limit tanımları + kontrol fonksiyonu
 */

import { db }          from './db.js'
import { kibiEntities, entityMetrics, kibiPricingPackages } from '../../db/schema.js'
import { getEntityPackage } from '../engine/billing/billing.js'
import { eq, asc, sql } from 'drizzle-orm'

export interface PlanDef {
  name:            string
  displayName:     string
  monthlyMessages: number | null   // null = unlimited
  maxUsers:        number
  maxConnections:  number
  maxStorageMb:    number
}

// Display-only limits not tracked by kibi_pricing_packages (connections/storage were
// never billing-relevant — kept generous so they don't falsely block usage).
const DISPLAY_DEFAULTS = { maxConnections: 999, maxStorageMb: 102400 }

export async function getAllPlanDefs(): Promise<PlanDef[]> {
  const packages = await db.select().from(kibiPricingPackages)
    .where(eq(kibiPricingPackages.isActive, true))
    .orderBy(asc(kibiPricingPackages.sortOrder))
  return packages.map(pkg => ({
    name:            pkg.planName ?? pkg.name,
    displayName:     pkg.displayName,
    monthlyMessages: pkg.monthlyMessageLimit,
    maxUsers:        pkg.maxUsers,
    ...DISPLAY_DEFAULTS,
  }))
}

export interface PlanUsage {
  planName:        string
  plan:            PlanDef
  usage: {
    monthlyMessages: { used: number; limit: number | null; pct: number }
    users:           { used: number; limit: number; pct: number }
    connections:     { used: number; limit: number; pct: number }
    storageMb:       { used: number; limit: number; pct: number }
  }
  isAtLimit:       boolean
  limitsHit:       string[]
}

export async function getPlanUsage(tenantId: string): Promise<PlanUsage | null> {
  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.entityId, tenantId),
    columns: { id: true, planName: true, messagesUsedThisMonth: true },
  })
  if (!entity) return null

  const planName = entity.planName ?? 'free'
  const pkg       = await getEntityPackage(planName)

  const plan: PlanDef = pkg
    ? { name: planName, displayName: pkg.displayName, monthlyMessages: pkg.monthlyMessageLimit, maxUsers: pkg.maxUsers, ...DISPLAY_DEFAULTS }
    : { name: planName, displayName: planName, monthlyMessages: 100, maxUsers: 2, ...DISPLAY_DEFAULTS }

  const [metrics, memberCount, connectionCount] = await Promise.allSettled([
    db.query.entityMetrics.findFirst({ where: (t, { eq }) => eq(t.entityId, entity.id) }),
    db.execute(sql`SELECT COUNT(*) FROM tenant_memberships WHERE tenant_id = (SELECT entity_id FROM kibi_entities WHERE id = ${entity.id})`),
    db.execute(sql`SELECT COUNT(*) FROM crm_connections WHERE entity_id = ${entity.id}`),
  ])

  const msgs  = entity.messagesUsedThisMonth ?? 0
  const users = memberCount.status === 'fulfilled'
    ? Number((Array.isArray(memberCount.value) ? memberCount.value[0] : (memberCount.value as any).rows?.[0])?.count ?? 1)
    : 1
  const conns = connectionCount.status === 'fulfilled'
    ? Number((Array.isArray(connectionCount.value) ? connectionCount.value[0] : (connectionCount.value as any).rows?.[0])?.count ?? 0)
    : 0
  const storageMb = metrics.status === 'fulfilled'
    ? Number(metrics.value?.totalStorageMb ?? 0)
    : 0

  const pct = (used: number, limit: number | null) => limit == null ? 0 : Math.min(100, Math.round(used / Math.max(limit, 1) * 100))

  const usage = {
    monthlyMessages: { used: msgs,      limit: plan.monthlyMessages, pct: pct(msgs,      plan.monthlyMessages) },
    users:           { used: users,     limit: plan.maxUsers,        pct: pct(users,     plan.maxUsers) },
    connections:     { used: conns,     limit: plan.maxConnections,  pct: pct(conns,     plan.maxConnections) },
    storageMb:       { used: storageMb, limit: plan.maxStorageMb,    pct: pct(storageMb, plan.maxStorageMb) },
  }

  const limitsHit: string[] = []
  if (usage.monthlyMessages.pct >= 100) limitsHit.push('Aylık mesaj limiti doldu')
  if (usage.users.pct >= 100)           limitsHit.push('Kullanıcı limiti doldu')
  if (usage.connections.pct >= 100)     limitsHit.push('Bağlantı limiti doldu')
  if (usage.storageMb.pct >= 95)        limitsHit.push('Depolama kapasitesi doldu')

  return { planName, plan, usage, isAtLimit: limitsHit.length > 0, limitsHit }
}

export async function checkMessageLimit(tenantId: string): Promise<{ allowed: boolean; reason?: string }> {
  const usage = await getPlanUsage(tenantId).catch(() => null)
  if (!usage) return { allowed: true }
  if (usage.plan.monthlyMessages == null) return { allowed: true }  // unlimited (e.g. custom_models)
  if (usage.usage.monthlyMessages.pct >= 100) {
    return { allowed: false, reason: `Aylık ${usage.plan.monthlyMessages} mesaj limitinize ulaştınız. Planınızı yükseltin.` }
  }
  return { allowed: true }
}

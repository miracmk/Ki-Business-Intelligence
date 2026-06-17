/**
 * Plan Limits — YFZ 27
 * Merkezi plan limit tanımları + kontrol fonksiyonu
 */

import { db }          from './db.js'
import { kibiEntities, entityMetrics } from '../../db/schema.js'
import { eq }          from 'drizzle-orm'

export interface PlanDef {
  name:            string
  displayName:     string
  monthlyMessages: number
  maxUsers:        number
  maxConnections:  number
  maxStorageMb:    number
  channels:        string[]
  aiModels:        'free' | 'standard' | 'premium' | 'unlimited'
  supportSla:      string
}

export const PLAN_DEFS: Record<string, PlanDef> = {
  free: {
    name:            'free',
    displayName:     'Ücretsiz',
    monthlyMessages: 100,
    maxUsers:        2,
    maxConnections:  1,
    maxStorageMb:    512,
    channels:        ['portal'],
    aiModels:        'free',
    supportSla:      '72 saat',
  },
  starter: {
    name:            'starter',
    displayName:     'Başlangıç',
    monthlyMessages: 1000,
    maxUsers:        5,
    maxConnections:  3,
    maxStorageMb:    2048,
    channels:        ['portal', 'whatsapp', 'email'],
    aiModels:        'standard',
    supportSla:      '24 saat',
  },
  growth: {
    name:            'growth',
    displayName:     'Büyüme',
    monthlyMessages: 5000,
    maxUsers:        15,
    maxConnections:  10,
    maxStorageMb:    10240,
    channels:        ['portal', 'whatsapp', 'email', 'telegram', 'instagram'],
    aiModels:        'premium',
    supportSla:      '4 saat',
  },
  enterprise: {
    name:            'enterprise',
    displayName:     'Kurumsal',
    monthlyMessages: 999999,
    maxUsers:        999,
    maxConnections:  999,
    maxStorageMb:    102400,
    channels:        ['portal', 'whatsapp', 'email', 'telegram', 'instagram', 'api'],
    aiModels:        'unlimited',
    supportSla:      '1 saat (SLA)',
  },
}

export interface PlanUsage {
  planName:        string
  plan:            PlanDef
  usage: {
    monthlyMessages: { used: number; limit: number; pct: number }
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
    columns: { id: true, planName: true },
  })
  if (!entity) return null

  const planName = entity.planName ?? 'free'
  const plan     = PLAN_DEFS[planName] ?? PLAN_DEFS.free

  const [metrics, memberCount, connectionCount] = await Promise.allSettled([
    db.query.entityMetrics.findFirst({ where: (t, { eq }) => eq(t.entityId, entity.id) }),
    db.execute(`SELECT COUNT(*) FROM tenant_memberships WHERE tenant_id = (SELECT entity_id FROM kibi_entities WHERE id = '${entity.id}')` as any),
    db.execute(`SELECT COUNT(*) FROM crm_connections WHERE entity_id = '${entity.id}'` as any),
  ])

  const msgs  = metrics.status === 'fulfilled' ? (metrics.value?.currentMonthMessages ?? 0) : 0
  const users = memberCount.status === 'fulfilled'
    ? Number((Array.isArray(memberCount.value) ? memberCount.value[0] : (memberCount.value as any).rows?.[0])?.count ?? 1)
    : 1
  const conns = connectionCount.status === 'fulfilled'
    ? Number((Array.isArray(connectionCount.value) ? connectionCount.value[0] : (connectionCount.value as any).rows?.[0])?.count ?? 0)
    : 0
  const storageMb = metrics.status === 'fulfilled'
    ? Number(metrics.value?.totalStorageMb ?? 0)
    : 0

  const pct = (used: number, limit: number) => Math.min(100, Math.round(used / Math.max(limit, 1) * 100))

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
  if (usage.usage.monthlyMessages.pct >= 100) {
    return { allowed: false, reason: `Aylık ${usage.plan.monthlyMessages} mesaj limitinize ulaştınız. Planınızı yükseltin.` }
  }
  return { allowed: true }
}

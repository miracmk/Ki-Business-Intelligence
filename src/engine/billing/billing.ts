/**
 * Billing engine — monthly plan charges, message overage, sub-user gating.
 *
 * Conversion: 1 USD = 1 KiCoin (platform convention; external Ki Wallet
 * determines real-world rate on their side).
 */

import { db } from '../../lib/db.js'
import {
  kibiEntities,
  kibiWallets,
  kibiWalletTransactions,
  kibiPricingPackages,
  tenantMemberships,
} from '../../../db/schema.js'
import { eq, and, lte, sql } from 'drizzle-orm'
import { env } from '../../../config/env.js'
import { sumActiveEntitlementCharges } from '../../lib/entitlements.js'

// ── Ki Wallet helpers (duplicated here to avoid circular dep) ─────────────

async function debitKiWallet(
  email: string,
  walletId: string,
  amountKiCoin: number,
  description: string,
): Promise<boolean> {
  try {
    const url = env.KI_WALLET_URL ?? 'http://ki-wallet:3001'
    const res = await fetch(`${url}/api/debit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': env.KI_WALLET_INTERNAL_KEY ?? '' },
      body: JSON.stringify({ email, walletId, amount: amountKiCoin, description }),
      signal: AbortSignal.timeout(8000),
    })
    return res.ok
  } catch {
    return false
  }
}

async function syncKiWalletBalance(email: string, walletId: string) {
  try {
    const url = env.KI_WALLET_URL ?? 'http://ki-wallet:3001'
    const res = await fetch(`${url}/api/balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': env.KI_WALLET_INTERNAL_KEY ?? '' },
      body: JSON.stringify({ email, walletId }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json() as { balance_ki_coin: string; balance_usd: string }
    return { balanceKiCoin: parseFloat(data.balance_ki_coin ?? '0'), balanceUsd: parseFloat(data.balance_usd ?? '0') }
  } catch {
    return null
  }
}

// ── Internal charge: debit wallet + record transaction ────────────────────

export async function chargeEntity(
  entityId: string,
  amountUsd: number,
  description: string,
  txnType: 'charge' | 'overage_message' | 'overage_sub_user' | 'monthly_plan' = 'charge',
): Promise<{ ok: boolean; insufficientFunds: boolean }> {
  const wallet = await db.query.kibiWallets.findFirst({
    where: (t, { eq }) => eq(t.entityId, entityId),
  })
  if (!wallet) return { ok: false, insufficientFunds: false }

  const amountKiCoin = amountUsd  // 1 USD = 1 KiCoin
  const currentBalance = parseFloat(String(wallet.balanceKiCoin) || '0')
  if (currentBalance < amountKiCoin) return { ok: false, insufficientFunds: true }

  const ok = await debitKiWallet(wallet.email, wallet.walletId, amountKiCoin, description)
  const balanceAfter = Math.max(0, currentBalance - amountKiCoin)

  await db.insert(kibiWalletTransactions).values({
    walletId:     wallet.id,
    entityId,
    type:         'charge',
    amountKiCoin: String(amountKiCoin),
    amountUsd:    String(amountUsd),
    description,
    balanceAfter: String(balanceAfter),
    metadata:     { kiWalletSuccess: ok, txnType },
  })

  if (ok) {
    await db.update(kibiWallets)
      .set({ balanceKiCoin: String(balanceAfter), updatedAt: new Date() })
      .where(eq(kibiWallets.id, wallet.id))
  }

  return { ok, insufficientFunds: false }
}

// ── Get pricing package for an entity ─────────────────────────────────────

export async function getEntityPackage(entityPlanName: string) {
  const pkg = await db.query.kibiPricingPackages.findFirst({
    where: (t, { eq }) => eq(t.planName!, entityPlanName),
  })
  return pkg ?? null
}

// ── Monthly billing for a single entity ───────────────────────────────────

export async function billEntityMonthly(entityId: string): Promise<{
  ok: boolean
  skipped: boolean
  reason?: string
  chargedUsd?: number
}> {
  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.id, entityId),
  })
  if (!entity) return { ok: false, skipped: true, reason: 'entity_not_found' }

  // YFZ 34: Premium AI / add-on entitlements are priced independently of plan_name —
  // sum them here so they ride the same monthly Ki Wallet debit as the base plan charge.
  const entitlementUsd = await sumActiveEntitlementCharges(entityId).catch(() => 0)

  if (!entity.planName || entity.planName === 'free') {
    // Free plan: no base/overage charge, but active entitlements (e.g. a paid add-on) still bill.
    let chargedOk = true
    if (entitlementUsd > 0) {
      const result = await chargeEntity(
        entityId, entitlementUsd,
        `Aylık modül ücreti (${new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })})`,
        'monthly_plan',
      )
      chargedOk = result.ok
      if (result.insufficientFunds) {
        return { ok: false, skipped: false, reason: 'insufficient_funds', chargedUsd: entitlementUsd }
      }
    }
    await db.update(kibiEntities).set({
      messagesUsedThisMonth: 0,
      billingCycleStart:     new Date(),
      nextBillingAt:         nextMonthFrom(new Date()),
      updatedAt:             new Date(),
    }).where(eq(kibiEntities.id, entityId))
    await resetMemberMessageCounters(entityId)
    return { ok: chargedOk, skipped: false, chargedUsd: entitlementUsd }
  }

  const pkg = await getEntityPackage(entity.planName)
  if (!pkg) return { ok: false, skipped: true, reason: 'package_not_found' }

  const basePrice = parseFloat(String(pkg.basePriceUsd) || '0')
  const perMsgPrice = parseFloat(String(pkg.perMessagePriceUsd) || '0')
  const extraSubPrice = parseFloat(String(pkg.extraSubUserPriceUsd) || '25')
  const messagesUsed = entity.messagesUsedThisMonth ?? 0
  const extraSubs = entity.extraSubUsers ?? 0

  let totalUsd = basePrice

  // Custom Models: base + per-message charge
  if (entity.planName === 'custom_models') {
    totalUsd += messagesUsed * perMsgPrice
  }

  // Extra sub-users charge
  if (extraSubs > 0) {
    totalUsd += extraSubs * extraSubPrice
  }

  // Active Premium AI / add-on entitlements
  totalUsd += entitlementUsd

  let chargedOk = true
  if (totalUsd > 0) {
    const result = await chargeEntity(
      entityId,
      totalUsd,
      `Aylık plan ücreti — ${pkg.displayName} (${new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })})`,
      'monthly_plan',
    )
    chargedOk = result.ok
    if (result.insufficientFunds) {
      return { ok: false, skipped: false, reason: 'insufficient_funds', chargedUsd: totalUsd }
    }
  }

  if (chargedOk) {
    await db.update(kibiEntities).set({
      messagesUsedThisMonth: 0,
      billingCycleStart:     new Date(),
      nextBillingAt:         nextMonthFrom(new Date()),
      isBillingRestricted:   false,
      debtTokens:            0,
      updatedAt:             new Date(),
    }).where(eq(kibiEntities.id, entityId))
    await resetMemberMessageCounters(entityId)
  }

  return { ok: chargedOk, skipped: false, chargedUsd: totalUsd }
}

async function resetMemberMessageCounters(entityId: string) {
  // Find the tenant ID for this entity
  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.id, entityId),
    columns: { entityId: true },
  })
  if (!entity) return
  await db.update(tenantMemberships)
    .set({ messagesUsedThisMonth: 0 })
    .where(eq(tenantMemberships.tenantId, entity.entityId))
}

function nextMonthFrom(date: Date): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + 1)
  return d
}

// ── Run monthly billing for ALL overdue entities ───────────────────────────

export async function runMonthlyBillingCycle(): Promise<{ processed: number; failed: number }> {
  const now = new Date()
  const overdueEntities = await db.execute<{ id: string }>(
    sql`SELECT id FROM kibi_entities WHERE next_billing_at IS NOT NULL AND next_billing_at <= ${now}`
  )

  let processed = 0
  let failed = 0

  for (const row of overdueEntities.rows) {
    try {
      const result = await billEntityMonthly(row.id)
      if (result.ok || result.skipped) processed++
      else failed++
    } catch (e) {
      console.error(`[BILLING] Monthly billing failed for entity ${row.id}:`, e)
      failed++
    }
  }

  return { processed, failed }
}

// ── Message overage charge ─────────────────────────────────────────────────

export async function chargeMessageOverage(
  entityId: string,
  entityPlanName: string,
): Promise<{ charged: boolean; restricted: boolean }> {
  const pkg = await getEntityPackage(entityPlanName)
  if (!pkg) return { charged: false, restricted: true }

  const overagePrice = parseFloat(String(pkg.overageMessagePriceUsd) || '0.03')
  if (overagePrice <= 0) return { charged: false, restricted: false }

  const result = await chargeEntity(
    entityId,
    overagePrice,
    'Mesaj aşımı ücreti ($0.03/mesaj)',
    'overage_message',
  )

  if (result.insufficientFunds) {
    return { charged: false, restricted: true }
  }
  return { charged: result.ok, restricted: !result.ok }
}

// ── Sub-user addition: balance check + charge ─────────────────────────────

export async function chargeAndAddSubUser(
  entityId: string,
  entityPlanName: string,
): Promise<{ ok: boolean; reason?: string }> {
  const pkg = await getEntityPackage(entityPlanName)
  if (!pkg) return { ok: false, reason: 'package_not_found' }

  const subUserPrice = parseFloat(String(pkg.extraSubUserPriceUsd) || '25')

  const result = await chargeEntity(
    entityId,
    subUserPrice,
    `Ek kullanıcı ücreti — ${pkg.displayName} planı ($${subUserPrice}/ay)`,
    'overage_sub_user',
  )

  if (!result.ok) {
    return { ok: false, reason: result.insufficientFunds ? 'insufficient_funds' : 'charge_failed' }
  }

  // Increment extra_sub_users on the entity
  await db.update(kibiEntities)
    .set({ extraSubUsers: sql`extra_sub_users + 1`, updatedAt: new Date() })
    .where(eq(kibiEntities.id, entityId))

  return { ok: true }
}

// ── Token debt tracking ────────────────────────────────────────────────────

export async function incrementTokenDebt(entityId: string, tokens: number, maxDebtTokens = 100000) {
  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.id, entityId),
    columns: { debtTokens: true, isBillingRestricted: true },
  })
  if (!entity || entity.isBillingRestricted) return

  const newDebt = (entity.debtTokens ?? 0) + tokens
  const restricted = newDebt >= maxDebtTokens

  await db.update(kibiEntities).set({
    debtTokens:          newDebt,
    isBillingRestricted: restricted,
    updatedAt:           new Date(),
  }).where(eq(kibiEntities.id, entityId))
}

// ── Billing scheduler (runs every hour) ───────────────────────────────────

let _schedulerTimer: ReturnType<typeof setInterval> | null = null

export function startBillingScheduler() {
  if (_schedulerTimer) return
  // Run immediately on startup, then every hour
  void _runBillingCheck()
  _schedulerTimer = setInterval(() => void _runBillingCheck(), 60 * 60 * 1000)
  console.log('[BILLING] Scheduler started — monthly billing checks every hour')
}

export function stopBillingScheduler() {
  if (_schedulerTimer) {
    clearInterval(_schedulerTimer)
    _schedulerTimer = null
  }
}

async function _runBillingCheck() {
  try {
    const result = await runMonthlyBillingCycle()
    if (result.processed > 0 || result.failed > 0) {
      console.log(`[BILLING] Cycle complete — processed: ${result.processed}, failed: ${result.failed}`)
    }
  } catch (e) {
    console.error('[BILLING] Scheduler error:', e)
  }
}

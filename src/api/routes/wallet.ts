import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '../../lib/db.js'
import { kibiEntities, kibiWallets, kibiWalletTransactions, kibiPricingPackages } from '../../../db/schema.js'
import { eq, and, desc, sql } from 'drizzle-orm'
import { env } from '../../../config/env.js'

const isUUID = (s: string | null | undefined) =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

// Ki Wallet internal VPS connection (same network as KIBI)
async function syncFromKiWallet(email: string, walletId: string): Promise<{ balanceKiCoin: number; balanceUsd: number } | null> {
  try {
    const kiWalletUrl = env.KI_WALLET_URL ?? 'http://ki-wallet:3001'
    const res = await fetch(`${kiWalletUrl}/api/balance`, {
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

async function debitFromKiWallet(email: string, walletId: string, amountKiCoin: number, description: string): Promise<boolean> {
  try {
    const kiWalletUrl = env.KI_WALLET_URL ?? 'http://ki-wallet:3001'
    const res = await fetch(`${kiWalletUrl}/api/debit`, {
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

export const walletRoutes: FastifyPluginAsync = async (app) => {

  // ── GET /wallet — current entity wallet ───────────────────────────────────
  app.get('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string | null }
    if (!isUUID(user.tenantId)) return reply.status(403).send({ error: 'Entity bağlantısı gerekli' })

    const entity = await db.query.kibiEntities.findFirst({
      where: (t, { eq }) => eq(t.entityId, user.tenantId!),
      columns: { id: true, companyName: true },
    })
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı' })

    let wallet = await db.query.kibiWallets.findFirst({
      where: (t, { eq }) => eq(t.entityId, entity.id)
    })

    if (wallet) {
      // Try to sync live balance from Ki Wallet
      const live = await syncFromKiWallet(wallet.email, wallet.walletId)
      if (live) {
        await db.update(kibiWallets).set({
          balanceKiCoin: String(live.balanceKiCoin),
          balanceUsd:    String(live.balanceUsd),
          lastSyncAt:    new Date(),
          updatedAt:     new Date(),
        }).where(eq(kibiWallets.id, wallet.id))
        wallet = { ...wallet, balanceKiCoin: String(live.balanceKiCoin) as any, balanceUsd: String(live.balanceUsd) as any }
      }
    }

    // Upcoming charges (last 7 days token usage estimate)
    const upcomingCharges = await db.query.kibiWalletTransactions.findMany({
      where: wallet ? (t, { and, eq, gte }) => and(
        eq(t.walletId, wallet!.id),
        eq(t.type, 'charge'),
      ) : undefined,
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit: 5,
    })

    return reply.send({ wallet, upcomingCharges, topUpUrl: env.KI_WALLET_TOPUP_URL ?? null })
  })

  // ── POST /wallet/register — link email+walletId to entity ──────────────────
  app.post('/register', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string | null; role?: string }
    if (!isUUID(user.tenantId)) return reply.status(403).send({ error: 'Entity bağlantısı gerekli' })
    if (!['entity_main', 'admin', 'supervisor'].includes(user.role ?? ''))
      return reply.status(403).send({ error: 'Bu işlem için yetkiniz yok' })

    const body = z.object({
      email:    z.string().email(),
      walletId: z.string().min(10),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const entity = await db.query.kibiEntities.findFirst({
      where: (t, { eq }) => eq(t.entityId, user.tenantId!),
      columns: { id: true },
    })
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı' })

    const existing = await db.query.kibiWallets.findFirst({
      where: (t, { eq }) => eq(t.entityId, entity.id)
    })
    if (existing) return reply.status(409).send({ error: 'Bu entity için zaten bir cüzdan kayıtlı' })

    const live = await syncFromKiWallet(body.data.email, body.data.walletId)

    const [wallet] = await db.insert(kibiWallets).values({
      entityId:      entity.id,
      email:         body.data.email,
      walletId:      body.data.walletId,
      balanceKiCoin: live ? String(live.balanceKiCoin) : '0',
      balanceUsd:    live ? String(live.balanceUsd)    : '0',
      lastSyncAt:    live ? new Date() : undefined,
    }).returning()

    return reply.status(201).send({ wallet })
  })

  // ── GET /wallet/transactions — last 30 transactions ────────────────────────
  app.get('/transactions', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string | null }
    if (!isUUID(user.tenantId)) return reply.status(403).send({ error: 'Entity bağlantısı gerekli' })

    const entity = await db.query.kibiEntities.findFirst({
      where: (t, { eq }) => eq(t.entityId, user.tenantId!),
      columns: { id: true },
    })
    if (!entity) return reply.status(404).send({ error: 'Entity bulunamadı' })

    const wallet = await db.query.kibiWallets.findFirst({
      where: (t, { eq }) => eq(t.entityId, entity.id)
    })
    if (!wallet) return reply.send({ transactions: [], wallet: null })

    const transactions = await db.query.kibiWalletTransactions.findMany({
      where: (t, { eq }) => eq(t.walletId, wallet.id),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit: 30,
    })

    return reply.send({ transactions, wallet })
  })

  // ── GET /wallet/packages — pricing packages ────────────────────────────────
  app.get('/packages', { onRequest: [app.authenticate] }, async (_req, reply) => {
    const packages = await db.query.kibiPricingPackages.findMany({
      where: (t, { eq }) => eq(t.isActive, true),
      orderBy: (t, { asc }) => [asc(t.sortOrder)],
    })
    return reply.send({ packages })
  })

  // ── POST /wallet/charge — internal: debit Ki Wallet for token usage ────────
  // Only called by KIBI backend services (internal key required)
  app.post('/charge', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as { sub: string; tenantId: string | null; role?: string }
    if (user.role !== 'admin') return reply.status(403).send({ error: 'Yetkisiz' })

    const body = z.object({
      entityId:      z.string().uuid(),
      amountKiCoin:  z.number().positive(),
      amountUsd:     z.number().positive(),
      description:   z.string().max(500),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const wallet = await db.query.kibiWallets.findFirst({
      where: (t, { eq }) => eq(t.entityId, body.data.entityId)
    })
    if (!wallet) return reply.status(404).send({ error: 'Bu entity için kayıtlı cüzdan yok' })

    const success = await debitFromKiWallet(wallet.email, wallet.walletId, body.data.amountKiCoin, body.data.description)

    const currentBalance = parseFloat(String(wallet.balanceKiCoin) || '0')
    const balanceAfter   = currentBalance - body.data.amountKiCoin

    const [txn] = await db.insert(kibiWalletTransactions).values({
      walletId:      wallet.id,
      entityId:      body.data.entityId,
      type:          'charge',
      amountKiCoin:  String(body.data.amountKiCoin),
      amountUsd:     String(body.data.amountUsd),
      description:   body.data.description,
      balanceAfter:  String(balanceAfter),
      metadata:      { kiWalletSuccess: success },
    }).returning()

    if (success) {
      await db.update(kibiWallets).set({
        balanceKiCoin: String(Math.max(0, balanceAfter)),
        updatedAt:     new Date(),
      }).where(eq(kibiWallets.id, wallet.id))
    }

    return reply.send({ ok: success, transaction: txn })
  })
}

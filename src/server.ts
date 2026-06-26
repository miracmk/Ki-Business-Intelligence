import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import multipart from '@fastify/multipart'
import staticFiles from '@fastify/static'
import { createReadStream, existsSync } from 'fs'
import { join } from 'path'

import { env } from '../config/env.js'
import { ensureDbConnection, closeDb } from './lib/db.js'
import { ensureRedisConnection, closeRedis } from './lib/redis.js'
import { ensureQdrantConnection } from './lib/qdrant.js'

import { authRoutes }         from './api/routes/auth.js'
import { startImapPollers }   from './engine/imap-poller.js'
import { startCrmScheduler }  from './engine/crm-sync/crm-scheduler.js'
import { startBillingScheduler } from './engine/billing/billing.js'
import { crmRoutes }        from './api/routes/crm.js'
import { crmNativeRoutes }  from './api/routes/crm-native.js'
import { metadataRoutes }   from './api/routes/metadata.js'
import { blueprintRoutes }  from './api/routes/blueprint.js'
import { functionRoutes }   from './api/routes/functions.js'
import { erpNativeRoutes }  from './api/routes/erp-native.js'
import { customerServiceRoutes } from './api/routes/customer-service.js'
import { fulfillmentNativeRoutes } from './api/routes/fulfillment-native.js'
import { ecommerceNativeRoutes } from './api/routes/ecommerce-native.js'
import { marketingNativeRoutes } from './api/routes/marketing-native.js'
import { eventNativeRoutes } from './api/routes/event-native.js'
import { personnelNativeRoutes } from './api/routes/personnel-native.js'
import { aiRoutes }         from './api/routes/ai.js'
import { tenantRoutes, channelRoutes } from './api/routes/tenant.js'
import { accountingRoutes } from './api/routes/accounting.js'
import { supportRoutes }    from './api/routes/support.js'
import { adminRoutes }         from './api/routes/admin.js'
import { kibiRoutes }         from './api/routes/kibi.js'
import { fileRoutes }         from './api/routes/files.js'
import { notificationRoutes } from './api/routes/notifications.js'
import { walletRoutes }       from './api/routes/wallet.js'
import { entityAiRoutes }     from './api/routes/entity-ai.js'
import { dashboardRoutes }    from './api/routes/dashboard.js'
import { entitlementsRoutes } from './api/routes/entitlements.js'
import { webhookRoutes }      from './api/webhooks/index.js'
import './lib/hooks/register.js' // FAZ 5.2: registers afterSave hooks (AI fields, rule engine)

const FRONTEND_DIST = process.env['FRONTEND_DIST'] ?? '/app/frontend/dist'

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'warn' : 'info',
    transport: env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
  trustProxy: true,
})

await app.register(helmet, { global: true, contentSecurityPolicy: false })
await app.register(cors, {
  origin:      env.NODE_ENV === 'production' ? [env.APP_URL] : true,
  credentials: true,
})
await app.register(rateLimit, {
  global:      true,
  max:         100,
  timeWindow:  '1 minute',
  keyGenerator: (req) => (req.headers['x-tenant-id'] as string) ?? req.ip,
})
await app.register(jwt, { secret: env.JWT_SECRET })
await app.register(websocket)
await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } })

app.decorate('authenticate', async (req: any, reply: any) => {
  try   { await req.jwtVerify() }
  catch { reply.status(401).send({ error: 'Unauthorized' }) }
})

// Rejects entity_external tokens — use on all routes except /ai/external-chat
app.decorate('requireFullAccess', async (req: any, reply: any) => {
  try   { await req.jwtVerify() }
  catch { return reply.status(401).send({ error: 'Unauthorized' }) }
  if (req.user?.scope === 'external') {
    return reply.status(403).send({ error: 'Bu işlem için yetkiniz yok' })
  }
})

// Paths that entity_external tokens may access (besides /auth/*)
const EXTERNAL_ALLOWED_PATHS = new Set([
  '/api/v1/ai/external-chat',
])

// Global hook: block external-scoped JWTs from all routes except allowed list
app.addHook('onRequest', async (req, reply) => {
  const path = req.url.split('?')[0]
  if (!path.startsWith('/api/v1/')) return
  if (path.startsWith('/api/v1/auth/')) return
  if (EXTERNAL_ALLOWED_PATHS.has(path)) return

  try {
    const payload: any = await req.jwtDecode()
    if (payload?.scope === 'external') {
      return reply.status(403).send({ error: 'Bu işlem için yetkiniz yok' })
    }
  } catch { /* unauthenticated — let route handler deal with it */ }
})

await app.register(async (api) => {
  await api.register(authRoutes,       { prefix: '/auth' })
  await api.register(tenantRoutes,     { prefix: '/tenants' })
  await api.register(crmRoutes,        { prefix: '/crm' })
  await api.register(crmNativeRoutes,  { prefix: '/crm-native' })
  await api.register(metadataRoutes,   { prefix: '/metadata' })
  await api.register(blueprintRoutes,  { prefix: '/blueprint' })
  await api.register(functionRoutes,   { prefix: '/functions' })
  await api.register(erpNativeRoutes,  { prefix: '/erp-native' })
  await api.register(customerServiceRoutes, { prefix: '/customer-service' })
  await api.register(fulfillmentNativeRoutes, { prefix: '/fulfillment-native' })
  await api.register(ecommerceNativeRoutes, { prefix: '/ecommerce-native' })
  await api.register(marketingNativeRoutes, { prefix: '/marketing-native' })
  await api.register(eventNativeRoutes, { prefix: '/event-native' })
  await api.register(personnelNativeRoutes, { prefix: '/personnel-native' })
  await api.register(aiRoutes,         { prefix: '/ai' })
  await api.register(accountingRoutes, { prefix: '/accounting' })
  await api.register(supportRoutes,    { prefix: '/support' })
  await api.register(adminRoutes,      { prefix: '/admin' })
  await api.register(kibiRoutes,          { prefix: '/kibi' })
  await api.register(fileRoutes,          { prefix: '/files' })
  await api.register(notificationRoutes,  { prefix: '/notifications' })
  await api.register(walletRoutes,        { prefix: '/wallet' })
  await api.register(entityAiRoutes,      { prefix: '/entity-ai' })
  await api.register(channelRoutes,       { prefix: '/channels' })
  await api.register(dashboardRoutes,     { prefix: '/dashboard' })
  await api.register(entitlementsRoutes,  { prefix: '/entitlements' })
}, { prefix: '/api/v1' })

await app.register(webhookRoutes, { prefix: '/webhooks' })

app.get('/health', async () => ({ status: 'ok', ts: Date.now(), env: env.NODE_ENV }))

// Primary: serve frontend assets at /app/ (matches vite base: '/app/')
await app.register(staticFiles, {
  root:          FRONTEND_DIST,
  prefix:        '/app/',
  decorateReply: true,
  index:         false,
  list:          false,
})

// Secondary: serve public files (icons, manifests) at root for backward compat
await app.register(staticFiles, {
  root:          FRONTEND_DIST,
  prefix:        '/',
  decorateReply: false,
  index:         false,
  list:          false,
})

// Landing page at /
app.get('/', async (_req, reply) => {
  const landingPath = join(FRONTEND_DIST, 'landing.html')
  if (existsSync(landingPath)) {
    return reply.type('text/html').send(createReadStream(landingPath))
  }
  const indexPath = join(FRONTEND_DIST, 'index.html')
  if (existsSync(indexPath)) {
    return reply.type('text/html').send(createReadStream(indexPath))
  }
  return reply.status(503).send('Frontend not built')
})

app.setNotFoundHandler(async (req, reply) => {
  if (req.url.startsWith('/api/') || req.url.startsWith('/webhooks/')) {
    return reply.status(404).send({
      message: 'Route ' + req.method + ':' + req.url + ' not found',
      error: 'Not Found',
      statusCode: 404,
    })
  }
  // SPA fallback for /app and /app/*
  if (req.url === '/app' || req.url.startsWith('/app/')) {
    const indexPath = join(FRONTEND_DIST, 'index.html')
    if (existsSync(indexPath)) {
      return reply.type('text/html').send(createReadStream(indexPath))
    }
  }
  // All other paths → landing page
  const landingPath = join(FRONTEND_DIST, 'landing.html')
  if (existsSync(landingPath)) {
    return reply.type('text/html').send(createReadStream(landingPath))
  }
  return reply.status(404).send('Not found')
})

function scheduleDailyModelSync() {
  const runSync = async () => {
    console.log('[ModelSync] Running daily model sync...')
    try {
      for (const scope of ['kibi', 'entity-free']) {
        await app.inject({ method: 'GET', url: `/api/v1/admin/ai-providers/${scope}/models` })
      }
      console.log('[ModelSync] Daily model sync completed')
    } catch (e) {
      console.error('[ModelSync] Sync failed:', (e as Error).message)
    }
    scheduleNext()
  }

  const scheduleNext = () => {
    const now  = new Date()
    const next = new Date()
    next.setHours(0, 1, 0, 0)
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
    const delayMs = next.getTime() - now.getTime()
    setTimeout(runSync, delayMs)
    console.log(`[ModelSync] Next sync scheduled for ${next.toISOString()} (in ${Math.round(delayMs / 3_600_000)}h)`)
  }

  scheduleNext()
}

async function start() {
  try {
    await ensureDbConnection()
    await ensureRedisConnection()
    await ensureQdrantConnection()
    await app.listen({ port: env.PORT, host: env.HOST })
    console.log('\n🚀 Ki Platform running on ' + env.HOST + ':' + env.PORT + '\n')
    startImapPollers().catch(e => console.error('[IMAP] Poller start failed:', e))
    startCrmScheduler().catch(e => console.error('[CrmScheduler] Start failed:', e))
    startBillingScheduler()
    scheduleDailyModelSync()
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig as any, async () => {
    app.log.info(sig + ' received - shutting down')
    await app.close()
    await closeRedis()
    await closeDb()
    process.exit(0)
  })
}

start()
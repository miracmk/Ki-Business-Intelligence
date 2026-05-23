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

import { authRoutes }       from './api/routes/auth.js'
import { crmRoutes }        from './api/routes/crm.js'
import { aiRoutes }         from './api/routes/ai.js'
import { tenantRoutes }     from './api/routes/tenant.js'
import { accountingRoutes } from './api/routes/accounting.js'
import { supportRoutes }    from './api/routes/support.js'
import { adminRoutes }      from './api/routes/admin.js'
import { kibiRoutes }       from './api/routes/kibi.js'
import { fileRoutes }       from './api/routes/files.js'
import { webhookRoutes }    from './api/webhooks/index.js'

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

await app.register(async (api) => {
  await api.register(authRoutes,       { prefix: '/auth' })
  await api.register(tenantRoutes,     { prefix: '/tenants' })
  await api.register(crmRoutes,        { prefix: '/crm' })
  await api.register(aiRoutes,         { prefix: '/ai' })
  await api.register(accountingRoutes, { prefix: '/accounting' })
  await api.register(supportRoutes,    { prefix: '/support' })
  await api.register(adminRoutes,      { prefix: '/admin' })
  await api.register(kibiRoutes,       { prefix: '/kibi' })
  await api.register(fileRoutes,       { prefix: '/files' })
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

async function start() {
  try {
    await ensureDbConnection()
    await ensureRedisConnection()
    await ensureQdrantConnection()
    await app.listen({ port: env.PORT, host: env.HOST })
    console.log('\n🚀 Ki Platform running on ' + env.HOST + ':' + env.PORT + '\n')
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
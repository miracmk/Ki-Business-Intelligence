import { Redis } from 'ioredis'
import { env } from '../../config/env.js'

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
})

redis.on('error', (err: Error) => {
  console.error('Redis error:', err.message)
})

export async function ensureRedisConnection() {
  await redis.connect()
  await redis.ping()
  console.log('✓ Redis connected')
}

export async function closeRedis() {
  await redis.quit()
}

// ── Typed helpers ─────────────────────────────────────────────────────────────
export const redisKeys = {
  // Auth
  otpRecord:   (uid: string, ch: string) => `otp:${uid}:${ch}`,
  otpCooldown: (uid: string, ch: string) => `otp:cd:${uid}:${ch}`,
  pending2fa:  (uid: string)             => `2fa:pending:${uid}`,
  refreshToken:(token: string)           => `refresh:${token}`,
  totpSetup:   (uid: string)             => `totp:setup:${uid}`,

  // Session / chat memory (Redis ← n8n redis memory)
  sessionIdentity: (sessionId: string)   => `ki:session:${sessionId}:identity`,
  sessionMessages: (sessionId: string)   => `ki:session:${sessionId}:messages`,
  emailIndex:      (email: string)       => `ki:index:email:${email}`,
  contactIndex:    (cid: string)         => `ki:index:contactid:${cid}`,

  // Sync locks (prevent double sync)
  syncLock: (connectionId: string, module: string) => `sync:lock:${connectionId}:${module}`,
}

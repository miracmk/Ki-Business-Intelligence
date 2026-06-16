import { Redis } from 'ioredis';
import { env } from '../../config/env.js';
export const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
});
redis.on('error', (err) => {
    console.error('Redis error:', err.message);
});
export async function ensureRedisConnection() {
    await redis.connect();
    await redis.ping();
    console.log('✓ Redis connected');
}
export async function closeRedis() {
    await redis.quit();
}
// ── Typed helpers ─────────────────────────────────────────────────────────────
export const redisKeys = {
    // Auth
    otpRecord: (uid, ch) => `otp:${uid}:${ch}`,
    otpCooldown: (uid, ch) => `otp:cd:${uid}:${ch}`,
    pending2fa: (uid) => `2fa:pending:${uid}`,
    refreshToken: (token) => `refresh:${token}`,
    totpSetup: (uid) => `totp:setup:${uid}`,
    // Session / chat memory (Redis ← n8n redis memory)
    sessionIdentity: (sessionId) => `ki:session:${sessionId}:identity`,
    sessionMessages: (sessionId) => `ki:session:${sessionId}:messages`,
    emailIndex: (email) => `ki:index:email:${email}`,
    contactIndex: (cid) => `ki:index:contactid:${cid}`,
    // Sync locks (prevent double sync)
    syncLock: (connectionId, module) => `sync:lock:${connectionId}:${module}`,
};
//# sourceMappingURL=redis.js.map
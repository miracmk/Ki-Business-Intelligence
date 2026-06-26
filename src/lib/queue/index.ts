// FAZ 5.1: BullMQ action queue. Deliberately its own ioredis connection, NOT the shared
// `redis` instance from lib/redis.ts — BullMQ requires `maxRetriesPerRequest: null` on its
// connection (it manages retries itself via blocking commands); the shared instance is
// configured with `maxRetriesPerRequest: 3` for normal request/response use, and handing
// that to a Worker throws on startup ("BullMQ: Your redis options maxRetriesPerRequest must
// be null").
import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { env } from '../../../config/env.js'

export const queueConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
})

queueConnection.on('error', (err: Error) => {
  console.error('[Queue] Redis bağlantı hatası:', err.message)
})

export const ACTION_QUEUE_NAME = 'kibi-actions'

export const actionQueue = new Queue(ACTION_QUEUE_NAME, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 60 * 60 * 24 }, // 1 gün
    removeOnFail: { age: 60 * 60 * 24 * 7 }, // 1 hafta (debug için)
  },
})

export type ActionType = 'email' | 'webhook' | 'update_field' | 'require_approval' | 'run_function'

// Job data is intentionally flat/self-contained — the worker process has no HTTP request
// context, so every field a handler needs (entityId, schema, table, ids) must travel with
// the job rather than being re-derived from req.user et al.
export async function enqueueAction(type: ActionType, data: Record<string, unknown>): Promise<void> {
  await actionQueue.add(type, data)
}

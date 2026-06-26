// FAZ 5.1/5.5: BullMQ worker process — runs separately from the API process (`npm run
// worker`), never imported by server.ts. Dispatches by job name (== ActionType).
import { Worker, type Job } from 'bullmq'
import { queueConnection, ACTION_QUEUE_NAME, type ActionType } from '../lib/queue/index.js'
import { updateFieldHandler } from './handlers/updateField.js'
import { webhookHandler } from './handlers/webhook.js'
import { emailHandler } from './handlers/email.js'
import { runFunctionHandler } from './handlers/runFunction.js'
import { requireApprovalHandler } from './handlers/requireApproval.js'

const handlers: Record<ActionType, (data: any) => Promise<void>> = {
  update_field:      updateFieldHandler,
  webhook:           webhookHandler,
  email:             emailHandler,
  run_function:      runFunctionHandler,
  require_approval:  requireApprovalHandler,
}

const worker = new Worker(
  ACTION_QUEUE_NAME,
  async (job: Job) => {
    const handler = handlers[job.name as ActionType]
    if (!handler) throw new Error(`Bilinmeyen action tipi: ${job.name}`)
    await handler(job.data)
  },
  { connection: queueConnection, concurrency: 5 },
)

worker.on('completed', (job) => console.log(`[Worker] ${job.name} tamamlandı (${job.id})`))
worker.on('failed', (job, err) => console.error(`[Worker] ${job?.name} başarısız (${job?.id}):`, err.message))

console.log('🔧 KiBI Action Worker başladı')

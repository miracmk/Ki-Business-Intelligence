// FAZ 7.3: run_function action handler — replaces the FAZ 5.5/6 stub now that the executor
// (src/engine/functions/executor.ts, isolated-vm) exists. Every invocation is logged to
// function_executions regardless of outcome, before the handler decides whether to throw
// (so BullMQ's retry/backoff applies the same way it does to the other action handlers).
import { db } from '../../lib/db.js'
import { functionExecutions } from '../../../db/schema.js'
import { executeFunction } from '../../engine/functions/executor.js'

export interface RunFunctionJobData {
  functionId: string
  entityId: string
  schema: string
  moduleKey: string
  table: string
  recordId: string
  ruleId?: string
  ruleName?: string
}

export async function runFunctionHandler(data: RunFunctionJobData): Promise<void> {
  const fn = await db.query.functionDefinitions.findFirst({
    where: (t, { eq, and }) => and(eq(t.id, data.functionId), eq(t.entityId, data.entityId)),
  })
  if (!fn) throw new Error(`Fonksiyon bulunamadı: ${data.functionId}`)
  if (!fn.isActive) {
    console.warn(`[run_function] '${fn.name}' pasif, atlandı`)
    return
  }

  const input = { moduleKey: data.moduleKey, table: data.table, recordId: data.recordId, ruleId: data.ruleId, ruleName: data.ruleName }
  const result = await executeFunction({ code: fn.code, entityId: data.entityId, schema: data.schema, input })

  await db.insert(functionExecutions).values({
    functionId: fn.id,
    entityId: data.entityId,
    triggeredBy: input,
    status: result.ok ? 'success' : 'error',
    result: result.result ?? null,
    error: result.error ?? null,
    logs: result.logs,
    durationMs: result.durationMs,
  })

  if (!result.ok) throw new Error(`Fonksiyon hatası: ${result.error}`)
}

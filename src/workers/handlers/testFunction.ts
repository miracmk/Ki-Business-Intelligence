// FAZ 7.3: backs the "test run" button in the Functions UI. The API process enqueues this
// job and awaits it via enqueueAndWait() — it NEVER calls executeFunction itself, keeping
// "user code only runs in the worker process" true even for ad-hoc test runs.
import { executeFunction, type FunctionExecutionResult } from '../../engine/functions/executor.js'

export interface TestFunctionJobData {
  code: string
  entityId: string
  schema: string
  input: Record<string, unknown>
}

export async function testFunctionHandler(data: TestFunctionJobData): Promise<FunctionExecutionResult> {
  return executeFunction({ code: data.code, entityId: data.entityId, schema: data.schema, input: data.input ?? {} })
}

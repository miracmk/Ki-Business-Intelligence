// FAZ 7.1/7.2: custom function executor. The real security boundary is the V8 isolate
// (isolated-vm) — true memory/CPU isolation, no shared realm with the host process. This
// overrides the roadmap's original "node:vm + AST denetimi" design after a security review
// found that combination doesn't actually contain malicious code (see ast-guard.ts header).
// Only ever runs in the worker process (src/workers/handlers/runFunction.ts) — never imported
// by server.ts.
import ivm from 'isolated-vm'
import { validateFunctionCode } from './ast-guard.js'
import { recordsFind, recordsCreate, recordsUpdate } from './records-bridge.js'
import { safeFetch } from './safe-fetch.js'

const MEMORY_LIMIT_MB = 64
const DEFAULT_TIMEOUT_MS = 5_000

export interface FunctionExecutionResult {
  ok: boolean
  result?: unknown
  logs: string[]
  error?: string
  durationMs: number
}

export interface FunctionExecutionParams {
  code: string
  entityId: string
  schema: string
  input: Record<string, unknown>
  timeoutMs?: number
}

export async function executeFunction(params: FunctionExecutionParams): Promise<FunctionExecutionResult> {
  const startedAt = Date.now()
  const logs: string[] = []

  const guard = validateFunctionCode(params.code)
  if (!guard.ok) {
    return { ok: false, error: guard.error, logs, durationMs: Date.now() - startedAt }
  }

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const isolate = new ivm.Isolate({ memoryLimit: MEMORY_LIMIT_MB })

  try {
    const context = await isolate.createContext()
    const jail = context.global
    await jail.set('global', jail.derefInto())

    // Host bridge functions — each returns only plain, JSON-serializable data (ExternalCopy
    // semantics): no host-realm object (Promise, Error, array) is ever handed into the
    // isolate, which is exactly the escape vector a plain node:vm + ctx design has.
    await jail.set('__hostFind', new ivm.Reference(
      async (moduleKey: string, filter: Record<string, unknown>) => recordsFind(params.entityId, params.schema, moduleKey, filter),
    ))
    await jail.set('__hostCreate', new ivm.Reference(
      async (moduleKey: string, data: Record<string, unknown>) => recordsCreate(params.entityId, params.schema, moduleKey, data),
    ))
    await jail.set('__hostUpdate', new ivm.Reference(
      async (moduleKey: string, id: string, data: Record<string, unknown>) => recordsUpdate(params.entityId, params.schema, moduleKey, id, data),
    ))
    await jail.set('__hostHttpGet', new ivm.Reference(
      async (url: string, opts?: { headers?: Record<string, string> }) => safeFetch(url, { method: 'GET', headers: opts?.headers }),
    ))
    await jail.set('__hostHttpPost', new ivm.Reference(
      async (url: string, body: unknown, opts?: { headers?: Record<string, string> }) =>
        safeFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) }, body: JSON.stringify(body) }),
    ))
    await jail.set('__hostLog', new ivm.Reference((...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
    }))
    await jail.set('__input', new ivm.ExternalCopy(params.input).copyInto());

    // Bootstrap script: builds the `ctx` global the function body sees. Bridge calls use
    // `applySyncPromise` is NOT used here (that's for the default isolate only) — instead
    // these are real async Reference.apply() calls, awaited from inside the isolate.
    const bootstrap = `
      globalThis.ctx = {
        input: __input,
        records: {
          find:   (moduleKey, filter)     => __hostFind.apply(undefined, [moduleKey, filter ?? {}], { arguments: { copy: true }, result: { promise: true, copy: true } }),
          create: (moduleKey, data)       => __hostCreate.apply(undefined, [moduleKey, data ?? {}], { arguments: { copy: true }, result: { promise: true, copy: true } }),
          update: (moduleKey, id, data)   => __hostUpdate.apply(undefined, [moduleKey, id, data ?? {}], { arguments: { copy: true }, result: { promise: true, copy: true } }),
        },
        http: {
          get:  (url, opts)       => __hostHttpGet.apply(undefined, [url, opts ?? {}], { arguments: { copy: true }, result: { promise: true, copy: true } }),
          post: (url, body, opts) => __hostHttpPost.apply(undefined, [url, body, opts ?? {}], { arguments: { copy: true }, result: { promise: true, copy: true } }),
        },
        log: (...args) => __hostLog.applyIgnored(undefined, args, { arguments: { copy: true } }),
      };
    `
    await context.eval(bootstrap, { timeout: timeoutMs });

    const userScript = `(async () => {\n${params.code}\n})()`
    const script = await isolate.compileScript(userScript);
    const result = await script.run(context, { timeout: timeoutMs, promise: true, copy: true })

    return { ok: true, result, logs, durationMs: Date.now() - startedAt }
  } catch (err) {
    return { ok: false, error: (err as Error).message, logs, durationMs: Date.now() - startedAt }
  } finally {
    isolate.dispose()
  }
}

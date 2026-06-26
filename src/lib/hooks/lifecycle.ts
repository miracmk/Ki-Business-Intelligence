// FAZ 5.2: CRUD lifecycle hooks. Native routes call `runHooks('afterSave', ctx)` once,
// right after their own buildInsert/buildUpdate + queryEntitySchema call already committed
// the row — hooks NEVER replace or re-run that write. A hook that needs to change data does
// so via its own dedicated UPDATE (e.g. `custom_fields = custom_fields || $n::jsonb`), never
// a full-object overwrite — same clobber lesson FAZ 4.3 already paid for once.
//
// All hooks are best-effort: a thrown error is logged and swallowed so one bad hook (a
// misconfigured rule, a flaky AI call) never blocks or rolls back the save that triggered it.
// `beforeSave` is reserved for FAZ 6's blueprint gating — no-op until that lands.
export type HookEvent = 'beforeSave' | 'afterSave'
export type HookTrigger = 'on_create' | 'on_update'

export interface HookContext {
  entityId: string
  schema: string
  moduleKey: string
  table: string
  trigger: HookTrigger
  // The just-committed row, shaped like the route's SELECT/RETURNING output (camelCase).
  // Hooks may enrich this in place (e.g. merge AI-computed values) so the HTTP response
  // reflects them without an extra round-trip — that's the one mutation hooks are allowed,
  // and it never touches the database itself.
  record: Record<string, unknown> & { id: string }
}

type HookFn = (ctx: HookContext) => Promise<void>

const afterSaveHooks: HookFn[] = []

export function registerAfterSaveHook(fn: HookFn): void {
  afterSaveHooks.push(fn)
}

export async function runHooks(event: HookEvent, ctx: HookContext): Promise<void> {
  if (event !== 'afterSave') return
  for (const hook of afterSaveHooks) {
    try {
      await hook(ctx)
    } catch (err) {
      console.error(`[Hooks] afterSave başarısız (${ctx.moduleKey}):`, err)
    }
  }
}

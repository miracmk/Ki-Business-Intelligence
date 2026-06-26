// FAZ 5.2/6.2: CRUD lifecycle hooks. Native routes call `runHooks('afterSave', ctx)` once,
// right after their own buildInsert/buildUpdate + queryEntitySchema call already committed
// the row — hooks NEVER replace or re-run that write. A hook that needs to change data does
// so via its own dedicated UPDATE (e.g. `custom_fields = custom_fields || $n::jsonb`), never
// a full-object overwrite — same clobber lesson FAZ 4.3 already paid for once.
//
// afterSave hooks are best-effort: a thrown error is logged and swallowed so one bad hook (a
// misconfigured rule, a flaky AI call) never blocks or rolls back the save that triggered it.
//
// beforeSave hooks are different on purpose: they CAN deny a save (FAZ 6 blueprint gating).
// But "deny" only means a hook *evaluated the rules and said no* — if a hook *throws* (DB
// hiccup, bug), that's an infra failure, not a denial, and we fail OPEN (log loudly, allow
// the save). Blueprint here is workflow gating, not security (FAZ 9 owns security); a
// blueprint-subsystem outage must never take down all CRM writes.
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

// beforeSave runs BEFORE the write, so `record` here is a projected merge of the previous
// row + the incoming patch (`{...prev, ...patch}`), never a re-SELECT (the write hasn't
// happened yet) and never the raw patch alone (conditions may reference unchanged fields).
export interface BeforeSaveContext extends HookContext {
  prev: Record<string, unknown>
}

export interface HookResult {
  allowed: boolean
  reason?: string
  pendingApproval?: boolean
  transitionId?: string
}

type AfterSaveHookFn = (ctx: HookContext) => Promise<void>
type BeforeSaveHookFn = (ctx: BeforeSaveContext) => Promise<HookResult>

const afterSaveHooks: AfterSaveHookFn[] = []
const beforeSaveHooks: BeforeSaveHookFn[] = []

export function registerAfterSaveHook(fn: AfterSaveHookFn): void {
  afterSaveHooks.push(fn)
}

export function registerBeforeSaveHook(fn: BeforeSaveHookFn): void {
  beforeSaveHooks.push(fn)
}

export async function runHooks(event: 'afterSave', ctx: HookContext): Promise<void> {
  for (const hook of afterSaveHooks) {
    try {
      await hook(ctx)
    } catch (err) {
      console.error(`[Hooks] afterSave başarısız (${ctx.moduleKey}):`, err)
    }
  }
}

// Returns the first denial any hook produces. A hook that *throws* is logged and treated as
// allow (fail-open — see header comment); only an explicit `{allowed:false}` blocks the save.
export async function runBeforeSaveHooks(ctx: BeforeSaveContext): Promise<HookResult> {
  for (const hook of beforeSaveHooks) {
    try {
      const result = await hook(ctx)
      if (!result.allowed) return result
    } catch (err) {
      console.error(`[Hooks] beforeSave hatası (fail-open, save'e izin verildi) (${ctx.moduleKey}):`, err)
    }
  }
  return { allowed: true }
}

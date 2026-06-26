// FAZ 5.2: wires the FAZ 5.4 deterministic rule evaluator into afterSave. Re-entrancy note
// (see KIBI-PLATFORM-ROADMAP.md FAZ 5 / KIBIPR.md): an `update_field` action's worker-side
// UPDATE goes through queryEntitySchema directly, NOT through a native route — so it never
// re-triggers afterSave/evaluateRules. No loop guard is needed for that reason alone; if a
// future action type re-enters a native route (e.g. a webhook calling back into our own
// API), that call carries its own auth/request context and would re-run hooks normally,
// same as any other API caller — also not a loop, just an ordinary save.
import type { HookContext } from '../lifecycle.js'
import { evaluateRules } from '../../../engine/rules/evaluator.js'

export async function ruleEngineHook(ctx: HookContext): Promise<void> {
  await evaluateRules(ctx)
}

// FAZ 6.2: deterministic blueprint gating. Defining ANY transition row for a (module_key,
// field_key) pair puts that field under blueprint control — every other, undefined value
// change on that field is then blocked. This is correct Zoho-Blueprint-style semantics, but
// a real footgun for a partially-configured blueprint: see KIBIPR.md FAZ 6 before adding
// transitions for a field that already has live records moving through untracked states.
import { db } from '../../db.js'
import type { BeforeSaveContext, HookResult } from '../lifecycle.js'
import { matchesConditions } from '../../../engine/rules/evaluator.js'

export async function blueprintGateHook(ctx: BeforeSaveContext): Promise<HookResult> {
  const transitions = await db.query.blueprintTransitions.findMany({
    where: (t, { eq, and }) => and(eq(t.entityId, ctx.entityId), eq(t.moduleKey, ctx.moduleKey)),
  })
  if (transitions.length === 0) return { allowed: true }

  const controlledFields = new Set(transitions.map((t) => t.fieldKey))

  for (const fieldKey of controlledFields) {
    const oldVal = ctx.prev[fieldKey]
    const newVal = ctx.record[fieldKey]
    if (newVal === undefined || String(oldVal) === String(newVal)) continue

    const candidates = transitions.filter(
      (t) => t.fieldKey === fieldKey && t.fromState === String(oldVal) && t.toState === String(newVal),
    )
    if (candidates.length === 0) {
      return { allowed: false, reason: `${fieldKey}: '${oldVal}' → '${newVal}' geçişine izin verilmiyor (blueprint'te tanımlı değil)` }
    }

    for (const t of candidates) {
      if (!matchesConditions(t.conditions as any, ctx.record)) {
        return { allowed: false, reason: `${fieldKey} geçişi için zorunlu koşullar sağlanmadı` }
      }
      if (t.requiresApprovalRole) {
        return { allowed: false, pendingApproval: true, transitionId: t.id, reason: `Bu geçiş '${t.requiresApprovalRole}' onayı gerektiriyor` }
      }
    }
  }

  return { allowed: true }
}

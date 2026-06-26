// FAZ 5.4: deterministic rule evaluator. Pure condition matching — no code execution, no AI
// "decides" here (Salesforce 2026 lesson the roadmap calls out: AI proposes, deterministic
// filters gate). Matching rules enqueue their actions onto the BullMQ queue (FAZ 5.5); this
// module never executes an action itself.
import { db } from '../../lib/db.js'
import { enqueueAction, type ActionType } from '../../lib/queue/index.js'
import type { HookContext } from '../../lib/hooks/lifecycle.js'

type ConditionOp = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'in'

interface ConditionLeaf {
  field: string
  op: ConditionOp
  value: unknown
}

type ConditionNode = ConditionLeaf | { and: ConditionNode[] } | { or: ConditionNode[] }

interface ActionDef {
  type: ActionType
  config?: Record<string, unknown>
}

export function matchesConditions(node: ConditionNode | null | undefined, record: Record<string, unknown>): boolean {
  if (!node) return true // no conditions configured = always match
  if ('and' in node) return node.and.every((n) => matchesConditions(n, record))
  if ('or' in node) return node.or.some((n) => matchesConditions(n, record))

  const actual = record[node.field]
  switch (node.op) {
    case '=':        return actual === node.value
    case '!=':        return actual !== node.value
    case '>':        return Number(actual) > Number(node.value)
    case '>=':        return Number(actual) >= Number(node.value)
    case '<':        return Number(actual) < Number(node.value)
    case '<=':        return Number(actual) <= Number(node.value)
    case 'contains':  return typeof actual === 'string' && actual.includes(String(node.value))
    case 'in':        return Array.isArray(node.value) && node.value.includes(actual)
    default:          return false
  }
}

export async function evaluateRules(ctx: HookContext): Promise<void> {
  const rules = await db.query.workflowRules.findMany({
    where: (t, { eq, and }) => and(
      eq(t.entityId, ctx.entityId),
      eq(t.moduleKey, ctx.moduleKey),
      eq(t.isActive, true),
      eq(t.trigger, ctx.trigger),
    ),
  })

  for (const rule of rules) {
    if (!matchesConditions(rule.conditions as ConditionNode | null, ctx.record)) continue

    for (const action of (rule.actions as ActionDef[] ?? [])) {
      await enqueueAction(action.type, {
        ...action.config,
        entityId:  ctx.entityId,
        schema:    ctx.schema,
        moduleKey: ctx.moduleKey,
        table:     ctx.table,
        recordId:  ctx.record.id,
        ruleId:    rule.id,
        ruleName:  rule.name,
      })
    }
  }
}

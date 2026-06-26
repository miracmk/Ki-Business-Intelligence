import { useEffect, useState, type ReactNode } from 'react'
import api from '../lib/api'

// FAZ 4.4: renders a form from /metadata/:moduleKey/fields instead of hardcoded JSX.
// If the registry has no fields for moduleKey (entity not seeded, or module not in
// registry yet), falls back to whatever the caller passes as `fallback` — this is the
// "kademeli geçiş" the roadmap calls for: nothing breaks for modules not yet migrated.
//
// FAZ 7.4: client scripts are DATA, not code — `field.config.clientScript` carries a
// declarative condition (same {field,op,value}/and/or shape as the backend rule evaluator,
// src/engine/rules/evaluator.ts) that this component interprets directly. There is
// deliberately no eval()/Function() path here: letting a "client script" mean executable JS
// in the browser would be a second, much weaker code-execution surface sitting right next
// to FAZ 7's carefully isolated one — the roadmap calls this out explicitly, and it's worth
// keeping that boundary even though it'd be more flexible to allow real expressions.

type ConditionOp = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'in'
type ConditionLeaf = { field: string; op: ConditionOp; value: unknown }
type ConditionNode = ConditionLeaf | { and: ConditionNode[] } | { or: ConditionNode[] }

function matchesConditions(node: ConditionNode | null | undefined, record: Record<string, unknown>): boolean {
  if (!node) return true
  if ('and' in node) return node.and.every((n) => matchesConditions(n, record))
  if ('or' in node) return node.or.some((n) => matchesConditions(n, record))
  const actual = record[node.field]
  switch (node.op) {
    case '=': return actual === node.value
    case '!=': return actual !== node.value
    case '>': return Number(actual) > Number(node.value)
    case '>=': return Number(actual) >= Number(node.value)
    case '<': return Number(actual) < Number(node.value)
    case '<=': return Number(actual) <= Number(node.value)
    case 'contains': return typeof actual === 'string' && actual.includes(String(node.value))
    case 'in': return Array.isArray(node.value) && node.value.includes(actual)
    default: return false
  }
}

interface ClientScript {
  showIf?: ConditionNode
  requiredIf?: ConditionNode
}

export type FieldType = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'relation' | 'ai'

export interface DynamicField {
  key: string
  label: string
  type: FieldType
  isRequired: boolean
  isSystem: boolean
  config: Record<string, unknown>
  position: number
}

export interface RelationOption { value: string; label: string }

interface DynamicFormProps {
  moduleKey: string
  value: Record<string, any>
  onChange: (next: Record<string, any>) => void
  fallback: ReactNode
  excludeKeys?: string[]
  relationOptions?: Record<string, RelationOption[]>
  inputClassName: string
}

export default function DynamicForm({ moduleKey, value, onChange, fallback, excludeKeys = [], relationOptions = {}, inputClassName }: DynamicFormProps) {
  const [fields, setFields] = useState<DynamicField[] | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    api.get(`/metadata/${moduleKey}/fields`)
      .then((r) => { if (!cancelled) setFields(r.data.fields ?? []) })
      .catch(() => { if (!cancelled) setFields(null) })
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [moduleKey])

  if (!loaded) return null
  if (!fields || fields.length === 0) return <>{fallback}</>

  const visible = fields
    .filter((f) => !excludeKeys.includes(f.key))
    .filter((f) => matchesConditions((f.config?.clientScript as ClientScript | undefined)?.showIf, value))
    .sort((a, b) => a.position - b.position)

  const set = (key: string, val: unknown) => onChange({ ...value, [key]: val })

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {visible.map((f) => {
        const clientScript = f.config?.clientScript as ClientScript | undefined
        // requiredIf absent means "not conditionally required" (false) — unlike showIf,
        // where absence means "always visible" (true). Don't reuse one default for both.
        const required = f.isRequired || (clientScript?.requiredIf ? matchesConditions(clientScript.requiredIf, value) : false)
        return (
          <div key={f.key}>
            <label className="text-xs text-gray-400">{f.label}{required ? ' *' : ''}</label>
            <div className="mt-1">{renderInput(f, value[f.key], set, relationOptions[f.key], inputClassName)}</div>
          </div>
        )
      })}
    </div>
  )
}

function renderInput(
  field: DynamicField,
  current: unknown,
  set: (key: string, val: unknown) => void,
  options: RelationOption[] | undefined,
  inputClassName: string,
) {
  switch (field.type) {
    case 'number':
      return (
        <input type="number" className={inputClassName} value={(current as number) ?? ''}
          onChange={(e) => set(field.key, e.target.value === '' ? undefined : Number(e.target.value))} />
      )
    case 'date':
      return (
        <input type="date" className={inputClassName} value={(current as string)?.slice(0, 10) ?? ''}
          onChange={(e) => set(field.key, e.target.value)} />
      )
    case 'boolean':
      return (
        <input type="checkbox" className="h-4 w-4 rounded border-[#2a2a2a]" checked={Boolean(current)}
          onChange={(e) => set(field.key, e.target.checked)} />
      )
    case 'select': {
      const opts = (field.config?.options as string[] | undefined) ?? []
      return (
        <select className={inputClassName} value={(current as string) ?? ''} onChange={(e) => set(field.key, e.target.value)}>
          <option value="">Seçin...</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    }
    case 'relation':
      if (options) {
        return (
          <select className={inputClassName} value={(current as string) ?? ''} onChange={(e) => set(field.key, e.target.value || null)}>
            <option value="">Seçin...</option>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )
      }
      return (
        <input className={inputClassName} placeholder="UUID" value={(current as string) ?? ''}
          onChange={(e) => set(field.key, e.target.value || null)} />
      )
    case 'ai':
      return (
        <div className={`${inputClassName} text-gray-500 italic`}>{(current as string) || 'AI tarafından otomatik dolduruluyor'}</div>
      )
    default:
      return (
        <input className={inputClassName} value={(current as string) ?? ''} onChange={(e) => set(field.key, e.target.value)} />
      )
  }
}

// FAZ 9.2: record-level security. Roles with broad entity authority (admin/supervisor —
// platform; entity_main/entity_supervisor — entity-level) see every record; entity_sub
// ("kendi alanı" — a sales-rep-style sub-user) only sees records it owns. No team/manager
// hierarchy exists in this data model yet (kibi_entity_users has no manager_id/team concept),
// so this is a two-tier scope (self vs. all), not the three-tier "self OR team OR admin" the
// roadmap sketches — documented as a deliberate scope reduction, see KIBIPR.md FAZ 9.
const UNRESTRICTED_ROLES = new Set(['admin', 'supervisor', 'entity_main', 'entity_supervisor'])

const isUUID = (s: string | null | undefined): boolean =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

export interface ScopeUser {
  sub?: string
  role?: string
}

// Appends an owner_id (or a caller-supplied column, e.g. crm_activities' created_by_user_id)
// equality condition to `conditions`/`params` in place when the user's role is restricted.
// No-op for unrestricted roles. A restricted role WITHOUT a resolvable user id pushes `1=0`
// (show nothing) rather than skipping the filter (show everything) — this is the one place
// fail-open would silently defeat the whole feature, and `sub` failing to be a real UUID
// would otherwise crash the query at bind time anyway (owner_id is a uuid column).
export function applyScope(conditions: string[], params: unknown[], user: ScopeUser, ownerColumn = 'owner_id'): void {
  if (user.role && UNRESTRICTED_ROLES.has(user.role)) return
  if (!isUUID(user.sub)) { conditions.push('1=0'); return }
  params.push(user.sub)
  conditions.push(`${ownerColumn} = $${params.length}`)
}

// Injects the owner column into an INSERT's cols/placeholders/params in place — call right
// after buildInsert(). No-op if sub isn't a real UUID (defensive; always true for genuine
// logins) so it never breaks inserts for unrestricted-role users either.
export function injectOwnerId(cols: string[], placeholders: string[], params: unknown[], userSub: string | undefined, ownerColumn = 'owner_id'): void {
  if (!isUUID(userSub)) return
  cols.push(ownerColumn)
  params.push(userSub)
  placeholders.push(`$${params.length}`)
}

// Scopes an existing single-record WHERE (PUT/DELETE by id) so a restricted-role user can't
// edit/delete a record they don't own, even though they already know its id. Returns the
// SQL fragment to AND onto the existing `id = $n` condition; params are appended in place.
export function scopeCondition(params: unknown[], user: ScopeUser, ownerColumn = 'owner_id'): string {
  if (user.role && UNRESTRICTED_ROLES.has(user.role)) return ''
  if (!isUUID(user.sub)) return ' AND 1=0'
  params.push(user.sub)
  return ` AND ${ownerColumn} = $${params.length}`
}

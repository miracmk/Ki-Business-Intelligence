// FAZ 10.4: the ONLY write-adjacent function the AI tool layer may call. It never writes —
// it inserts a row into ai_pending_actions and returns immediately. This is the structural
// enforcement of "Create/Update/Delete go through human approval, Read is direct" — the AI
// tool surface (src/engine/ai/crud-tools.ts) imports this and recordsFind, and NOTHING else
// from records-bridge.ts (no recordsCreate/Update/Delete reachable from the agent).
import { db } from '../../lib/db.js'
import { aiPendingActions } from '../../../db/schema.js'

export interface ProposeActionParams {
  entityId: string
  moduleKey: string
  action: 'create' | 'update' | 'delete'
  recordId?: string | null
  proposedData?: Record<string, unknown> | null
  summary: string
  sessionId?: string | null
  requestedByUserId?: string | null // the chatting user who asked the AI to do this
}

export async function proposeAction(params: ProposeActionParams): Promise<{ id: string }> {
  const [row] = await db.insert(aiPendingActions).values({
    entityId: params.entityId,
    moduleKey: params.moduleKey,
    action: params.action,
    recordId: params.recordId ?? null,
    proposedData: params.proposedData ?? null,
    summary: params.summary,
    sessionId: params.sessionId ?? null,
    requestedByUserId: params.requestedByUserId ?? null,
  }).returning({ id: aiPendingActions.id })
  return row
}

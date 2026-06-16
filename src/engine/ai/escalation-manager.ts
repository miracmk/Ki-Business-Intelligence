/**
 * Escalation Manager — YFZ 22
 *
 * When Entity AI pipeline confidence is low or user requests human,
 * creates a support ticket and notifies available agents.
 */

import { db }    from '../../lib/db.js'
import { nanoid } from 'nanoid'
import {
  kibiSupportTickets, kibiSupportAgents, kibiEntityUsers, users,
} from '../../../db/schema.js'
import { eq, and } from 'drizzle-orm'

export interface EscalationRequest {
  entityId:   string
  userId:     string
  sessionId:  string
  reason:     'low_confidence' | 'user_request' | 'pipeline_failure' | 'complex_issue'
  summary:    string
  lastMessage: string
}

export interface EscalationResult {
  ticketId:     string
  ticketNumber: string
  assignedAgent?: { id: string; name: string } | null
  message:      string
}

export async function escalateToHuman(req: EscalationRequest): Promise<EscalationResult> {
  const ticketNumber = `TKT-${nanoid(8).toUpperCase()}`

  const reasonLabels: Record<EscalationRequest['reason'], string> = {
    low_confidence:  'AI güveni düşük',
    user_request:    'Kullanıcı insan desteği istedi',
    pipeline_failure: 'AI pipeline hatası',
    complex_issue:   'Karmaşık sorun tespit edildi',
  }

  const [ticket] = await db.insert(kibiSupportTickets).values({
    ticketNumber,
    entityId:        req.entityId,
    userId:          req.userId,
    clientId:        req.entityId,
    serviceCategory: 'ai_escalation',
    subject:         `AI Yönlendirme: ${reasonLabels[req.reason]}`,
    status:          'open',
    priority:        req.reason === 'pipeline_failure' ? 'high' : 'medium',
    contactChannel:  'ai_chat',
    openedAt:        new Date(),
    externalContactId: req.sessionId,
  }).returning()

  // Find available agent to assign
  let assignedAgent: EscalationResult['assignedAgent'] = null
  try {
    const agents = await db.query.kibiSupportAgents.findMany({
      where: (t, { eq, and }) => and(
        eq(t.entityId, req.entityId),
        eq(t.isActive, true),
      ),
      orderBy: (t, { asc }) => [asc(t.assignedCount)],
      limit: 1,
    })

    if (agents[0]) {
      const agentUser = await db.query.users.findFirst({
        where: (t, { eq }) => eq(t.id, agents[0].userId),
        columns: { id: true, name: true },
      })
      if (agentUser) {
        assignedAgent = { id: agentUser.id, name: agentUser.name ?? 'Destek Ekibi' }
        await db.update(kibiSupportTickets)
          .set({ assignedAgentId: agentUser.id })
          .where(eq(kibiSupportTickets.id, ticket.id))
        await db.update(kibiSupportAgents)
          .set({ assignedCount: agents[0].assignedCount + 1 })
          .where(eq(kibiSupportAgents.id, agents[0].id))
      }
    }
  } catch { /* assignment is non-fatal */ }

  const message = assignedAgent
    ? `Talebiniz ${assignedAgent.name}'e iletildi. Destek numaranız: ${ticketNumber}`
    : `Talebiniz destek ekibine iletildi. Destek numaranız: ${ticketNumber}`

  return { ticketId: ticket.id, ticketNumber, assignedAgent, message }
}

/** Check if session should auto-escalate based on confidence */
export function shouldEscalate(confidence: number, reason?: string): boolean {
  if (reason?.toLowerCase().includes('insan') || reason?.toLowerCase().includes('temsilci')) return true
  return confidence < 40
}

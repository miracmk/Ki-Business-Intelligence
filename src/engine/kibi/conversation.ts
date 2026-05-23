import { analyzeConversationHistory } from './redis-search.js'
import { extractIntent } from './intent-extractor.js'
import { runAgent, AgentInput, AgentOutput } from '../ai/agent.js'
import { db } from '../../lib/db.js'
import { kibiEntities, kibiTokenUsage } from '../../../db/schema.js'
import { eq } from 'drizzle-orm'

export interface KibiConversationInput extends AgentInput {
  entityContext?: Record<string, unknown>
}

export async function runKibiConversation(input: KibiConversationInput): Promise<AgentOutput> {
  const history = await analyzeConversationHistory({ sessionKey: input.sessionId, entityId: input.entityContext?.['entityId'] as string | undefined })
  const intent = await extractIntent({ message: input.userMessage, entityId: input.entityContext?.['entityId'] as string | undefined })

  const output = await runAgent(input)

  try {
    await db.insert(kibiTokenUsage).values({
      entityId: input.entityContext?.['entityId'] as string | undefined,
      userId: input.tenantId,
      modelName: output.usedModel ?? 'unknown',
      provider: 'openrouter',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: '0',
      modelRole: 'conversation',
    })
  } catch (error) {
    console.warn('Kibi token usage kayıt hatası:', error)
  }

  if (input.entityContext?.['entityId']) {
    await db.update(kibiEntities).set({
      mood: intent.mood,
      lastContactAt: new Date(),
    }).where(eq(kibiEntities.entityId, input.entityContext['entityId'] as string))
  }

  return output
}

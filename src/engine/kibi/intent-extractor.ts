import { defaultGateway } from '../ai/gateway.js'
import { getModelChain, KibiModelRole } from './models.js'

export interface IntentResult {
  intent: 'support' | 'feature_request' | 'billing' | 'general' | 'sales' | 'complaint'
  mood: 'calm' | 'frustrated' | 'angry' | 'urgent' | 'happy'
  urgency: number
  summary: string
  suggestedPriority: 'low' | 'medium' | 'high' | 'urgent'
  recommendedTone: string
}

export async function extractIntent(input: { message: string; entityId?: string; history?: string[] }): Promise<IntentResult> {
  const chain = await getModelChain('support_intent', input.entityId)
  const systemPrompt = `Sen bir intent ve mood analiz uzmanısın. Verilen mesajı analiz et ve JSON döndür. Kesinlikle sadece JSON döndür, başka hiçbir şey yazma.`
  const historyText = input.history?.slice(-10).join('\n') ?? ''
  const userMessage = `Mesaj:\n${input.message}\n\nTarihçe:\n${historyText}`

  const result = await defaultGateway.completeWithFallback([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ], chain, {
    temperature: 0.2,
    maxTokens: 500,
  })

  try {
    const parsed = JSON.parse(result.content || '{}')
    return {
      intent: parsed.intent ?? 'general',
      mood: parsed.mood ?? 'calm',
      urgency: Number(parsed.urgency) || 1,
      summary: String(parsed.summary ?? '').slice(0, 100),
      suggestedPriority: parsed.suggestedPriority ?? 'medium',
      recommendedTone: parsed.recommendedTone ?? 'normal',
    }
  } catch (error) {
    return {
      intent: 'general',
      mood: 'calm',
      urgency: 1,
      summary: input.message.slice(0, 100),
      suggestedPriority: 'medium',
      recommendedTone: 'normal',
    }
  }
}

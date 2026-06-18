/**
 * Entity AI Agent Pipeline — YFZ 22
 *
 * E-1 → Intent Analysis
 * E-2.1.x → Support sub-pipeline
 * E-2.2.x → Sales sub-pipeline
 * E-3     → General / Master conversation
 */

import { aiComplete, type Message }    from './gateway.js'
import { getModelForRole }              from './model-config.js'
import { vectorSearch }                 from '../../lib/qdrant.js'
import { db }                           from '../../lib/db.js'
import {
  aiSessions, aiMessages, aiPipelineLogs, kibiEntities,
} from '../../../db/schema.js'
import { eq, asc, sql }                 from 'drizzle-orm'

// ─── Types ───────────────────────────────────────────────────────────────────

export type EntityIntent = 'support' | 'sales' | 'general'

export interface EntityAgentInput {
  entityId:   string
  tenantId:   string
  userId:     string
  sessionId:  string
  message:    string
  channel:    string
  firstName?: string | null
  lastName?:  string | null
  entityName?: string
}

export interface EntityAgentOutput {
  response:    string
  intent:      EntityIntent
  sessionId:   string
  confidence:  number
  escalated:   boolean
  usedModels:  string[]
}

interface IntentResult {
  intent:     EntityIntent
  confidence: number
  summary:    string
}

interface SupportAnalysis {
  problemCategory: string
  severity:        'low' | 'medium' | 'high'
  knownIssue:      boolean
  requiresHuman:   boolean
}

interface SalesAnalysis {
  productInterest: string
  buyingSignal:    'low' | 'medium' | 'high'
  objections:      string[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isUUID(s: string | null | undefined): boolean {
  return !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

async function completeWithRole(
  role: Parameters<typeof getModelForRole>[0],
  messages: Message[],
  tenantId: string,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<{ content: string; usedModel: string }> {
  const { primary, fallbacks } = await getModelForRole(role, 'entity', tenantId)
  const chain = [primary, ...fallbacks].filter(Boolean)

  for (const modelStr of chain) {
    try {
      const norm = modelStr.includes('::') ? modelStr : `openrouter::${modelStr}`
      const res  = await aiComplete(norm, messages, tenantId, opts)
      return { content: res.content, usedModel: res.usedModel }
    } catch (e: any) {
      console.warn(`[ENTITY-AGENT] ${role} model ${modelStr} failed:`, e.message)
    }
  }
  throw new Error(`All models failed for role ${role}`)
}

async function logPipelineStep(params: {
  entityId: string
  sessionId: string
  role:      string
  model:     string
  startMs:   number
  success:   boolean
  error?:    string
  confidence?: number
  escalated?:  boolean
}) {
  try {
    await db.insert(aiPipelineLogs).values({
      entityId:        params.entityId,
      sessionId:       params.sessionId,
      pipelineType:    'entity',
      modelRole:       params.role,
      modelUsed:       params.model,
      latencyMs:       Date.now() - params.startMs,
      success:         params.success,
      errorMessage:    params.error ?? null,
      confidenceScore: params.confidence ?? null,
      escalated:       params.escalated ?? false,
    })
  } catch { /* non-fatal */ }
}

// ─── E-1: Intent Analysis ─────────────────────────────────────────────────────

async function analyzeIntent(
  message: string,
  history: Message[],
  tenantId: string,
): Promise<IntentResult> {
  const start = Date.now()
  const systemPrompt = `Sen bir intent analiz motorusun. Kullanıcı mesajını analiz et ve JSON döndür.
Yanıt SADECE JSON olmalı, başka metin olmamalı.
Format: {"intent":"support"|"sales"|"general","confidence":0-100,"summary":"kısa açıklama"}

- support: teknik sorun, şikayet, destek talebi, hata bildirimi
- sales: ürün satın alma, fiyat sorgulama, demo talebi, teklif isteme
- general: bilgi alma, genel sohbet, durum sorgulama, selamlama`

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-4),
    { role: 'user', content: message },
  ]

  let result: IntentResult = { intent: 'general', confidence: 60, summary: 'Genel mesaj' }
  let usedModel = 'fallback'

  try {
    const { content, usedModel: m } = await completeWithRole('intent_analysis', messages, tenantId, {
      temperature: 0.1, maxTokens: 200,
    })
    usedModel = m
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      result = {
        intent:     (['support', 'sales', 'general'].includes(parsed.intent)) ? parsed.intent : 'general',
        confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 60)),
        summary:    parsed.summary || '',
      }
    }
    await logPipelineStep({ entityId: tenantId, sessionId: '', role: 'intent_analysis', model: usedModel, startMs: start, success: true, confidence: result.confidence })
  } catch (e: any) {
    await logPipelineStep({ entityId: tenantId, sessionId: '', role: 'intent_analysis', model: usedModel, startMs: start, success: false, error: e.message })
  }

  return result
}

// ─── E-2.1: Support Sub-Pipeline ─────────────────────────────────────────────

async function runSupportPipeline(
  input: EntityAgentInput,
  history: Message[],
): Promise<{ response: string; escalated: boolean; confidence: number; usedModels: string[] }> {
  const usedModels: string[] = []
  let escalated  = false
  let confidence = 75

  // E-2.1.1 Problem identification
  const probStart = Date.now()
  let analysis: SupportAnalysis = { problemCategory: 'general', severity: 'medium', knownIssue: false, requiresHuman: false }
  let probModel = 'fallback'

  try {
    const { content, usedModel } = await completeWithRole('support_problem', [
      { role: 'system', content: `Kullanıcının destek sorununu analiz et. SADECE JSON döndür.
Format: {"problemCategory":"kategori","severity":"low|medium|high","knownIssue":true/false,"requiresHuman":true/false}
- requiresHuman: true → çok karmaşık, yasal, finansal kriz, kullanıcı ısrarcı` },
      ...history.slice(-4),
      { role: 'user', content: input.message },
    ], input.tenantId, { temperature: 0.1, maxTokens: 300 })
    probModel = usedModel
    usedModels.push(usedModel)
    const m = content.match(/\{[\s\S]*\}/)
    if (m) analysis = { ...analysis, ...JSON.parse(m[0]) }
    await logPipelineStep({ entityId: input.entityId, sessionId: input.sessionId, role: 'support_problem', model: usedModel, startMs: probStart, success: true })
  } catch (e: any) {
    await logPipelineStep({ entityId: input.entityId, sessionId: input.sessionId, role: 'support_problem', model: probModel, startMs: probStart, success: false, error: e.message })
  }

  if (analysis.requiresHuman) escalated = true

  // E-2.1.2 KB vector search
  let kbContext = ''
  try {
    const hits = await vectorSearch(`entity_${input.entityId}`, `${input.message} ${analysis.problemCategory}`, 3)
    if (hits?.length) {
      kbContext = hits.map((h: any) => h.payload?.content || h.payload?.text || '').filter(Boolean).join('\n---\n')
    }
  } catch { /* qdrant might not have entity collection yet */ }

  // E-2.1.3 Solution synthesis
  const solStart  = Date.now()
  let solution    = ''
  let solModel    = 'fallback'
  let solConfidence = confidence

  try {
    const { content, usedModel } = await completeWithRole('support_solution', [
      {
        role: 'system',
        content: `Sen bir destek uzmanısın. Kullanıcının sorununa çözüm üret.
${kbContext ? `\nBilgi Tabanı:\n${kbContext}` : ''}
SADECE JSON döndür: {"solution":"çözüm adımları","confidence":0-100,"requiresEscalation":true/false}`,
      },
      { role: 'user', content: `Sorun: ${input.message}\nKategori: ${analysis.problemCategory}` },
    ], input.tenantId, { temperature: 0.2, maxTokens: 500 })
    solModel = usedModel
    usedModels.push(usedModel)
    const m = content.match(/\{[\s\S]*\}/)
    if (m) {
      const parsed = JSON.parse(m[0])
      solution      = parsed.solution || ''
      solConfidence = Math.min(100, Number(parsed.confidence) || 70)
      if (parsed.requiresEscalation) escalated = true
    }
    confidence = solConfidence
    await logPipelineStep({ entityId: input.entityId, sessionId: input.sessionId, role: 'support_solution', model: usedModel, startMs: solStart, success: true, confidence: solConfidence })
  } catch (e: any) {
    await logPipelineStep({ entityId: input.entityId, sessionId: input.sessionId, role: 'support_solution', model: solModel, startMs: solStart, success: false, error: e.message })
  }

  // E-2.1.4 Response generation
  const genStart  = Date.now()
  let response    = ''
  let genModel    = 'fallback'
  const name      = [input.firstName, input.lastName].filter(Boolean).join(' ') || 'Müşteri'

  try {
    const { content, usedModel } = await completeWithRole('support_generator', [
      {
        role: 'system',
        content: `Müşteri destek temsilcisisin. Müşteriye samimi ve yardımsever bir yanıt yaz.
Müşteri adı: ${name}
Entity: ${input.entityName || ''}
${escalated ? 'NOT: Bu sorun insan temsilciye yönlendirilecek, bunu müşteriye nazikçe bildir.' : ''}
Kısa ve net ol. Türkçe yaz. Markdown kullanma.`,
      },
      ...history.slice(-6),
      { role: 'user', content: input.message },
      ...(solution ? [{ role: 'assistant' as const, content: `Çözüm: ${solution}` }] : []),
    ], input.tenantId, { temperature: 0.4, maxTokens: 600 })
    genModel = usedModel
    usedModels.push(usedModel)
    response = content
    await logPipelineStep({ entityId: input.entityId, sessionId: input.sessionId, role: 'support_generator', model: usedModel, startMs: genStart, success: true, confidence, escalated })
  } catch (e: any) {
    response = 'Şu anda destek veremiyorum, lütfen daha sonra tekrar deneyin.'
    await logPipelineStep({ entityId: input.entityId, sessionId: input.sessionId, role: 'support_generator', model: genModel, startMs: genStart, success: false, error: e.message })
  }

  return { response, escalated, confidence, usedModels }
}

// ─── E-2.2: Sales Sub-Pipeline ────────────────────────────────────────────────

async function runSalesPipeline(
  input: EntityAgentInput,
  history: Message[],
): Promise<{ response: string; escalated: boolean; confidence: number; usedModels: string[] }> {
  const usedModels: string[] = []

  // E-2.2.1 Sales intent
  let salesAnalysis: SalesAnalysis = { productInterest: '', buyingSignal: 'low', objections: [] }
  const intentStart = Date.now()
  let intentModel   = 'fallback'

  try {
    const { content, usedModel } = await completeWithRole('sales_intent', [
      {
        role: 'system',
        content: `Satış intent analiz et. SADECE JSON döndür.
Format: {"productInterest":"ilgilendiği ürün","buyingSignal":"low|medium|high","objections":["itiraz1"]}`,
      },
      { role: 'user', content: input.message },
    ], input.tenantId, { temperature: 0.1, maxTokens: 300 })
    intentModel = usedModel
    usedModels.push(usedModel)
    const m = content.match(/\{[\s\S]*\}/)
    if (m) salesAnalysis = { ...salesAnalysis, ...JSON.parse(m[0]) }
    await logPipelineStep({ entityId: input.entityId, sessionId: input.sessionId, role: 'sales_intent', model: usedModel, startMs: intentStart, success: true })
  } catch (e: any) {
    await logPipelineStep({ entityId: input.entityId, sessionId: input.sessionId, role: 'sales_intent', model: intentModel, startMs: intentStart, success: false, error: e.message })
  }

  // E-2.2.2 Sales conversation
  const convStart = Date.now()
  let response    = ''
  let convModel   = 'fallback'
  const name      = [input.firstName, input.lastName].filter(Boolean).join(' ') || 'Müşteri'

  try {
    const { content, usedModel } = await completeWithRole('sales_conversation', [
      {
        role: 'system',
        content: `Sen satış danışmanısın. Müşteriyle samimi bir satış konuşması yap.
Müşteri: ${name}
İlgilendiği ürün: ${salesAnalysis.productInterest || 'belirsiz'}
Satın alma sinyali: ${salesAnalysis.buyingSignal}
İtirazlar: ${salesAnalysis.objections.join(', ') || 'yok'}
Türkçe, kısa, ikna edici. Markdown kullanma.`,
      },
      ...history.slice(-6),
      { role: 'user', content: input.message },
    ], input.tenantId, { temperature: 0.5, maxTokens: 600 })
    convModel = usedModel
    usedModels.push(usedModel)
    response = content
    await logPipelineStep({ entityId: input.entityId, sessionId: input.sessionId, role: 'sales_conversation', model: usedModel, startMs: convStart, success: true })
  } catch (e: any) {
    response = 'Size en uygun çözümü sunmak için ekibimiz size ulaşacak.'
    await logPipelineStep({ entityId: input.entityId, sessionId: input.sessionId, role: 'sales_conversation', model: convModel, startMs: convStart, success: false, error: e.message })
  }

  return { response, escalated: false, confidence: 80, usedModels }
}

// ─── E-3: Master Conversation ────────────────────────────────────────────────

async function runMasterConversation(
  input: EntityAgentInput,
  history: Message[],
): Promise<{ response: string; usedModel: string }> {
  const name = [input.firstName, input.lastName].filter(Boolean).join(' ') || 'Müşteri'

  const { content, usedModel } = await completeWithRole('master_conversation', [
    {
      role: 'system',
      content: `Sen ${input.entityName || 'şirketin'} AI asistanısın. Kullanıcıya yardımcı ol.
Kullanıcı: ${name}
Kanal: ${input.channel}
Türkçe, yardımsever, kısa yanıtlar ver. Markdown kullanma.`,
    },
    ...history.slice(-8),
    { role: 'user', content: input.message },
  ], input.tenantId, { temperature: 0.5, maxTokens: 800 })

  return { response: content, usedModel }
}

// ─── Session helpers ──────────────────────────────────────────────────────────

async function loadHistory(sessionId: string): Promise<Message[]> {
  if (!isUUID(sessionId)) return []
  try {
    const msgs = await db.query.aiMessages.findMany({
      where:   (t, { eq }) => eq(t.sessionId, sessionId),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
      limit:   20,
    })
    return msgs.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
  } catch { return [] }
}

async function persistMessages(
  sessionId: string,
  userMsg:   string,
  asstMsg:   string,
  usedModel: string,
) {
  if (!isUUID(sessionId)) return
  try {
    await db.insert(aiMessages).values([
      { sessionId, role: 'user',      content: userMsg, modelName: usedModel },
      { sessionId, role: 'assistant', content: asstMsg, modelName: usedModel },
    ])
    await db.update(aiSessions)
      .set({ messageCount: sql`message_count + 2`, lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(aiSessions.id, sessionId))
  } catch (e) {
    console.error('[ENTITY-AGENT] persist failed:', e)
  }
}

// ─── Main Pipeline ────────────────────────────────────────────────────────────

export async function runEntityAgent(input: EntityAgentInput): Promise<EntityAgentOutput> {
  const history = await loadHistory(input.sessionId)

  // E-1: Intent
  const intentResult = await analyzeIntent(input.message, history, input.tenantId)
  console.log(`[ENTITY-AGENT] Intent: ${intentResult.intent} (${intentResult.confidence}%)`)

  let response   = ''
  let escalated  = false
  let confidence = intentResult.confidence
  let usedModels: string[] = []

  try {
    if (intentResult.intent === 'support') {
      const result = await runSupportPipeline(input, history)
      response   = result.response
      escalated  = result.escalated
      confidence = result.confidence
      usedModels = result.usedModels
    } else if (intentResult.intent === 'sales') {
      const result = await runSalesPipeline(input, history)
      response   = result.response
      escalated  = result.escalated
      confidence = result.confidence
      usedModels = result.usedModels
    } else {
      const result = await runMasterConversation(input, history)
      response   = result.response
      usedModels = [result.usedModel]
    }
  } catch (e: any) {
    console.error('[ENTITY-AGENT] Pipeline failed:', e)
    response = 'Şu anda yanıt veremiyorum, lütfen kısa süre sonra tekrar deneyin.'
    escalated = true
  }

  // Persist
  const lastModel = usedModels[usedModels.length - 1] ?? 'unknown'
  await persistMessages(input.sessionId, input.message, response, lastModel)

  return {
    response,
    intent:     intentResult.intent,
    sessionId:  input.sessionId,
    confidence,
    escalated,
    usedModels,
  }
}

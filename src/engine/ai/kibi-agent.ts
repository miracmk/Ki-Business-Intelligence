/**
 * KIBI AI Agent Pipeline — YFZ 23
 *
 * K-1 → Intent (support | sales | consulting | general)
 * K-2.1.x → KIBI Platform Support
 * K-2.2.x → KIBI Sales (kayıt olmak isteyen)
 * K-2.3.x → Danışman Pipeline
 * K-3     → Master AI (marka tonu)
 */

import { aiComplete, type Message }  from './gateway.js'
import { getModelForRole }            from './model-config.js'
import { logPipelineStep }            from './pipeline-logger.js'
import { vectorSearch }               from '../../lib/qdrant.js'
import { KIBI_AI_KB_COLLECTION }      from '../knowledge/indexer.js'
import type {
  KibiPipelineContext, KibiIntentResult,
  ConsultingIntentResult, ConsultingRecommendationResult,
} from './types/kibi-agent.types.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function completeWithRole(
  role: Parameters<typeof getModelForRole>[0],
  messages: Message[],
  tenantId?: string,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<{ content: string; usedModel: string }> {
  const { primary, fallbacks } = await getModelForRole(role, 'platform', tenantId)
  const chain = [primary, ...fallbacks].filter(Boolean)

  for (const modelStr of chain) {
    try {
      const norm = modelStr.includes('::') ? modelStr : `openrouter::${modelStr}`
      const res  = await aiComplete(norm, messages, tenantId ?? null, opts)
      return { content: res.content, usedModel: res.usedModel }
    } catch (e: any) {
      console.warn(`[KIBI-AGENT] ${role} model ${modelStr} failed:`, e.message)
    }
  }
  throw new Error(`All models failed for role ${role}`)
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    const m = raw.match(/\{[\s\S]*\}/)
    return m ? JSON.parse(m[0]) : fallback
  } catch { return fallback }
}

// ─── K-1: Intent ────────────────────────────────────────────────────────────

async function analyzeKibiIntent(ctx: KibiPipelineContext): Promise<KibiIntentResult> {
  const start = Date.now()
  const messages: Message[] = [
    {
      role: 'system',
      content: `KIBI Platform için intent analizi yapıyorsun. SADECE JSON döndür.
Format: {"intent":"support|sales|consulting|general","language":"tr|en","confidence":0-100,"summary":"1-2 cümle","is_new_topic":true|false}
- support: KIBI platform hatası/sorunu
- sales: KIBI'ye kayıt, fiyat, demo talebi
- consulting: iş danışmanlığı, strateji, sektörel öneri
- general: diğer sorular, selamlama`,
    },
    ...ctx.history.slice(-3).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: ctx.message },
  ]

  const fallback: KibiIntentResult = { intent: 'general', language: 'tr', confidence: 60, summary: ctx.message, is_new_topic: true }

  try {
    const { content, usedModel } = await completeWithRole('intent_analysis', messages, ctx.tenantId, { temperature: 0.1, maxTokens: 200 })
    const result = { ...fallback, ...parseJson<KibiIntentResult>(content, fallback) }
    await logPipelineStep({ pipelineType: 'platform', modelRole: 'intent_analysis', modelUsed: usedModel, latencyMs: Date.now() - start, success: true })
    return result
  } catch (e: any) {
    await logPipelineStep({ pipelineType: 'platform', modelRole: 'intent_analysis', modelUsed: 'fallback', latencyMs: Date.now() - start, success: false, errorMessage: e.message })
    return fallback
  }
}

// ─── K-2.3.1: Consulting Intent ──────────────────────────────────────────────

async function analyzeConsultingIntent(ctx: KibiPipelineContext): Promise<ConsultingIntentResult> {
  const start = Date.now()
  const fallback: ConsultingIntentResult = {
    consulting_topic: ctx.message,
    topic_category: 'other',
    data_needed: [],
    kb_keywords: [ctx.message],
    web_search_needed: true,
    entity_profile_needed: false,
  }

  try {
    const { content, usedModel } = await completeWithRole('consulting_intent', [
      {
        role: 'system',
        content: `Danışmanlık konusunu sınıflandır. SADECE JSON döndür.
Format: {"consulting_topic":"spesifik başlık","topic_category":"growth_strategy|operational_efficiency|competitive_analysis|pricing|market_entry|financial_optimization|digital_transformation|customer_acquisition|other","data_needed":["..."],"kb_keywords":["..."],"web_search_needed":true,"entity_profile_needed":true}`,
      },
      { role: 'user', content: `Mesaj: "${ctx.message}"\nGeçmiş: ${JSON.stringify(ctx.history.slice(-4))}` },
    ], ctx.tenantId, { temperature: 0.1, maxTokens: 500 })
    await logPipelineStep({ pipelineType: 'platform', modelRole: 'consulting_intent', modelUsed: usedModel, latencyMs: Date.now() - start, success: true })
    return { ...fallback, ...parseJson<ConsultingIntentResult>(content, fallback) }
  } catch (e: any) {
    await logPipelineStep({ pipelineType: 'platform', modelRole: 'consulting_intent', modelUsed: 'fallback', latencyMs: Date.now() - start, success: false, errorMessage: e.message })
    return fallback
  }
}

// ─── K-2.3.2: Consulting Recommendation ─────────────────────────────────────

async function generateConsultingRecommendation(
  ctx: KibiPipelineContext,
  intent: ConsultingIntentResult,
): Promise<ConsultingRecommendationResult> {
  const start = Date.now()

  // Search KIBI AI KB — audience filter: registered entity (tenantId set) → kibi_customer content,
  // anonymous/ecosystem visitor → ecosystem_customer content; 'both'-tagged docs always match.
  let kbContext = ''
  try {
    const audienceTag = ctx.tenantId ? 'kibi_customer' : 'ecosystem_customer'
    const filter = { should: [{ key: 'tags', match: { value: 'both' } }, { key: 'tags', match: { value: audienceTag } }] }
    const hits = await vectorSearch(KIBI_AI_KB_COLLECTION, intent.kb_keywords.join(' '), 5, filter)
    if (hits?.length) {
      kbContext = hits.map((h: any) => h.payload?.content || h.payload?.text || '').filter(Boolean).join('\n---\n')
    }
  } catch { /* collection may not exist yet */ }

  const fallback: ConsultingRecommendationResult = {
    advice: '',
    context_summary: '',
    data_sources: ['kb'],
    confidence_level: 'medium',
  }

  try {
    const { content, usedModel } = await completeWithRole('consulting_recommendation', [
      {
        role: 'system',
        content: `KIBI AI Danışman Motorusun. KB verisini, entity profilini ve web bağlamını kullanarak somut, uygulanabilir öneriler üret. SADECE JSON döndür.
Format: {"advice":"yanıt metni","context_summary":"neden bu öneri","data_sources":["kb","web","entity_profile"],"confidence_level":"high|medium|low","follow_up_questions":["soru"]}`,
      },
      {
        role: 'user',
        content: `Danışma konusu: ${JSON.stringify(intent)}
KB Verisi: ${kbContext || 'yok'}
Entity profili: ${JSON.stringify(ctx.entityProfile || {})}
Mesaj: "${ctx.message}"`,
      },
    ], ctx.tenantId, { temperature: 0.4, maxTokens: 2000 })
    await logPipelineStep({ pipelineType: 'platform', modelRole: 'consulting_recommendation', modelUsed: usedModel, latencyMs: Date.now() - start, success: true })
    return { ...fallback, ...parseJson<ConsultingRecommendationResult>(content, fallback) }
  } catch (e: any) {
    await logPipelineStep({ pipelineType: 'platform', modelRole: 'consulting_recommendation', modelUsed: 'fallback', latencyMs: Date.now() - start, success: false, errorMessage: e.message })
    return fallback
  }
}

// ─── K-2.2: KIBI Sales ───────────────────────────────────────────────────────

async function runKibiSalesPipeline(ctx: KibiPipelineContext): Promise<string> {
  const start = Date.now()
  try {
    const { content, usedModel } = await completeWithRole('sales_conversation', [
      {
        role: 'system',
        content: `KIBI iş zekası platformunu satıyorsun. Potansiyel müşteriye yardımcı ol.
Türkçe, kurumsal ama sıcak ton. Ürün özellikleri, fiyatlandırma, demo konularında bilgi ver.
Direkt yanıt yaz — JSON değil.`,
      },
      ...ctx.history.slice(-6).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user', content: ctx.message },
    ], ctx.tenantId, { temperature: 0.4, maxTokens: 800 })
    await logPipelineStep({ pipelineType: 'platform', modelRole: 'sales_conversation', modelUsed: usedModel, latencyMs: Date.now() - start, success: true })
    return content
  } catch {
    return 'KIBI platformumuz hakkında bilgi almak için ekibimizle iletişime geçebilirsiniz.'
  }
}

// ─── K-2.1: KIBI Platform Support ───────────────────────────────────────────

async function runKibiSupportPipeline(ctx: KibiPipelineContext): Promise<string> {
  const start = Date.now()

  let kbContext = ''
  try {
    const hits = await vectorSearch('ki_platform_knowledge', ctx.message, 3)
    if (hits?.length) kbContext = hits.map((h: any) => h.payload?.content || '').filter(Boolean).join('\n---\n')
  } catch { /* ok */ }

  try {
    const { content, usedModel } = await completeWithRole('support_solution', [
      {
        role: 'system',
        content: `KIBI platform destek asistanısın. ${kbContext ? `\nBilgi Tabanı:\n${kbContext}` : ''}
Türkçe, yardımsever yanıtlar. Direkt metin döndür.`,
      },
      ...ctx.history.slice(-6).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user', content: ctx.message },
    ], ctx.tenantId, { temperature: 0.3, maxTokens: 1000 })
    await logPipelineStep({ pipelineType: 'platform', modelRole: 'support_solution', modelUsed: usedModel, latencyMs: Date.now() - start, success: true })
    return content
  } catch {
    return 'KIBI destek ekibimize ulaşmak için kibusiness.global@gmail.com adresine yazabilirsiniz.'
  }
}

// ─── K-3: Master AI ──────────────────────────────────────────────────────────

async function runKibiMasterAI(ctx: KibiPipelineContext, pipelineContent: string, intent: string): Promise<string> {
  const start = Date.now()
  if (!pipelineContent && intent !== 'general') return pipelineContent

  try {
    const { content, usedModel } = await completeWithRole('master_conversation', [
      {
        role: 'system',
        content: `Ki Business AI asistanısın. ${pipelineContent ? 'Verilen içeriği marka tonuyla düzenle. Yeni bilgi ekleme.' : 'Kullanıcıya yardımcı ol.'}
Türkçe, kurumsal ama samimi ton. Kısa ve net yanıtlar.`,
      },
      ...ctx.history.slice(-4).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user', content: pipelineContent ? `Düzenlenecek: "${pipelineContent}"\nKullanıcı: "${ctx.message}"` : ctx.message },
    ], ctx.tenantId, { temperature: 0.4, maxTokens: 1500 })
    await logPipelineStep({ pipelineType: 'platform', modelRole: 'master_conversation', modelUsed: usedModel, latencyMs: Date.now() - start, success: true })
    return content
  } catch {
    return pipelineContent || 'Şu anda yanıt veremiyorum.'
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function runKibiAgent(ctx: KibiPipelineContext): Promise<{
  response:  string
  intent:    string
  sessionId: string
}> {
  const intentResult = await analyzeKibiIntent(ctx)
  ctx.intentResult = intentResult

  let pipelineContent = ''

  if (intentResult.intent === 'support') {
    pipelineContent = await runKibiSupportPipeline(ctx)
  } else if (intentResult.intent === 'sales') {
    pipelineContent = await runKibiSalesPipeline(ctx)
  } else if (intentResult.intent === 'consulting') {
    const consultIntent = await analyzeConsultingIntent(ctx)
    const recommendation = await generateConsultingRecommendation(ctx, consultIntent)
    pipelineContent = recommendation.advice
  }

  const finalResponse = await runKibiMasterAI(ctx, pipelineContent, intentResult.intent)

  return { response: finalResponse, intent: intentResult.intent, sessionId: ctx.sessionKey }
}

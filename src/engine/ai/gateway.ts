/**
 * AI Gateway — multi-provider routing
 *
 * Legacy API (AiGateway class): used by agent.ts, unchanged.
 *
 * New API (aiComplete function): priority-based key routing
 *   Priority C → B → A:
 *     C. Entity own key (ai_configs.settings.providerKeys[provider])
 *     B. Platform entity_free key (platform_configs ai_provider_entity_free_{provider})
 *     A. Platform kibi key (platform_configs ai_provider_kibi_{provider})
 *   kibi_free::default → force entity_free scope
 *   no tenantId → force kibi scope (platform admin)
 *
 * Key cache: 5 min in-memory. Timeout: 15s per request.
 * Anthropic: x-api-key header + /v1/messages endpoint.
 * Google: OpenAI-compat base URL.
 */

import { env } from '../../../config/env.js'
import { db } from '../../lib/db.js'
import { platformConfigs, aiConfigs, kibiModelConfigs } from '../../../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { decrypt, encrypt } from '../../lib/crypto.js'
import { PROVIDERS, getConfigKey, parseModelString, KIBI_FREE_MODEL, type ProviderDef } from './providers.js'

export type Provider = 'openrouter' | 'openai' | 'anthropic' | 'google' | 'mistral' | 'groq'

export interface Message {
  role:    'system' | 'user' | 'assistant'
  content: string
}

export interface CompletionOptions {
  model?:       string
  temperature?: number
  maxTokens?:   number
  tools?:       AiTool[]
}

export interface AiTool {
  name:        string
  description: string
  parameters:  Record<string, unknown>
}

export interface CompletionResult {
  content:    string
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>
  usage?:     { prompt: number; completion: number }
}

// ── Default free-tier model catalogues ───────────────────────────────────────

/** DB scanning, SQL generation, structured reasoning — Nemotron optimised */
export const ANALYSIS_MODELS: readonly string[] = [
  'nvidia/llama-3.1-nemotron-70b-instruct:free',   // primary  – best structured reasoning
  'google/gemini-2.0-flash-exp:free',               // fallback 1
  'meta-llama/llama-3.3-70b-instruct:free',         // fallback 2
]

/** Customer-facing natural language replies — Llama-3.3 (ex gpt-oss-120b) */
export const CONVERSATION_MODELS: readonly string[] = [
  'meta-llama/llama-3.3-70b-instruct:free',         // primary
  'google/gemini-2.0-flash-exp:free',               // fallback 1
  'google/gemini-flash-1.5:free',                   // fallback 2
]

/** Legacy alias kept for backward compat */
export const FREE_MODELS = {
  default:      CONVERSATION_MODELS[0],
  fast:         CONVERSATION_MODELS[0],
  smart:        ANALYSIS_MODELS[0],
  code:         ANALYSIS_MODELS[0],
  multilingual: CONVERSATION_MODELS[0],
} as const

// ── Provider base URLs ────────────────────────────────────────────────────────
const BASE_URLS: Record<Provider, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  openai:     'https://api.openai.com/v1',
  anthropic:  'https://api.anthropic.com/v1',
  google:     'https://generativelanguage.googleapis.com/v1beta/openai',
  mistral:    'https://api.mistral.ai/v1',
  groq:       'https://api.groq.com/openai/v1',
}

// ── Error codes that mean "this model is unavailable — try next" ─────────────
function isModelUnavailable(errMsg: string, status?: number): boolean {
  if (status === 503 || status === 404 || status === 529) return true
  const lower = errMsg.toLowerCase()
  return (
    lower.includes('model not found') ||
    lower.includes('model_not_found') ||
    lower.includes('overloaded') ||
    lower.includes('unavailable') ||
    lower.includes('no endpoint found') ||
    lower.includes('no available') ||
    lower.includes('provider error')
  )
}

// ── Gateway class ─────────────────────────────────────────────────────────────
export class AiGateway {
  private provider: Provider
  private apiKey:   string
  private baseUrl:  string

  constructor(opts?: { provider?: Provider; apiKey?: string; baseUrl?: string }) {
    this.provider = opts?.provider ?? 'openrouter'
    this.baseUrl  = opts?.baseUrl  ?? BASE_URLS[this.provider]
    this.apiKey   = opts?.apiKey   ?? env.OPENROUTER_API_KEY
  }

  // ── Single-model completion ───────────────────────────────────────────────
  async complete(messages: Message[], opts: CompletionOptions = {}): Promise<CompletionResult> {
    const model = opts.model ?? CONVERSATION_MODELS[0]
    console.log(`  [GATEWAY] Calling model: ${model}`)

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens:  opts.maxTokens ?? 1500,
    }

    if (opts.tools?.length) {
      body['tools'] = opts.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }))
      body['tool_choice'] = 'auto'
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method:  'POST',
      headers: this.headers(),
      body:    JSON.stringify(body),
    })

    if (res.ok) {
      const data = await res.json() as {
        choices: Array<{
          message: {
            content:     string | null
            tool_calls?: Array<{ function: { name: string; arguments: string } }>
          }
        }>
        usage?: { prompt_tokens: number; completion_tokens: number }
      }
      const msg = data.choices[0]?.message
      console.log(`  [GATEWAY] OK — model: ${model}`)
      return {
        content:   msg?.content ?? '',
        toolCalls: msg?.tool_calls?.map((tc) => ({
          name:      tc.function.name,
          arguments: JSON.parse(tc.function.arguments || '{}'),
        })),
        usage: data.usage
          ? { prompt: data.usage.prompt_tokens, completion: data.usage.completion_tokens }
          : undefined,
      }
    }

    const errText = await res.text()
    console.warn(`  [GATEWAY] ${model} → HTTP ${res.status}: ${errText.slice(0, 200)}`)
    const err = new Error(`AI error (${model}): HTTP ${res.status} — ${errText}`) as Error & { status: number }
    err.status = res.status
    throw err
  }

  // ── Fallback chain completion ─────────────────────────────────────────────
  async completeWithFallback(
    messages: Message[],
    modelList: string[],
    opts: Omit<CompletionOptions, 'model'> = {},
  ): Promise<CompletionResult & { usedModel: string }> {
    if (!modelList.length) {
      modelList = [...CONVERSATION_MODELS]
    }

    // Deduplicate while preserving order
    const models = [...new Set(modelList)]
    let lastError: Error | null = null

    for (const model of models) {
      try {
        const result = await this.complete(messages, { ...opts, model })
        return { ...result, usedModel: model }
      } catch (e: any) {
        lastError = e
        const unavail = isModelUnavailable(e.message || '', e.status)
        if (!unavail) throw e          // auth / quota issues → bubble up
        console.warn(`  [GATEWAY] ${model} unavailable, trying next in chain...`)
      }
    }

    throw lastError ?? new Error('All models in fallback chain failed')
  }

  // ── Streaming completion ──────────────────────────────────────────────────
  async *stream(messages: Message[], opts: CompletionOptions = {}): AsyncGenerator<string> {
    const model = opts.model ?? CONVERSATION_MODELS[0]

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method:  'POST',
      headers: this.headers(),
      body:    JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.4,
        max_tokens:  opts.maxTokens ?? 1500,
        stream:      true,
      }),
    })

    if (!res.ok || !res.body) throw new Error(`Stream error: ${res.status}`)

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of decoder.decode(value).split('\n')) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') return
        try {
          const chunk = JSON.parse(data) as { choices: Array<{ delta: { content?: string } }> }
          const text  = chunk.choices[0]?.delta?.content
          if (text) yield text
        } catch { /* malformed chunk */ }
      }
    }
  }

  // ── Fetch current free model list from OpenRouter ────────────────────────
  static async fetchFreeModels(apiKey: string): Promise<Array<{
    id: string; name: string; contextLength: number; description?: string
  }>> {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
    })
    if (!res.ok) throw new Error(`OpenRouter models API: ${res.status}`)

    const data = await res.json() as { data: Array<{
      id: string; name: string; context_length: number; description?: string
    }> }

    return data.data
      .filter((m) => m.id.endsWith(':free'))
      .map((m) => ({
        id:            m.id,
        name:          m.name,
        contextLength: m.context_length ?? 0,
        description:   m.description,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    }
    if (this.provider === 'openrouter') {
      h['HTTP-Referer'] = env.APP_URL
      h['X-Title']      = 'Ki Platform'
    }
    return h
  }
}

// ── Singletons ────────────────────────────────────────────────────────────────
export const defaultGateway = new AiGateway()

export function gatewayForTenant(config: {
  provider?: Provider
  apiKey?:   string | null
  model?:    string
}): AiGateway {
  if (config.apiKey) {
    return new AiGateway({ provider: config.provider ?? 'openrouter', apiKey: config.apiKey })
  }
  return defaultGateway
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW MULTI-PROVIDER ROUTING API
// ═══════════════════════════════════════════════════════════════════════════════

interface KeyCacheEntry { key: string; ts: number }
const keyCache = new Map<string, KeyCacheEntry>()
const KEY_TTL  = 5 * 60 * 1000  // 5 min

async function cachedPlatformKey(cacheKey: string, dbKey: string): Promise<string | null> {
  const hit = keyCache.get(cacheKey)
  if (hit && Date.now() - hit.ts < KEY_TTL) return hit.key

  try {
    const rows = await db.select().from(platformConfigs).where(eq(platformConfigs.key, dbKey))
    if (!rows.length || !rows[0].value) return null
    const plainKey = decrypt(rows[0].value)
    keyCache.set(cacheKey, { key: plainKey, ts: Date.now() })
    return plainKey
  } catch {
    return null
  }
}

/** Invalidate cached key after admin PUT/DELETE */
export function invalidateProviderKeyCache(dbKey?: string) {
  if (dbKey) {
    for (const [k] of keyCache) {
      if (k.includes(dbKey)) keyCache.delete(k)
    }
  } else {
    keyCache.clear()
  }
}

async function getKibiKey(providerId: string): Promise<string | null> {
  const configKey = getConfigKey(providerId, 'kibi')
  // Also try legacy openrouter_api_key for openrouter
  let key = await cachedPlatformKey(`kibi:${providerId}`, configKey)
  if (!key && providerId === 'openrouter') {
    key = await cachedPlatformKey('kibi:openrouter:legacy', 'openrouter_api_key')
    if (!key) key = env.OPENROUTER_API_KEY || null
  }
  return key
}

async function getEntityFreeKey(providerId: string): Promise<string | null> {
  return cachedPlatformKey(`entity_free:${providerId}`, getConfigKey(providerId, 'entity_free'))
}

async function getEntityOwnKey(providerId: string, tenantId: string): Promise<string | null> {
  try {
    const cacheKey = `entity_own:${tenantId}:${providerId}`
    const hit = keyCache.get(cacheKey)
    if (hit && Date.now() - hit.ts < KEY_TTL) return hit.key

    const config = await db.query.aiConfigs.findFirst({
      where: (t, { eq }) => eq(t.tenantId, tenantId),
    })
    if (!config) return null
    const providerKeys = (config.settings as any)?.providerKeys as Record<string, string> | undefined
    if (!providerKeys?.[providerId]) return null

    const plainKey = decrypt(providerKeys[providerId])
    keyCache.set(cacheKey, { key: plainKey, ts: Date.now() })
    return plainKey
  } catch {
    return null
  }
}

/** Resolve which model string to actually use for kibi_free::default */
async function resolveKibiFreeModel(): Promise<{ provider: string; model: string; apiKey: string } | null> {
  try {
    const roles = await db.select().from(kibiModelConfigs)
      .where(and(eq(kibiModelConfigs.scope, 'entity_free'), eq(kibiModelConfigs.modelRole, 'conversation' as any)))
    const row = roles[0]
    if (!row) return null

    const parsed = parseModelString(row.primaryModel)
    if (!parsed) return null

    const apiKey = await getEntityFreeKey(parsed.provider)
    if (!apiKey) return null

    return { provider: parsed.provider, model: parsed.model, apiKey }
  } catch {
    return null
  }
}

function buildProviderHeaders(providerDef: ProviderDef, apiKey: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...providerDef.extraHeaders }
  if (providerDef.authHeader === 'x-api-key') {
    h['x-api-key'] = apiKey
  } else {
    h['Authorization'] = `Bearer ${apiKey}`
  }
  if (providerDef.id === 'openrouter') {
    h['HTTP-Referer'] = env.APP_URL
    h['X-Title']      = 'Ki Platform'
  }
  return h
}

interface RoutedCompletionResult {
  content:     string
  usedModel:   string
  usedProvider: string
  toolCalls?:  Array<{ name: string; arguments: Record<string, unknown> }>
  usage?:      { prompt: number; completion: number }
}

/**
 * Complete a chat message using the multi-provider routing logic.
 *
 * @param modelStr  "provider::modelId" or "kibi_free::default"
 * @param messages  Chat messages
 * @param tenantId  Entity UUID (null/undefined for platform/admin context)
 * @param opts      Optional completion params
 */
export async function aiComplete(
  modelStr:  string,
  messages:  Message[],
  tenantId?: string | null,
  opts:      Omit<CompletionOptions, 'model'> = {},
): Promise<RoutedCompletionResult> {
  const isUUID = (s?: string | null) =>
    !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

  let resolvedProvider: string
  let resolvedModel:    string
  let resolvedKey:      string | null = null

  if (modelStr === KIBI_FREE_MODEL) {
    // Virtual: resolve entity_free scope model from kibi_model_configs
    const resolved = await resolveKibiFreeModel()
    if (!resolved) throw new Error('KIBI Free Tier: entity_free scope için provider yapılandırılmamış')
    resolvedProvider = resolved.provider
    resolvedModel    = resolved.model
    resolvedKey      = resolved.apiKey
  } else {
    const parsed = parseModelString(modelStr)
    if (!parsed) throw new Error(`Geçersiz model string: ${modelStr} (beklenen: provider::modelId)`)
    resolvedProvider = parsed.provider
    resolvedModel    = parsed.model

    if (isUUID(tenantId)) {
      // C → entity own key
      resolvedKey = await getEntityOwnKey(resolvedProvider, tenantId!)
      // B → entity_free platform key
      if (!resolvedKey) resolvedKey = await getEntityFreeKey(resolvedProvider)
    } else {
      // A → kibi platform key (admin/KIBI AI context)
      resolvedKey = await getKibiKey(resolvedProvider)
    }
  }

  if (!resolvedKey) {
    throw new Error(`${resolvedProvider} için API key bulunamadı`)
  }

  const providerDef = PROVIDERS.find(p => p.id === resolvedProvider)
  if (!providerDef) throw new Error(`Bilinmeyen provider: ${resolvedProvider}`)

  const headers = buildProviderHeaders(providerDef, resolvedKey)

  let body: Record<string, unknown>
  let url: string

  if (resolvedProvider === 'anthropic') {
    // Anthropic uses its own messages format
    url = `${providerDef.baseUrl}/messages`
    const systemMsg = messages.find(m => m.role === 'system')
    const otherMsgs = messages.filter(m => m.role !== 'system')
    body = {
      model:      resolvedModel,
      max_tokens: opts.maxTokens ?? 1500,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      messages: otherMsgs.map(m => ({ role: m.role, content: m.content })),
    }
  } else {
    url  = `${providerDef.baseUrl}/chat/completions`
    body = {
      model:       resolvedModel,
      messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens:  opts.maxTokens  ?? 1500,
    }
    if (opts.tools?.length) {
      body['tools'] = opts.tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }))
      body['tool_choice'] = 'auto'
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)

  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw Object.assign(new Error(`AI error (${resolvedProvider}/${resolvedModel}): HTTP ${res.status} — ${errText.slice(0, 300)}`), { status: res.status })
  }

  const data = await res.json() as any

  // Parse response — Anthropic format vs OpenAI format
  let content = ''
  let toolCalls: RoutedCompletionResult['toolCalls'] | undefined
  let usage: RoutedCompletionResult['usage'] | undefined

  if (resolvedProvider === 'anthropic') {
    const block = data.content?.[0]
    content = block?.text ?? ''
    usage = data.usage
      ? { prompt: data.usage.input_tokens ?? 0, completion: data.usage.output_tokens ?? 0 }
      : undefined
  } else {
    const msg = data.choices?.[0]?.message
    content   = msg?.content ?? ''
    toolCalls = msg?.tool_calls?.map((tc: any) => ({
      name:      tc.function.name,
      arguments: JSON.parse(tc.function.arguments || '{}'),
    }))
    usage = data.usage
      ? { prompt: data.usage.prompt_tokens ?? 0, completion: data.usage.completion_tokens ?? 0 }
      : undefined
  }

  console.log(`  [AI-ROUTE] OK — ${resolvedProvider}/${resolvedModel}`)
  return { content, usedModel: resolvedModel, usedProvider: resolvedProvider, toolCalls, usage }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMBEDDING API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate embeddings for one or more texts using the multi-provider routing.
 *
 * @param texts     Text(s) to embed
 * @param modelStr  "provider::modelId"  e.g. "huggingface::BAAI/bge-m3"
 * @param tenantId  Entity UUID for key resolution (null = platform context)
 * @returns         Float32 embedding vectors (one per input text)
 */
export async function aiEmbed(
  texts:    string | string[],
  modelStr: string,
  tenantId?: string | null,
): Promise<number[][]> {
  const inputs = Array.isArray(texts) ? texts : [texts]
  const parsed = parseModelString(modelStr)
  if (!parsed) throw new Error(`aiEmbed: geçersiz model string: ${modelStr}`)

  const { provider: providerId, model } = parsed

  // Key resolution — same C→B→A priority
  const isUUID = (s?: string | null) =>
    !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

  let apiKey: string | null = null
  if (isUUID(tenantId)) {
    apiKey = await getEntityOwnKey(providerId, tenantId!)
    if (!apiKey) apiKey = await getEntityFreeKey(providerId)
  }
  if (!apiKey) apiKey = await getKibiKey(providerId)

  if (!apiKey) throw new Error(`aiEmbed: ${providerId} için API key bulunamadı`)

  const providerDef = PROVIDERS.find(p => p.id === providerId)
  if (!providerDef) throw new Error(`aiEmbed: bilinmeyen provider: ${providerId}`)
  if (!providerDef.supportsEmbeddings) throw new Error(`${providerDef.name} embedding desteklemiyor`)

  // Build base URL — Cloudflare needs accountId substituted
  let baseUrl = providerDef.baseUrl
  if (providerDef.needsAccountId) {
    const [accountId, realKey] = apiKey.split('|', 2)
    if (!accountId || !realKey) throw new Error('Cloudflare: key formatı "accountId|apiKey" olmalı')
    baseUrl  = baseUrl.replace('{ACCOUNT_ID}', accountId)
    apiKey   = realKey
  }

  const headers = buildProviderHeaders({ ...providerDef, baseUrl }, apiKey)
  const embedPath = providerDef.embeddingsPath ?? '/embeddings'
  const url = `${baseUrl}${embedPath}`

  // Cohere has a different request body shape
  let bodyObj: Record<string, unknown>
  if (providerId === 'cohere') {
    bodyObj = { model, inputs, input_type: 'search_document', embedding_types: ['float'] }
  } else {
    bodyObj = { model, input: inputs }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyObj),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`aiEmbed error (${providerId}/${model}): HTTP ${res.status} — ${errText.slice(0, 300)}`)
  }

  const data = await res.json() as any

  // Parse response — Cohere returns { embeddings: { float: number[][] } }, others OpenAI-compat
  if (providerId === 'cohere') {
    const vecs = data?.embeddings?.float as number[][] | undefined
    if (!vecs?.length) throw new Error('aiEmbed: Cohere boş embedding döndürdü')
    return vecs
  }

  // OpenAI-compat: { data: [{ embedding: number[] }] }
  const items = data?.data as Array<{ embedding: number[] }> | undefined
  if (!items?.length) throw new Error('aiEmbed: boş embedding yanıtı')
  return items.map(it => it.embedding)
}

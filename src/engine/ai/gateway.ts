/**
 * AI Gateway — OpenRouter-first multi-provider
 *
 * Two-model architecture:
 *   ANALYSIS_MODELS   → structured reasoning, SQL, DB querying (Nemotron primary)
 *   CONVERSATION_MODELS → natural language, customer-facing replies (Llama-3.3 primary)
 *
 * Fallback chain: primary → fallback1 → fallback2
 * If a model returns a model-level error (503/404/overloaded), the next is tried.
 * Auth errors bubble up immediately.
 */

import { env } from '../../../config/env.js'

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

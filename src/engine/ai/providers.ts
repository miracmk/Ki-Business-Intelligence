/**
 * AI Provider definitions and model string utilities
 *
 * Supports 10 providers. Keys stored in platform_configs:
 *   ai_provider_kibi_{providerId}        — KIBI AI (platform scope)
 *   ai_provider_entity_free_{providerId} — Entity Free Tier (shared)
 * Entity own keys stored in ai_configs.settings.providerKeys[providerId].
 *
 * Model string format: "provider::modelId"  e.g. "groq::llama-3.3-70b-versatile"
 * Virtual model:       "kibi_free::default" — entity free tier
 */

export interface ProviderDef {
  id:                 string
  name:               string
  baseUrl:            string
  docsUrl:            string
  freeModels:         boolean
  modelsPath:         string | null  // null = use hardcoded list
  authHeader:         'bearer' | 'x-api-key'
  extraHeaders?:      Record<string, string>
  supportsEmbeddings: boolean
  embeddingsPath?:    string   // defaults to '/embeddings' (OpenAI compat)
  // Cloudflare: value stored as "accountId|apiKey" — gateway parses this
  needsAccountId?:    boolean
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    docsUrl: 'https://openrouter.ai/keys',
    freeModels: true,
    modelsPath: '/models',
    authHeader: 'bearer',
    supportsEmbeddings: false,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    docsUrl: 'https://platform.openai.com/api-keys',
    freeModels: false,
    modelsPath: '/models',
    authHeader: 'bearer',
    supportsEmbeddings: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    freeModels: false,
    modelsPath: '/models',
    authHeader: 'x-api-key',
    extraHeaders: { 'anthropic-version': '2023-06-01' },
    supportsEmbeddings: false,
  },
  {
    id: 'google',
    name: 'Google AI Studio',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    freeModels: false,
    modelsPath: '/models',
    authHeader: 'bearer',
    supportsEmbeddings: true,
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    docsUrl: 'https://console.mistral.ai/api-keys/',
    freeModels: false,
    modelsPath: '/models',
    authHeader: 'bearer',
    supportsEmbeddings: true,
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    docsUrl: 'https://console.groq.com/keys',
    freeModels: true,
    modelsPath: '/models',
    authHeader: 'bearer',
    supportsEmbeddings: false,
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    docsUrl: 'https://api.together.ai/settings/api-keys',
    freeModels: false,
    modelsPath: '/models',
    authHeader: 'bearer',
    supportsEmbeddings: true,
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    docsUrl: 'https://fireworks.ai/account/api-keys',
    freeModels: false,
    modelsPath: '/models',
    authHeader: 'bearer',
    supportsEmbeddings: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    freeModels: false,
    modelsPath: '/models',
    authHeader: 'bearer',
    supportsEmbeddings: false,
  },
  {
    id: 'cohere',
    name: 'Cohere',
    baseUrl: 'https://api.cohere.com/compatibility/v1',
    docsUrl: 'https://dashboard.cohere.com/api-keys',
    freeModels: false,
    modelsPath: '/models',
    authHeader: 'bearer',
    supportsEmbeddings: true,
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    docsUrl: 'https://cloud.cerebras.ai/platform',
    freeModels: false,
    modelsPath: '/models',
    authHeader: 'bearer',
    supportsEmbeddings: false,
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare Workers AI',
    // Runtime replaces {ACCOUNT_ID} with the parsed accountId portion of the stored credential
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1',
    docsUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    freeModels: true,
    modelsPath: null,  // no standard /models endpoint; model list is hardcoded
    authHeader: 'bearer',
    supportsEmbeddings: true,
    needsAccountId: true,
  },
  {
    id: 'qwen',
    name: 'Qwen (Alibaba Cloud)',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    docsUrl: 'https://bailian.console.alibabacloud.com/',
    freeModels: false,
    modelsPath: '/models',
    authHeader: 'bearer',
    supportsEmbeddings: true,
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    baseUrl: 'https://api-inference.huggingface.co/v1',
    docsUrl: 'https://huggingface.co/settings/tokens',
    freeModels: true,
    modelsPath: null,  // HF model catalog not enumerable via standard endpoint
    authHeader: 'bearer',
    supportsEmbeddings: true,
  },
  {
    id: 'edenai',
    name: 'Eden AI',
    baseUrl: 'https://api.edenai.run/v3',
    docsUrl: 'https://app.edenai.run/dashboard/iam/api-keys',
    freeModels: false,
    modelsPath: '/models',
    authHeader: 'bearer',
    supportsEmbeddings: false,
  },
]

export const PROVIDER_MAP = new Map(PROVIDERS.map(p => [p.id, p]))

export function getProviderDef(id: string): ProviderDef | undefined {
  return PROVIDER_MAP.get(id)
}

/**
 * Returns the platform_configs key for a given provider and scope.
 *   getConfigKey('groq', 'kibi')        → 'ai_provider_kibi_groq'
 *   getConfigKey('groq', 'entity_free') → 'ai_provider_entity_free_groq'
 */
export function getConfigKey(providerId: string, scope: string): string {
  return `ai_provider_${scope}_${providerId}`
}

/**
 * Parse a model string like "groq::llama-3.3-70b-versatile"
 * Returns null for strings that don't match the format.
 */
export function parseModelString(s: string): { provider: string; model: string } | null {
  const idx = s.indexOf('::')
  if (idx === -1) return null
  const provider = s.slice(0, idx)
  const model    = s.slice(idx + 2)
  if (!provider || !model) return null
  return { provider, model }
}

/** Build a model string from provider and model ID. */
export function buildModelString(provider: string, model: string): string {
  return `${provider}::${model}`
}

/** Virtual model string for entity free tier routing */
export const KIBI_FREE_MODEL = 'kibi_free::default'

export interface PingResult {
  ok:         boolean
  latencyMs:  number
  status?:    number
  speed?:     'fast' | 'slow' | 'very_slow'
  errorType?: string
  error?:     string
}

/** Sends a minimal 1-token chat request to a provider/model to measure latency and reachability. */
export async function pingProviderModel(providerDef: ProviderDef, modelId: string, apiKey: string): Promise<PingResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...providerDef.extraHeaders,
    ...(providerDef.authHeader === 'x-api-key'
      ? { 'x-api-key': apiKey }
      : { 'Authorization': `Bearer ${apiKey}` }),
  }

  const isAnthropic = providerDef.id === 'anthropic'
  const body = JSON.stringify({ model: modelId, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] })
  const pingPath = isAnthropic ? '/messages' : '/chat/completions'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  const t0 = Date.now()

  try {
    const res = await fetch(`${providerDef.baseUrl}${pingPath}`, {
      method: 'POST', headers, body, signal: controller.signal,
    })
    clearTimeout(timer)
    const latencyMs = Date.now() - t0

    if (res.ok || res.status === 200) {
      const speed = latencyMs < 1000 ? 'fast' : latencyMs < 3000 ? 'slow' : 'very_slow'
      return { ok: true, latencyMs, status: res.status, speed }
    }

    const errBody = await res.text().catch(() => '')
    let errorType: string
    if (res.status === 401 || res.status === 403) errorType = 'auth'
    else if (res.status === 404)                  errorType = 'not_found'
    else if (res.status === 429)                  errorType = 'rate_limit'
    else if (res.status >= 500)                   errorType = 'server_error'
    else                                          errorType = 'error'

    let errMsg = errBody.slice(0, 300)
    try {
      const parsed = JSON.parse(errBody)
      errMsg = parsed?.error?.message ?? parsed?.message ?? errMsg
    } catch {}

    return { ok: false, latencyMs, status: res.status, errorType, error: errMsg.slice(0, 200) }
  } catch (e: any) {
    clearTimeout(timer)
    const latencyMs = Date.now() - t0
    const isTimeout = e.name === 'AbortError'
    return {
      ok: false, latencyMs,
      errorType: isTimeout ? 'timeout' : 'network',
      error: isTimeout ? 'Zaman aşımı (15s)' : e.message,
    }
  }
}

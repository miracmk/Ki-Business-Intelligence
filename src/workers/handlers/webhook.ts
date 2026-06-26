// FAZ 5.5: webhook action handler. `url`/`headers` come from workflow_rules.actions, authored
// by an entity admin (same trust level as any other CRM configuration) — not end-user input.
export interface WebhookJobData {
  url: string
  method?: string
  headers?: Record<string, string>
  moduleKey: string
  table: string
  recordId: string
  ruleId: string
  ruleName: string
}

export async function webhookHandler(data: WebhookJobData): Promise<void> {
  if (!data.url) throw new Error('webhook: url eksik')

  const method = data.method ?? 'POST'
  const hasBody = method !== 'GET' && method !== 'HEAD'

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(data.url, {
      method,
      headers: hasBody ? { 'Content-Type': 'application/json', ...(data.headers ?? {}) } : data.headers,
      body: hasBody ? JSON.stringify({
        moduleKey: data.moduleKey,
        table: data.table,
        recordId: data.recordId,
        ruleId: data.ruleId,
        ruleName: data.ruleName,
      }) : undefined,
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`webhook ${data.url} -> HTTP ${res.status}`)
  } finally {
    clearTimeout(timeout)
  }
}

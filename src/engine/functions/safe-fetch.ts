// FAZ 7.2: ctx.http.get/post run on the HOST (the isolate can't make network calls itself —
// it calls back into this), so this needs its own guard: block requests to private/loopback/
// link-local ranges (SSRF — a function author could otherwise reach ki_postgres, ki_redis, or
// a cloud metadata endpoint at 169.254.169.254) and cap response size + timeout.
import dns from 'node:dns/promises'
import net from 'node:net'

const MAX_RESPONSE_BYTES = 1_000_000 // 1MB
const TIMEOUT_MS = 10_000

function isPrivateOrLoopbackIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false
  const [a, b] = parts
  if (a === 127) return true                          // loopback
  if (a === 10) return true                            // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true      // 172.16.0.0/12
  if (a === 192 && b === 168) return true               // 192.168.0.0/16
  if (a === 169 && b === 254) return true               // link-local (incl. cloud metadata)
  if (a === 0) return true                              // 0.0.0.0/8
  return false
}

function isPrivateOrLoopbackIPv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  return lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (net.isIP(hostname)) {
    if (net.isIPv4(hostname) && isPrivateOrLoopbackIPv4(hostname)) throw new Error(`Erişim engellendi: ${hostname} private/loopback adres`)
    if (net.isIPv6(hostname) && isPrivateOrLoopbackIPv6(hostname)) throw new Error(`Erişim engellendi: ${hostname} private/loopback adres`)
    return
  }
  if (hostname === 'localhost') throw new Error('Erişim engellendi: localhost')
  const records = await dns.lookup(hostname, { all: true })
  for (const r of records) {
    if (r.family === 4 && isPrivateOrLoopbackIPv4(r.address)) throw new Error(`Erişim engellendi: ${hostname} → ${r.address} private/loopback adres`)
    if (r.family === 6 && isPrivateOrLoopbackIPv6(r.address)) throw new Error(`Erişim engellendi: ${hostname} → ${r.address} private/loopback adres`)
  }
}

export interface SafeFetchResult {
  status: number
  body: string
}

export async function safeFetch(url: string, init: { method?: string; headers?: Record<string, string>; body?: string }): Promise<SafeFetchResult> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Desteklenmeyen protokol: ${parsed.protocol}`)
  }
  await assertPublicHost(parsed.hostname)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    const reader = res.body?.getReader()
    let received = 0
    const chunks: Uint8Array[] = []
    if (reader) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.length
        if (received > MAX_RESPONSE_BYTES) throw new Error('Yanıt çok büyük (1MB sınırı)')
        chunks.push(value)
      }
    }
    const body = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8')
    return { status: res.status, body }
  } finally {
    clearTimeout(timeout)
  }
}

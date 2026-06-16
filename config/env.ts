import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV:    z.enum(['development', 'production', 'test']).default('development'),
  PORT:        z.coerce.number().default(3001),
  HOST:        z.string().default('0.0.0.0'),
  APP_URL:     z.string().url(),
  APP_SECRET:  z.string().min(32),

  // ── PostgreSQL ────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().url(),

  // ── Redis ─────────────────────────────────────────────────────────────────
  REDIS_URL: z.string().url(),

  // ── Qdrant ────────────────────────────────────────────────────────────────
  QDRANT_URL:     z.string().url().default('http://localhost:6333'),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION: z.string().default('ki_knowledge_base'),

  // ── JWT ───────────────────────────────────────────────────────────────────
  JWT_SECRET:     z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),

  // ── WhatsApp Cloud API ────────────────────────────────────────────────────
  WA_PHONE_NUMBER_ID:      z.string(),
  WA_ACCESS_TOKEN:         z.string(),
  WA_WEBHOOK_VERIFY_TOKEN: z.string(),
  WA_OTP_TEMPLATE_NAME:    z.string().default('otp_verification'),
  WA_OTP_TEMPLATE_LANG:    z.string().default('tr'),

  // ── SMTP ──────────────────────────────────────────────────────────────────
  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().email(),
  SMTP_PASS: z.string(),
  SMTP_FROM: z.string(),

  // ── Encryption (AES-256, 64 hex chars) ───────────────────────────────────
  ENCRYPTION_KEY: z.string().length(64),

  // ── AI providers ──────────────────────────────────────────────────────────
  // OpenRouter: platform key for free models (all tenants share unless they bring own key)
  OPENROUTER_API_KEY: z.string(),
  // HuggingFace: embeddings (free tier)
  HUGGINGFACE_API_KEY: z.string().optional(),

  // ── CRM connections (platform-level defaults, tenants override) ───────────
  // Zoho — existing Ki Business account
  ZOHO_CLIENT_ID:     z.string().optional(),
  ZOHO_CLIENT_SECRET: z.string().optional(),
  ZOHO_REFRESH_TOKEN: z.string().optional(),
  ZOHO_REGION:        z.string().default('com'),
  // Webhook callback base URL (where CRM pushes notifications)
  WEBHOOK_BASE_URL: z.string().url(),

  // ── Telegram bot (optional) ───────────────────────────────────────────────
  TELEGRAM_BOT_TOKEN: z.string().optional(),

  // ── Ki Wallet (internal VPS network) ─────────────────────────────────────
  KI_WALLET_URL:          z.string().url().optional(),
  KI_WALLET_INTERNAL_KEY: z.string().optional(),
  KI_WALLET_TOPUP_URL:    z.string().url().optional(),
})

function loadEnv() {
  const result = schema.safeParse(process.env)
  if (!result.success) {
    console.error('❌ Invalid environment variables:')
    for (const [key, issues] of Object.entries(result.error.flatten().fieldErrors)) {
      console.error(`  ${key}: ${(issues as string[]).join(', ')}`)
    }
    process.exit(1)
  }
  return result.data
}

export const env = loadEnv()
export type Env = typeof env

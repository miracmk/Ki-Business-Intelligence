-- Model catalog: synced nightly from each provider
-- Migration: 0008_model_catalog

CREATE TABLE IF NOT EXISTS "kibi_model_catalog" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider_id"     varchar(50)  NOT NULL,          -- openai, anthropic, google, deepseek, groq…
  "model_id"        varchar(200) NOT NULL,           -- provider-native ID (e.g. gpt-4o-mini)
  "model_string"    varchar(250) NOT NULL,           -- full routable string: provider::model_id
  "display_name"    varchar(255),
  "context_length"  integer,
  "input_price_per_1m"  numeric(12, 6),             -- USD per 1M input tokens
  "output_price_per_1m" numeric(12, 6),             -- USD per 1M output tokens
  "is_chat"         boolean NOT NULL DEFAULT true,
  "is_embedding"    boolean NOT NULL DEFAULT false,
  "is_available"    boolean NOT NULL DEFAULT true,
  "tier"            varchar(20)  DEFAULT 'paid',     -- 'free' | 'paid'
  "raw_json"        jsonb,
  "last_synced_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "created_at"      timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "kibi_model_catalog_provider_model_idx"
  ON "kibi_model_catalog" ("provider_id", "model_id");
CREATE INDEX IF NOT EXISTS "kibi_model_catalog_provider_idx"
  ON "kibi_model_catalog" ("provider_id", "is_available");

-- Update pricing packages with correct TL-based pricing and direct-provider model strings
-- 1500 TL ≈ $40 | 4500 TL ≈ $120 | 9000 TL ≈ $240 (at ~37 TL/$)
UPDATE "kibi_pricing_packages" SET
  display_name               = 'Başlangıç',
  description                = 'Stabil ücretsiz modeller, küçük ekipler için. Google Gemini + DeepSeek doğrudan API.',
  guaranteed_tokens_input    = 10000000,   -- 10M input
  guaranteed_tokens_output   = 4000000,    -- 4M output
  guaranteed_tokens_context  = 1000000,    -- 1M context
  min_users                  = 1,
  max_users                  = 5,
  base_price_usd             = 40.00,      -- ~1500 TL
  token_markup               = 1.30,
  allowed_model_tier         = 'basic',
  sort_order                 = 1,
  updated_at                 = now()
WHERE tier = 1;

UPDATE "kibi_pricing_packages" SET
  display_name               = 'Profesyonel',
  description                = 'Claude Haiku + GPT-4o Mini + Gemini Flash — doğrudan sağlayıcı API, düşük gecikme.',
  guaranteed_tokens_input    = 40000000,   -- 40M input
  guaranteed_tokens_output   = 15000000,   -- 15M output
  guaranteed_tokens_context  = 5000000,    -- 5M context
  min_users                  = 5,
  max_users                  = 15,
  base_price_usd             = 120.00,     -- ~4500 TL
  token_markup               = 1.30,
  allowed_model_tier         = 'mid',
  sort_order                 = 2,
  updated_at                 = now()
WHERE tier = 2;

UPDATE "kibi_pricing_packages" SET
  display_name               = 'Kurumsal',
  description                = 'Claude Opus 4.8 + GPT-4o + Gemini Pro — en üst kalite, kurumsal destek.',
  guaranteed_tokens_input    = 100000000,  -- 100M input
  guaranteed_tokens_output   = 40000000,   -- 40M output
  guaranteed_tokens_context  = 20000000,   -- 20M context
  min_users                  = 15,
  max_users                  = 30,
  base_price_usd             = 240.00,     -- ~9000 TL
  token_markup               = 1.30,
  allowed_model_tier         = 'premium',
  sort_order                 = 3,
  updated_at                 = now()
WHERE tier = 3;

UPDATE "kibi_pricing_packages" SET
  display_name               = 'Pay-as-You-Go',
  description                = 'Tüm modeller açık, Ki Wallet bakiyesinden token × 1.50 tahsilat.',
  base_price_usd             = 0.00,
  is_pay_as_you_go           = true,
  payg_token_multiplier      = 1.50,
  allowed_model_tier         = 'all',
  sort_order                 = 4,
  updated_at                 = now()
WHERE tier = 4;

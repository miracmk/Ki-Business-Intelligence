-- Ki Wallet, Wallet Transactions, and Pricing Packages tables
-- Migration: 0006_ki_wallet_and_pricing

CREATE TABLE IF NOT EXISTS "kibi_wallets" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entity_id"       uuid NOT NULL REFERENCES "kibi_entities"("id") ON DELETE CASCADE,
  "email"           varchar(255) NOT NULL,
  "wallet_id"       varchar(100) NOT NULL,
  "balance_ki_coin" numeric(20, 8) NOT NULL DEFAULT '0',
  "balance_usd"     numeric(15, 2) NOT NULL DEFAULT '0',
  "last_sync_at"    timestamp with time zone,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "kibi_wallets_entity_idx"    ON "kibi_wallets" ("entity_id");
CREATE INDEX        IF NOT EXISTS "kibi_wallets_email_idx"     ON "kibi_wallets" ("email");
CREATE UNIQUE INDEX IF NOT EXISTS "kibi_wallets_wallet_id_idx" ON "kibi_wallets" ("wallet_id");

CREATE TABLE IF NOT EXISTS "kibi_wallet_transactions" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "wallet_id"      uuid NOT NULL REFERENCES "kibi_wallets"("id") ON DELETE CASCADE,
  "entity_id"      uuid NOT NULL REFERENCES "kibi_entities"("id") ON DELETE CASCADE,
  "type"           varchar(20) NOT NULL,
  "amount_ki_coin" numeric(20, 8) NOT NULL,
  "amount_usd"     numeric(15, 2) NOT NULL,
  "description"    varchar(500),
  "balance_after"  numeric(20, 8),
  "metadata"       jsonb DEFAULT '{}',
  "created_at"     timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "kibi_wallet_txns_wallet_idx" ON "kibi_wallet_transactions" ("wallet_id");
CREATE INDEX IF NOT EXISTS "kibi_wallet_txns_entity_idx" ON "kibi_wallet_transactions" ("entity_id");
CREATE INDEX IF NOT EXISTS "kibi_wallet_txns_time_idx"   ON "kibi_wallet_transactions" ("wallet_id", "created_at");

CREATE TABLE IF NOT EXISTS "kibi_pricing_packages" (
  "id"                       uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tier"                     integer NOT NULL,
  "name"                     varchar(100) NOT NULL,
  "display_name"             varchar(255) NOT NULL,
  "description"              text,
  "guaranteed_tokens_input"  bigint NOT NULL DEFAULT 0,
  "guaranteed_tokens_output" bigint NOT NULL DEFAULT 0,
  "guaranteed_tokens_context"bigint NOT NULL DEFAULT 0,
  "min_users"                integer NOT NULL DEFAULT 1,
  "max_users"                integer NOT NULL DEFAULT 5,
  "base_price_usd"           numeric(10, 2) NOT NULL,
  "token_markup"             numeric(5, 2) NOT NULL DEFAULT '1.30',
  "is_pay_as_you_go"         boolean NOT NULL DEFAULT false,
  "payg_token_multiplier"    numeric(5, 2) NOT NULL DEFAULT '1.50',
  "allowed_model_tier"       varchar(20) NOT NULL DEFAULT 'free',
  "accepts_ki_wallet"        boolean NOT NULL DEFAULT true,
  "is_active"                boolean NOT NULL DEFAULT true,
  "sort_order"               integer NOT NULL DEFAULT 0,
  "created_at"               timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"               timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "kibi_pricing_packages_tier_idx" ON "kibi_pricing_packages" ("tier");

-- Seed default pricing packages
-- Formula: (guaranteed_tokens * 1.30) + $100
-- Tier 1 Minimal: 50K tokens/mo → (50000 * 0.000001 * 1.30) + 100 ≈ $100.07 → ~$100
-- Tier 2 Fluent:  500K tokens/mo → (500000 * 0.000001 * 1.30) + 100 ≈ $100.65 → ~$149
-- Tier 3 Top:     2M tokens/mo → (2000000 * 0.000001 * 1.30) + 100 ≈ $102.60 → ~$299
-- PAYG: token * 1.50 from Ki Wallet

INSERT INTO "kibi_pricing_packages" (tier, name, display_name, description, guaranteed_tokens_input, guaranteed_tokens_output, guaranteed_tokens_context, min_users, max_users, base_price_usd, token_markup, is_pay_as_you_go, payg_token_multiplier, allowed_model_tier, sort_order)
VALUES
  (1, 'minimal',  'Minimal',  'Temel AI özellikleri, az token, küçük ekipler için',         50000,   25000,  10000,  1,  5,  100.00, 1.30, false, 1.50, 'free', 1),
  (2, 'fluent',   'Fluent',   'Akıcı işleyiş, orta kalite modeller, orta büyüklük ekipler', 500000, 250000, 100000, 5, 15,  149.00, 1.30, false, 1.50, 'mid',  2),
  (3, 'top',      'Top',      'Üst seviye modeller, yüksek token, büyük ekipler için',      2000000, 1000000,500000,15, 30,  299.00, 1.30, false, 1.50, 'top',  3),
  (4, 'payg',     'Pay-as-You-Go', 'Token başına ödeme, tam model seçimi özgürlüğü, Ki Wallet bakiyesinden tahsilat', 0, 0, 0, 1, 9999, 0.00, 1.50, true, 1.50, 'top', 4)
ON CONFLICT (tier) DO NOTHING;

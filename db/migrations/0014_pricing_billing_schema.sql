-- 0014_pricing_billing_schema.sql
-- Billing infrastructure: new pricing columns, entity billing fields,
-- per-member message limits, and 5-tier pricing data.

-- ── tenant_memberships: per-user message limits ────────────────────────────
ALTER TABLE tenant_memberships
  ADD COLUMN IF NOT EXISTS message_limit             INTEGER,
  ADD COLUMN IF NOT EXISTS messages_used_this_month  INTEGER NOT NULL DEFAULT 0;

-- ── kibi_entities: billing state columns ──────────────────────────────────
ALTER TABLE kibi_entities
  ADD COLUMN IF NOT EXISTS next_billing_at           TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS billing_cycle_start       TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS extra_sub_users           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS debt_tokens               BIGINT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_billing_restricted     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS messages_used_this_month  INTEGER NOT NULL DEFAULT 0;

-- ── kibi_pricing_packages: new pricing columns ────────────────────────────
ALTER TABLE kibi_pricing_packages
  ADD COLUMN IF NOT EXISTS plan_name                 VARCHAR(50),
  ADD COLUMN IF NOT EXISTS per_message_price_usd     NUMERIC(10,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overage_message_price_usd NUMERIC(10,6) NOT NULL DEFAULT 0.03,
  ADD COLUMN IF NOT EXISTS monthly_message_limit     INTEGER,
  ADD COLUMN IF NOT EXISTS extra_sub_user_price_usd  NUMERIC(10,2) NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS max_debt_tokens           BIGINT  NOT NULL DEFAULT 100000;

-- ── Migrate existing entity plans ─────────────────────────────────────────
UPDATE kibi_entities SET plan_name = 'basic'   WHERE plan_name = 'starter';
UPDATE kibi_entities SET plan_name = 'premium' WHERE plan_name = 'growth';

-- ── Replace all pricing packages with 5-tier structure ────────────────────
DELETE FROM kibi_pricing_packages;

INSERT INTO kibi_pricing_packages (
  tier, name, display_name, description,
  guaranteed_tokens_input, guaranteed_tokens_output, guaranteed_tokens_context,
  min_users, max_users,
  base_price_usd, token_markup,
  is_pay_as_you_go, payg_token_multiplier,
  allowed_model_tier, accepts_ki_wallet, is_active, sort_order,
  plan_name,
  per_message_price_usd, overage_message_price_usd,
  monthly_message_limit,
  extra_sub_user_price_usd,
  max_debt_tokens
) VALUES
  (1, 'free',          'Ücretsiz',      'Bireysel kullanım için temel plan',          0, 0, 0,  1,    1,    '0.00',   '1.30', FALSE, '1.50', 'free', TRUE, TRUE, 1, 'free',          '0.000000', '0.030000',   40, '25.00', 100000),
  (2, 'basic',         'Başlangıç',     '3 kullanıcıya kadar takım erişimi',          0, 0, 0,  1,    3,   '25.00',   '1.30', FALSE, '1.50', 'free', TRUE, TRUE, 2, 'basic',         '0.000000', '0.030000',  150, '25.00', 100000),
  (3, 'premium',       'Premium',       '10 kullanıcıya kadar gelişmiş erişim',       0, 0, 0,  1,   10,  '100.00',  '1.30', FALSE, '1.50', 'mid',  TRUE, TRUE, 3, 'premium',       '0.000000', '0.030000',  750, '25.00', 100000),
  (4, 'enterprise',    'Kurumsal',      '50 kullanıcıya kadar kurumsal erişim',       0, 0, 0,  1,   50, '1000.00', '1.30', FALSE, '1.50', 'top',  TRUE, TRUE, 4, 'enterprise',    '0.000000', '0.030000', 4500, '25.00', 100000),
  (5, 'custom_models', 'Özel Modeller', 'Kendi modellerinizle mesaj başına ödeme',    0, 0, 0,  1, 9999,   '50.00', '1.30', TRUE,  '1.50', 'top',  TRUE, TRUE, 5, 'custom_models', '0.050000', '0.030000', NULL, '30.00', 100000);

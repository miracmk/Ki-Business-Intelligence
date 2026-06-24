-- 0016_entity_module_entitlements.sql
-- YFZ 34: KiBI repositioning — Base (CRM+ERP+Muhasebe) + Premium AI upsell + 6 native add-on.
-- Entitlement framework: per-entity, per-module activation row. Premium AI ('ai_premium')
-- and each add-on are priced independently of plan_name — a plan no longer bundles AI.

DO $$ BEGIN
  CREATE TYPE entity_entitlement_module_key AS ENUM (
    'ai_premium',
    'addon_customer_service',
    'addon_fulfillment',
    'addon_ecommerce',
    'addon_marketing',
    'addon_event',
    'addon_personnel_management'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE entity_entitlement_status AS ENUM ('trial', 'active', 'suspended', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS entity_module_entitlements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     UUID NOT NULL REFERENCES kibi_entities(id) ON DELETE CASCADE,
  module_key    entity_entitlement_module_key NOT NULL,
  status        entity_entitlement_status NOT NULL DEFAULT 'active',
  price_usd     NUMERIC(10,2) NOT NULL DEFAULT 0,
  billing_type  VARCHAR(20) NOT NULL DEFAULT 'monthly',  -- monthly | usage | one_time
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  enabled_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  cancelled_at  TIMESTAMP WITH TIME ZONE,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS entity_module_entitlements_entity_module_idx
  ON entity_module_entitlements (entity_id, module_key);

CREATE INDEX IF NOT EXISTS entity_module_entitlements_entity_status_idx
  ON entity_module_entitlements (entity_id, status);

-- Backfill: every existing entity keeps unconditional AI access it already had before this
-- gate existed — without this, AI goes dark in production the instant the 402 gate ships.
INSERT INTO entity_module_entitlements (entity_id, module_key, status, price_usd)
SELECT id, 'ai_premium', 'active', 0
FROM kibi_entities
ON CONFLICT (entity_id, module_key) DO NOTHING;

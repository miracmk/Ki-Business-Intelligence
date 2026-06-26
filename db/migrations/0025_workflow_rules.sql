-- 0025_workflow_rules.sql
-- FAZ 5.3: declarative rule engine (Katman A) — control-plane table, applied directly via
-- psql (drizzle-kit migrate's journal is frozen at 0011 in this repo; see KIBIPR.md FAZ 4.1).

DO $$ BEGIN
  CREATE TYPE workflow_rule_trigger AS ENUM ('on_create', 'on_update', 'on_stage_change', 'scheduled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS workflow_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   UUID NOT NULL REFERENCES kibi_entities(id) ON DELETE CASCADE,
  module_key  VARCHAR(100) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  trigger     workflow_rule_trigger NOT NULL,
  conditions  JSONB,
  actions     JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_rules_entity_module_idx ON workflow_rules (entity_id, module_key);
CREATE INDEX IF NOT EXISTS workflow_rules_entity_active_idx ON workflow_rules (entity_id, is_active);

-- 0026_blueprint.sql
-- FAZ 6.1: Blueprint / state machine — applied directly via psql (drizzle-kit migrate's
-- journal is frozen at 0011; see KIBIPR.md FAZ 4.1).

CREATE TABLE IF NOT EXISTS blueprint_transitions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id              UUID NOT NULL REFERENCES kibi_entities(id) ON DELETE CASCADE,
  module_key             VARCHAR(100) NOT NULL,
  field_key              VARCHAR(100) NOT NULL,
  from_state             VARCHAR(100) NOT NULL,
  to_state               VARCHAR(100) NOT NULL,
  conditions             JSONB,
  requires_approval_role VARCHAR(50),
  actions                JSONB NOT NULL DEFAULT '[]',
  created_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blueprint_transitions_entity_module_field_idx
  ON blueprint_transitions (entity_id, module_key, field_key);

DO $$ BEGIN
  CREATE TYPE blueprint_approval_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS blueprint_approvals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           UUID NOT NULL REFERENCES kibi_entities(id) ON DELETE CASCADE,
  module_key          VARCHAR(100) NOT NULL,
  "table"             VARCHAR(100) NOT NULL,
  record_id           UUID NOT NULL,
  field_key           VARCHAR(100) NOT NULL,
  from_state          VARCHAR(100) NOT NULL,
  to_state            VARCHAR(100) NOT NULL,
  transition_id       UUID NOT NULL REFERENCES blueprint_transitions(id) ON DELETE CASCADE,
  status              blueprint_approval_status NOT NULL DEFAULT 'pending',
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at         TIMESTAMP WITH TIME ZONE,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blueprint_approvals_entity_status_idx
  ON blueprint_approvals (entity_id, status);

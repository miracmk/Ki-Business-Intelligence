-- 0031_ai_pending_actions.sql
-- FAZ 10.3: AI write approval queue — applied directly via psql (drizzle-kit migrate's
-- journal is frozen at 0011; see KIBIPR.md FAZ 4.1).

DO $$ BEGIN
  CREATE TYPE ai_action_type AS ENUM ('create', 'update', 'delete');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ai_action_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ai_pending_actions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           UUID NOT NULL REFERENCES kibi_entities(id) ON DELETE CASCADE,
  module_key          VARCHAR(100) NOT NULL,
  action              ai_action_type NOT NULL,
  record_id           UUID,
  proposed_data       JSONB,
  summary             TEXT NOT NULL,
  session_id          VARCHAR(100),
  status              ai_action_status NOT NULL DEFAULT 'pending',
  resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at         TIMESTAMP WITH TIME ZONE,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_pending_actions_entity_status_idx ON ai_pending_actions (entity_id, status);

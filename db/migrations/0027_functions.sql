-- 0027_functions.sql
-- FAZ 7.3: custom function definitions + execution log. Applied directly via psql
-- (drizzle-kit migrate's journal is frozen at 0011; see KIBIPR.md FAZ 4.1).

CREATE TABLE IF NOT EXISTS function_definitions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id  UUID NOT NULL REFERENCES kibi_entities(id) ON DELETE CASCADE,
  name       VARCHAR(255) NOT NULL,
  code       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS function_definitions_entity_idx ON function_definitions (entity_id);

DO $$ BEGIN
  CREATE TYPE function_execution_status AS ENUM ('success', 'error');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS function_executions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id  UUID NOT NULL REFERENCES function_definitions(id) ON DELETE CASCADE,
  entity_id    UUID NOT NULL REFERENCES kibi_entities(id) ON DELETE CASCADE,
  triggered_by JSONB NOT NULL DEFAULT '{}',
  status       function_execution_status NOT NULL,
  result       JSONB,
  error        TEXT,
  logs         JSONB NOT NULL DEFAULT '[]',
  duration_ms  INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS function_executions_function_idx ON function_executions (function_id, created_at);

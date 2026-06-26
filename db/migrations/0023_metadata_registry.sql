-- 0023_metadata_registry.sql
-- FAZ 4.1: Field/Module metadata registry — control-plane source of truth for native
-- (is_system=true) and future custom modules/fields. COLUMN_MAP in native route files
-- stays as the runtime fallback when the registry is empty (kademeli geçiş).

CREATE TABLE IF NOT EXISTS kibi_modules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id      UUID NOT NULL REFERENCES kibi_entities(id) ON DELETE CASCADE,
  key            VARCHAR(100) NOT NULL,
  label          VARCHAR(255) NOT NULL,
  is_system      BOOLEAN NOT NULL DEFAULT false,
  physical_table VARCHAR(100),
  icon           VARCHAR(50),
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kibi_modules_entity_key_idx
  ON kibi_modules (entity_id, key);

DO $$ BEGIN
  CREATE TYPE kibi_field_type AS ENUM ('text', 'number', 'date', 'boolean', 'select', 'relation', 'ai');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS kibi_fields (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   UUID NOT NULL REFERENCES kibi_modules(id) ON DELETE CASCADE,
  key         VARCHAR(100) NOT NULL,
  column_name VARCHAR(100),
  label       VARCHAR(255) NOT NULL,
  type        kibi_field_type NOT NULL DEFAULT 'text',
  is_system   BOOLEAN NOT NULL DEFAULT false,
  is_required BOOLEAN NOT NULL DEFAULT false,
  config      JSONB NOT NULL DEFAULT '{}',
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kibi_fields_module_key_idx
  ON kibi_fields (module_id, key);

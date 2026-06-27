-- 0033_nav_config.sql
-- Sidebar nav config — per-entity overrides over the static catalog in
-- src/lib/nav-catalog.ts. Applied directly via psql (drizzle-kit migrate's journal is
-- frozen at 0011; see KIBIPR.md FAZ 4.1).

CREATE TABLE IF NOT EXISTS entity_sidebar_nav_config (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id    UUID NOT NULL REFERENCES kibi_entities(id) ON DELETE CASCADE,
  item_key     VARCHAR(100) NOT NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  is_visible   BOOLEAN NOT NULL DEFAULT true,
  allowed_roles JSONB,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS entity_sidebar_nav_config_entity_item_idx
  ON entity_sidebar_nav_config (entity_id, item_key);

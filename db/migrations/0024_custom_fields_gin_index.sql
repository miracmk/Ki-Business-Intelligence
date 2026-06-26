-- 0024_custom_fields_gin_index.sql
-- FAZ 4.2: GIN index on custom_fields JSONB for every table that has it, so JSONB
-- containment/key-existence queries (custom_fields @> '{}', custom_fields ? 'key')
-- against custom field data are actually indexed. Index names are NOT schema-prefixed
-- (index names only need to be unique within their own schema) — see KIBIPR.md §12 for
-- the pre-existing ":schema"_xxx_idx naming bug in entity-schema-template.sql; this
-- migration deliberately avoids repeating it.
--
-- Backfill for existing entity schemas. entity-schema-template.sql gets the same
-- CREATE INDEX statements added next to each table for future tenants.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT entity_db_schema AS schema_name FROM kibi_entities
           WHERE is_provisioned = TRUE AND entity_db_schema IS NOT NULL
  LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_crm_contacts_custom_fields_gin ON %I.crm_contacts USING GIN (custom_fields)', r.schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_crm_companies_custom_fields_gin ON %I.crm_companies USING GIN (custom_fields)', r.schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_crm_deals_custom_fields_gin ON %I.crm_deals USING GIN (custom_fields)', r.schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_erp_products_custom_fields_gin ON %I.erp_products USING GIN (custom_fields)', r.schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_erp_staff_custom_fields_gin ON %I.erp_staff USING GIN (custom_fields)', r.schema_name);
  END LOOP;
END $$;

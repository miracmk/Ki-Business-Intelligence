-- 0029_owner_id.sql
-- FAZ 9.1: record-level security — owner_id on crm_contacts/companies/deals (crm_activities
-- already had an unused created_by_user_id column, reused as its owner-equivalent instead of
-- adding a duplicate). Backfill for existing entity schemas; entity-schema-template.sql
-- already updated for future tenants. Applied via psql (drizzle-kit migrate's journal is
-- frozen at 0011; see KIBIPR.md FAZ 4.1).

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT entity_db_schema AS schema_name FROM kibi_entities
           WHERE is_provisioned = TRUE AND entity_db_schema IS NOT NULL
  LOOP
    EXECUTE format('ALTER TABLE %I.crm_contacts ADD COLUMN IF NOT EXISTS owner_id UUID', r.schema_name);
    EXECUTE format('ALTER TABLE %I.crm_companies ADD COLUMN IF NOT EXISTS owner_id UUID', r.schema_name);
    EXECUTE format('ALTER TABLE %I.crm_deals ADD COLUMN IF NOT EXISTS owner_id UUID', r.schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_crm_contacts_owner_id ON %I.crm_contacts (owner_id)', r.schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_crm_companies_owner_id ON %I.crm_companies (owner_id)', r.schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_crm_deals_owner_id ON %I.crm_deals (owner_id)', r.schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_crm_activities_created_by_user_id ON %I.crm_activities (created_by_user_id)', r.schema_name);

    -- Backfill: existing rows have no owner — fall back to assigned_to_user_id so scope
    -- filtering doesn't suddenly hide every pre-existing record from its assignee.
    EXECUTE format('UPDATE %I.crm_contacts SET owner_id = assigned_to_user_id WHERE owner_id IS NULL', r.schema_name);
    EXECUTE format('UPDATE %I.crm_companies SET owner_id = assigned_to_user_id WHERE owner_id IS NULL', r.schema_name);
    EXECUTE format('UPDATE %I.crm_deals SET owner_id = assigned_to_user_id WHERE owner_id IS NULL', r.schema_name);
    EXECUTE format('UPDATE %I.crm_activities SET created_by_user_id = assigned_to_user_id WHERE created_by_user_id IS NULL', r.schema_name);
  END LOOP;
END $$;

-- 0030_module_has_deleted_at.sql
-- FAZ 10.2: kibi_modules.has_deleted_at — not every native table has a deleted_at column
-- (only crm_contacts/companies/deals, erp_products do). records-bridge.ts's recordsFind
-- used to hardcode `deleted_at IS NULL` and silently return [] for every other module.
-- Applied directly via psql (drizzle-kit migrate's journal is frozen at 0011).

ALTER TABLE kibi_modules ADD COLUMN IF NOT EXISTS has_deleted_at BOOLEAN NOT NULL DEFAULT false;

UPDATE kibi_modules SET has_deleted_at = true WHERE key IN ('crm_contacts', 'crm_companies', 'crm_deals', 'erp_products');

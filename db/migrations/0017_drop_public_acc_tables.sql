-- 0017_drop_public_acc_tables.sql
-- YFZ 34 Faz 2: retire the disconnected public-schema acc_* tables now that native
-- accounting CRUD (src/api/routes/accounting.ts) targets the richer, already
-- interconnected entity-schema acc_* set instead (db/entity-schema-template.sql).
--
-- Verified before writing this migration: 0 rows in all five tables, and
-- accounting.ts was the sole importer of their Drizzle definitions in src/ — this
-- is a pure schema cutover, no data migration needed.

DROP TABLE IF EXISTS acc_invoice_lines;
DROP TABLE IF EXISTS acc_payments;
DROP TABLE IF EXISTS acc_invoices;
DROP TABLE IF EXISTS acc_expenses;
DROP TABLE IF EXISTS acc_contacts;

-- GIN index on crm_records.data for fast JSONB queries
-- Runs once on first postgres startup
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Will be applied after Drizzle creates the table
-- Add to migration if needed:
-- CREATE INDEX CONCURRENTLY crm_records_data_gin ON crm_records USING gin(data);

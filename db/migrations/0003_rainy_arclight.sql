-- Migration: add connector_config column to crm_connections
-- Enum values and other changes were already applied directly to the database

ALTER TABLE "crm_connections" ADD COLUMN IF NOT EXISTS "connector_config" jsonb;

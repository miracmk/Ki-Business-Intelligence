-- 0013_pricing_plans_enum.sql
-- Add new plan_name enum values for the 5-tier pricing structure.
-- MUST be in a separate migration from any statement that USES these values,
-- because PostgreSQL cannot use newly-added enum values in the same transaction.
ALTER TYPE "plan_name" ADD VALUE IF NOT EXISTS 'basic';
ALTER TYPE "plan_name" ADD VALUE IF NOT EXISTS 'premium';
ALTER TYPE "plan_name" ADD VALUE IF NOT EXISTS 'custom_models';

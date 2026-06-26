-- 0028_industry_templates.sql
-- FAZ 8.1: industry template catalog — applied directly via psql (drizzle-kit migrate's
-- journal is frozen at 0011; see KIBIPR.md FAZ 4.1).

CREATE TABLE IF NOT EXISTS industry_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key          VARCHAR(100) NOT NULL UNIQUE,
  label        VARCHAR(255) NOT NULL,
  package_json JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

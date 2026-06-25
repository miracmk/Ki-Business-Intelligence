-- 0021_marketing_tables.sql
-- YFZ 34 Faz 5d: Marketing Management native add-on (addon_marketing).
-- Backfills crm_email_campaigns / crm_social_posts onto every already-provisioned
-- entity schema (entity-schema-template.sql covers future tenants).

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT entity_db_schema AS schema_name FROM kibi_entities
           WHERE is_provisioned = TRUE AND entity_db_schema IS NOT NULL
  LOOP
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.crm_email_campaigns (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        subject         VARCHAR(500) NOT NULL,
        body            TEXT,
        segment         VARCHAR(50)  DEFAULT 'all',
        status          VARCHAR(30)  DEFAULT 'draft',
        scheduled_at    TIMESTAMPTZ,
        sent_at         TIMESTAMPTZ,
        recipient_count INTEGER      DEFAULT 0,
        sent_count      INTEGER      DEFAULT 0,
        failed_count    INTEGER      DEFAULT 0,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    $f$, r.schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS crm_email_campaigns_status_idx ON %I.crm_email_campaigns (status)', r.schema_name);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.crm_social_posts (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        platform        VARCHAR(50) NOT NULL,
        content         TEXT,
        ai_generated    BOOLEAN     DEFAULT FALSE,
        status          VARCHAR(30) DEFAULT 'draft',
        scheduled_at    TIMESTAMPTZ,
        published_at    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    $f$, r.schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS crm_social_posts_status_idx ON %I.crm_social_posts (status)', r.schema_name);
  END LOOP;
END $$;

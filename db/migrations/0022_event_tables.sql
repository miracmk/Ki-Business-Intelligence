-- 0022_event_tables.sql
-- YFZ 34 Faz 5e: Event Management native add-on (addon_event).
-- Backfills erp_event_venues / erp_events / erp_event_tickets /
-- erp_event_registrations onto every already-provisioned entity schema.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT entity_db_schema AS schema_name FROM kibi_entities
           WHERE is_provisioned = TRUE AND entity_db_schema IS NOT NULL
  LOOP
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.erp_event_venues (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        address_line1   VARCHAR(500),
        city            VARCHAR(100),
        country         VARCHAR(2)  DEFAULT 'TR',
        capacity        INTEGER,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    $f$, r.schema_name);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.erp_events (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(500) NOT NULL,
        description     TEXT,
        venue_id        UUID        REFERENCES %I.erp_event_venues(id) ON DELETE SET NULL,
        start_date      TIMESTAMPTZ NOT NULL,
        end_date        TIMESTAMPTZ,
        capacity        INTEGER,
        status          VARCHAR(30) DEFAULT 'planned',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    $f$, r.schema_name, r.schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS erp_events_status_idx ON %I.erp_events (status)', r.schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS erp_events_start_idx ON %I.erp_events (start_date)', r.schema_name);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.erp_event_tickets (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id        UUID        NOT NULL REFERENCES %I.erp_events(id) ON DELETE CASCADE,
        name            VARCHAR(255) NOT NULL,
        price           NUMERIC(15,2) DEFAULT 0,
        currency        VARCHAR(3)  DEFAULT 'TRY',
        quantity_total  INTEGER,
        quantity_sold   INTEGER     DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    $f$, r.schema_name, r.schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS erp_event_tickets_event_idx ON %I.erp_event_tickets (event_id)', r.schema_name);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.erp_event_registrations (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id        UUID        NOT NULL REFERENCES %I.erp_events(id) ON DELETE CASCADE,
        ticket_id       UUID        REFERENCES %I.erp_event_tickets(id) ON DELETE SET NULL,
        contact_id      UUID        REFERENCES %I.crm_contacts(id) ON DELETE SET NULL,
        invoice_id      UUID,
        status          VARCHAR(30) DEFAULT 'registered',
        registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        checked_in_at   TIMESTAMPTZ
      )
    $f$, r.schema_name, r.schema_name, r.schema_name, r.schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS erp_event_registrations_event_idx ON %I.erp_event_registrations (event_id)', r.schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS erp_event_registrations_contact_idx ON %I.erp_event_registrations (contact_id)', r.schema_name);
  END LOOP;
END $$;

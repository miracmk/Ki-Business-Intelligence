-- 0018_support_tables.sql
-- YFZ 34 Faz 5a: Customer Service Management native add-on (addon_customer_service).
-- Adds support_sla_policies / support_tickets / support_ticket_messages to every
-- already-provisioned entity schema (entity-schema-template.sql covers future
-- tenants; this migration is the one-time backfill for existing ones — see
-- src/lib/entity-provisioner.ts's note on why template.sql alone isn't enough).
--
-- Tables live in every Base entity schema regardless of entitlement (no extra
-- provisioning cost); native CRUD/UI access is gated by entity_module_entitlements
-- ('addon_customer_service') in the API layer, not by schema presence.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT entity_db_schema AS schema_name FROM kibi_entities
           WHERE is_provisioned = TRUE AND entity_db_schema IS NOT NULL
  LOOP
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.support_sla_policies (
        id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        name                  VARCHAR(255) NOT NULL,
        priority              VARCHAR(20)  NOT NULL,
        first_response_hours  NUMERIC(6,2) NOT NULL DEFAULT 24,
        resolution_hours      NUMERIC(6,2) NOT NULL DEFAULT 72,
        is_active             BOOLEAN      DEFAULT TRUE,
        created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    $f$, r.schema_name);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.support_tickets (
        id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_number           VARCHAR(50) NOT NULL,
        contact_id              UUID        REFERENCES %I.crm_contacts(id) ON DELETE SET NULL,
        subject                 VARCHAR(500) NOT NULL,
        description             TEXT,
        category                VARCHAR(100),
        status                  VARCHAR(30)  DEFAULT 'open',
        priority                VARCHAR(20)  DEFAULT 'medium',
        assigned_to_user_id     UUID,
        sla_policy_id           UUID        REFERENCES %I.support_sla_policies(id) ON DELETE SET NULL,
        first_response_due_at   TIMESTAMPTZ,
        resolution_due_at       TIMESTAMPTZ,
        first_responded_at      TIMESTAMPTZ,
        resolved_at             TIMESTAMPTZ,
        closed_at               TIMESTAMPTZ,
        tags                    JSONB       DEFAULT '[]',
        created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    $f$, r.schema_name, r.schema_name, r.schema_name);

    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_number_idx ON %I.support_tickets (ticket_number)', r.schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON %I.support_tickets (status)', r.schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS support_tickets_contact_idx ON %I.support_tickets (contact_id)', r.schema_name);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.support_ticket_messages (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id       UUID        NOT NULL REFERENCES %I.support_tickets(id) ON DELETE CASCADE,
        sender_type     VARCHAR(20) NOT NULL,
        sender_user_id  UUID,
        content         TEXT        NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    $f$, r.schema_name, r.schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx ON %I.support_ticket_messages (ticket_id, created_at)', r.schema_name);
  END LOOP;
END $$;

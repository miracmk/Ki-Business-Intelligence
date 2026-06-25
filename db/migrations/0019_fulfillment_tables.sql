-- 0019_fulfillment_tables.sql
-- YFZ 34 Faz 5b: Fulfillment Service Management native add-on (addon_fulfillment).
-- Backfills erp_couriers / erp_shipments / erp_warehouse_picks onto every already-
-- provisioned entity schema (entity-schema-template.sql covers future tenants).

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT entity_db_schema AS schema_name FROM kibi_entities
           WHERE is_provisioned = TRUE AND entity_db_schema IS NOT NULL
  LOOP
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.erp_couriers (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        carrier_code    VARCHAR(50),
        api_credentials TEXT,
        is_active       BOOLEAN      DEFAULT TRUE,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    $f$, r.schema_name);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.erp_shipments (
        id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id          UUID        NOT NULL REFERENCES %I.erp_orders(id) ON DELETE CASCADE,
        courier_id        UUID        REFERENCES %I.erp_couriers(id) ON DELETE SET NULL,
        tracking_number   VARCHAR(255),
        carrier           VARCHAR(100),
        status            VARCHAR(30)  DEFAULT 'picking',
        shipping_address  JSONB,
        shipped_at        TIMESTAMPTZ,
        delivered_at      TIMESTAMPTZ,
        notes             TEXT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    $f$, r.schema_name, r.schema_name, r.schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS erp_shipments_order_idx ON %I.erp_shipments (order_id)', r.schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS erp_shipments_status_idx ON %I.erp_shipments (status)', r.schema_name);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.erp_warehouse_picks (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        shipment_id     UUID        REFERENCES %I.erp_shipments(id) ON DELETE CASCADE,
        warehouse_id    UUID        REFERENCES %I.erp_warehouses(id) ON DELETE SET NULL,
        status          VARCHAR(30) DEFAULT 'pending',
        picked_by       UUID,
        picked_at       TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    $f$, r.schema_name, r.schema_name, r.schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS erp_warehouse_picks_shipment_idx ON %I.erp_warehouse_picks (shipment_id)', r.schema_name);
  END LOOP;
END $$;

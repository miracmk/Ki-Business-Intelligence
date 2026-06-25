-- 0020_ecommerce_tables.sql
-- YFZ 34 Faz 5c: E-Commerce Management native add-on (addon_ecommerce).
-- Backfills erp_marketplace_connections / erp_marketplace_listings /
-- erp_marketplace_orders onto every already-provisioned entity schema.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT entity_db_schema AS schema_name FROM kibi_entities
           WHERE is_provisioned = TRUE AND entity_db_schema IS NOT NULL
  LOOP
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.erp_marketplace_connections (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        provider        VARCHAR(50) NOT NULL,
        name            VARCHAR(255) NOT NULL,
        credentials     TEXT,
        is_active       BOOLEAN      DEFAULT TRUE,
        last_sync_at    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    $f$, r.schema_name);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.erp_marketplace_listings (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id   UUID        NOT NULL REFERENCES %I.erp_marketplace_connections(id) ON DELETE CASCADE,
        product_id      UUID        REFERENCES %I.erp_products(id) ON DELETE SET NULL,
        marketplace_sku VARCHAR(255),
        price_override  NUMERIC(15,2),
        stock_override  NUMERIC(15,3),
        is_active       BOOLEAN      DEFAULT TRUE,
        last_synced_at  TIMESTAMPTZ,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    $f$, r.schema_name, r.schema_name, r.schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS erp_marketplace_listings_connection_idx ON %I.erp_marketplace_listings (connection_id)', r.schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS erp_marketplace_listings_product_idx ON %I.erp_marketplace_listings (product_id)', r.schema_name);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.erp_marketplace_orders (
        id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id       UUID        NOT NULL REFERENCES %I.erp_marketplace_connections(id) ON DELETE CASCADE,
        order_id            UUID        REFERENCES %I.erp_orders(id) ON DELETE SET NULL,
        external_order_id   VARCHAR(255) NOT NULL,
        external_status     VARCHAR(100),
        raw_data            JSONB,
        imported_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    $f$, r.schema_name, r.schema_name, r.schema_name);

    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS erp_marketplace_orders_external_idx ON %I.erp_marketplace_orders (connection_id, external_order_id)', r.schema_name);
  END LOOP;
END $$;

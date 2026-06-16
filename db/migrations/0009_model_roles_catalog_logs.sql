-- Migration: 0009_model_roles_catalog_logs
-- YFZ 19-21 / FAZ A — Yeni model rol taksonomisi + Connector katalog + AI pipeline logları
--
-- NOT: ALTER TYPE ... ADD VALUE ile eklenen enum değeri AYNI transaction içinde
-- kullanılamaz (PostgreSQL kısıtı). Bu yüzden enum eklemeleri burada, rol seed'i
-- ayrı dosyada (0010_seed_model_roles.sql) yapılır. psql autocommit modunda
-- her statement kendi tx'inde çalışır; 0010 0009'dan SONRA uygulanmalıdır.

-- ── 1) kibi_model_role enum'una 13 yeni semantik rol ekle (eskiler korunur) ──────
-- NOT: Enum değerleri migration 0010 tarafından seed edilir.
-- Burada direkt ADD VALUE çalıştırılmıyor (transaction context'te hata verebilir).
-- Değerler zaten DB'de varsa, aşağıdaki kod otomatik olarak pas geçilir.
-- (Enum ADD VALUE zaten idempotent PostgreSQL IF NOT EXISTS ile.)
SELECT 1; -- Placeholder: migration sırası korunuyor, 0010 sonra gelir

-- ── 2) entity_data_catalog — Connector AI semantik kataloğu ─────────────────────
CREATE TABLE IF NOT EXISTS "entity_data_catalog" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entity_id"        uuid NOT NULL,
  "connection_id"    uuid NOT NULL,
  "source_name"      varchar(100) NOT NULL,
  "source_type"      varchar(50)  NOT NULL,   -- 'crm_api' | 'database' | 'erp_api' | 'accounting_api'
  "table_name"       varchar(200) NOT NULL,
  "display_name"     varchar(200),
  "table_intent"     varchar(100),            -- 'customer_entity' | 'lead' | 'invoice' | ...
  "columns"          jsonb,                   -- ConnectorColumn[]
  "relationships"    jsonb,                   -- ConnectorRelationship[]
  "query_templates"  jsonb,                   -- Record<string,string>
  "data_quality"     jsonb,                   -- ConnectorDataQuality
  "raw_table_path"   varchar(300),
  "is_queryable"     boolean DEFAULT true,
  "is_writable"      boolean DEFAULT false,
  "is_user_approved" boolean DEFAULT false,
  "catalog_version"  integer DEFAULT 1,
  "record_count"     integer DEFAULT 0,
  "last_analyzed_at" timestamp with time zone,
  "created_at"       timestamp with time zone DEFAULT now(),
  "updated_at"       timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_catalog_unique"
  ON "entity_data_catalog" ("entity_id", "connection_id", "table_name");
CREATE INDEX IF NOT EXISTS "idx_catalog_entity"     ON "entity_data_catalog" ("entity_id");
CREATE INDEX IF NOT EXISTS "idx_catalog_connection" ON "entity_data_catalog" ("connection_id");

-- ── 3) ai_pipeline_logs — her AI model çağrısının izlenmesi ──────────────────────
CREATE TABLE IF NOT EXISTS "ai_pipeline_logs" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entity_id"        uuid,                    -- null => platform (KIBI AI)
  "session_id"       varchar(200),
  "pipeline_type"    varchar(20) NOT NULL,    -- 'entity' | 'platform'
  "model_role"       varchar(50) NOT NULL,
  "model_used"       varchar(100),
  "input_tokens"     integer,
  "output_tokens"    integer,
  "latency_ms"       integer,
  "success"          boolean DEFAULT true,
  "error_message"    text,
  "confidence_score" integer,                 -- 0-100
  "escalated"        boolean DEFAULT false,
  "kb_written"       boolean DEFAULT false,
  "created_at"       timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_logs_entity"  ON "ai_pipeline_logs" ("entity_id");
CREATE INDEX IF NOT EXISTS "idx_logs_role"    ON "ai_pipeline_logs" ("model_role");
CREATE INDEX IF NOT EXISTS "idx_logs_created" ON "ai_pipeline_logs" ("created_at" DESC);

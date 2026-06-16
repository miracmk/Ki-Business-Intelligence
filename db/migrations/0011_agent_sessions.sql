-- YFZ 22: Entity AI Agent Pipeline tables
-- kb_approval_queue, support_sessions, sales_sessions

CREATE TABLE IF NOT EXISTS "kb_approval_queue" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "entity_id"        uuid NOT NULL,
  "problem_summary"  text,
  "solution_text"    text NOT NULL,
  "web_sources"      jsonb,
  "confidence_score" integer,
  "model_used"       varchar(100),
  "status"           varchar(20) DEFAULT 'pending' NOT NULL,
  "reviewed_by"      uuid REFERENCES users(id) ON DELETE SET NULL,
  "reviewed_at"      timestamp with time zone,
  "kb_collection"    varchar(200),
  "created_at"       timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_kb_queue_entity" ON "kb_approval_queue" ("entity_id", "status");

CREATE TABLE IF NOT EXISTS "support_sessions" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "entity_id"          uuid NOT NULL,
  "session_key"        varchar(200) NOT NULL,
  "current_problem"    jsonb,
  "attempt_count"      integer DEFAULT 0 NOT NULL,
  "previous_attempts"  jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status"             varchar(20) DEFAULT 'open' NOT NULL,
  "escalated_at"       timestamp with time zone,
  "escalation_reason"  text,
  "resolved_at"        timestamp with time zone,
  "created_at"         timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"         timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_support_sessions_entity" ON "support_sessions" ("entity_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_support_sessions_key" ON "support_sessions" ("session_key");

CREATE TABLE IF NOT EXISTS "sales_sessions" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "entity_id"           uuid NOT NULL,
  "session_key"         varchar(200) NOT NULL,
  "current_analysis"    jsonb,
  "intent_history"      jsonb DEFAULT '[]'::jsonb NOT NULL,
  "closing_attempted"   boolean DEFAULT false NOT NULL,
  "lead_created"        boolean DEFAULT false NOT NULL,
  "created_at"          timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"          timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_sales_sessions_entity" ON "sales_sessions" ("entity_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_sales_sessions_key" ON "sales_sessions" ("session_key");

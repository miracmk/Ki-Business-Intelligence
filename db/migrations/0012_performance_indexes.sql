-- YFZ 28 — Performance Indexes
-- Run after all previous migrations

-- ai_pipeline_logs: common filter patterns
CREATE INDEX IF NOT EXISTS idx_apl_entity_id     ON ai_pipeline_logs (entity_id);
CREATE INDEX IF NOT EXISTS idx_apl_model_role    ON ai_pipeline_logs (model_role);
CREATE INDEX IF NOT EXISTS idx_apl_created_at    ON ai_pipeline_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apl_success       ON ai_pipeline_logs (success);
CREATE INDEX IF NOT EXISTS idx_apl_escalated     ON ai_pipeline_logs (escalated) WHERE escalated = true;

-- kb_approval_queue: supervisor workflow
CREATE INDEX IF NOT EXISTS idx_kaq_entity_status ON kb_approval_queue (entity_id, status);
CREATE INDEX IF NOT EXISTS idx_kaq_status        ON kb_approval_queue (status);

-- support_sessions: lookup by key
CREATE INDEX IF NOT EXISTS idx_ss_entity_status  ON support_sessions (entity_id, status);

-- sales_sessions: lookup by key
CREATE INDEX IF NOT EXISTS idx_sss_entity_id     ON sales_sessions (entity_id);

-- entity_data_catalog: catalog lookup
CREATE INDEX IF NOT EXISTS idx_edc_entity_approved ON entity_data_catalog (entity_id, is_user_approved);

-- ai_sessions: session lookup
CREATE INDEX IF NOT EXISTS idx_aisess_entity      ON ai_sessions (entity_id);
CREATE INDEX IF NOT EXISTS idx_aisess_user_entity ON ai_sessions (user_id, entity_id);

-- kibi_token_usage: billing queries
CREATE INDEX IF NOT EXISTS idx_ktu_entity_used ON kibi_token_usage (entity_id, used_at DESC);

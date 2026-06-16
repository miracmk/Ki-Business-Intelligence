-- Migration: 0010_seed_model_roles
-- YFZ 19-21 / FAZ A — 13 yeni model rolünü platform + entity_free scope'larında seed et.
-- 0009'dan SONRA uygulanmalı (enum değerleri commit edilmiş olmalı).
--
-- Model string formatı: "provider::modelId" (çok-sağlayıcılı sistem).
-- Varsayılanlar OpenRouter ücretsiz modelleri; kb_vector embedding için HuggingFace.
-- Idempotent: yalnızca (scope, model_role) yoksa ekler — mevcut atamalar korunur.

INSERT INTO "kibi_model_configs"
  ("scope", "model_role", "primary_model", "fallback_1", "fallback_2", "provider", "temperature", "max_tokens", "is_active", "updated_at")
SELECT s.scope, v.role::kibi_model_role, v.primary_model, v.fallback_1, v.fallback_2, v.provider, 0.4, 1500, true, now()
FROM (VALUES
  -- role, primary, fallback_1, fallback_2, provider
  ('intent_analysis',           'openrouter::google/gemini-2.0-flash-exp:free',            'openrouter::meta-llama/llama-3.3-70b-instruct:free',      'openrouter::google/gemini-flash-1.5:free',                 'openrouter'),
  ('support_problem',           'openrouter::google/gemini-2.0-flash-exp:free',            'openrouter::meta-llama/llama-3.3-70b-instruct:free',      'openrouter::google/gemini-flash-1.5:free',                 'openrouter'),
  ('support_solution',          'openrouter::nvidia/llama-3.1-nemotron-70b-instruct:free', 'openrouter::meta-llama/llama-3.3-70b-instruct:free',      'openrouter::google/gemini-2.0-flash-exp:free',             'openrouter'),
  ('support_generator',         'openrouter::nvidia/llama-3.1-nemotron-70b-instruct:free', 'openrouter::meta-llama/llama-3.3-70b-instruct:free',      'openrouter::google/gemini-2.0-flash-exp:free',             'openrouter'),
  ('sales_intent',              'openrouter::google/gemini-2.0-flash-exp:free',            'openrouter::meta-llama/llama-3.3-70b-instruct:free',      'openrouter::google/gemini-flash-1.5:free',                 'openrouter'),
  ('sales_conversation',        'openrouter::meta-llama/llama-3.3-70b-instruct:free',      'openrouter::google/gemini-2.0-flash-exp:free',            'openrouter::nvidia/llama-3.1-nemotron-70b-instruct:free',  'openrouter'),
  ('consulting_intent',         'openrouter::google/gemini-2.0-flash-exp:free',            'openrouter::meta-llama/llama-3.3-70b-instruct:free',      'openrouter::google/gemini-flash-1.5:free',                 'openrouter'),
  ('consulting_recommendation', 'openrouter::nvidia/llama-3.1-nemotron-70b-instruct:free', 'openrouter::meta-llama/llama-3.3-70b-instruct:free',      'openrouter::google/gemini-2.0-flash-exp:free',             'openrouter'),
  ('master_conversation',       'openrouter::meta-llama/llama-3.3-70b-instruct:free',      'openrouter::google/gemini-2.0-flash-exp:free',            'openrouter::nvidia/llama-3.1-nemotron-70b-instruct:free',  'openrouter'),
  ('db_query',                  'openrouter::nvidia/llama-3.1-nemotron-70b-instruct:free', 'openrouter::meta-llama/llama-3.3-70b-instruct:free',      'openrouter::google/gemini-2.0-flash-exp:free',             'openrouter'),
  ('kb_vector',                 'huggingface::BAAI/bge-m3',                                NULL,                                                      NULL,                                                       'huggingface'),
  ('connector',                 'openrouter::nvidia/llama-3.1-nemotron-70b-instruct:free', 'openrouter::meta-llama/llama-3.3-70b-instruct:free',      'openrouter::google/gemini-2.0-flash-exp:free',             'openrouter'),
  ('kb_signal_writer',          'openrouter::google/gemini-2.0-flash-exp:free',            'openrouter::meta-llama/llama-3.3-70b-instruct:free',      NULL,                                                       'openrouter')
) AS v(role, primary_model, fallback_1, fallback_2, provider)
CROSS JOIN (VALUES ('platform'), ('entity_free')) AS s(scope)
WHERE NOT EXISTS (
  SELECT 1 FROM "kibi_model_configs" k
  WHERE k.scope = s.scope AND k.model_role = v.role::kibi_model_role
);

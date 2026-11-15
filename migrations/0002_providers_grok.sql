-- Migrate provider_configs and generation_jobs from ('gemini','gpt','qwen','doubao') to ('gemini','gpt','grok')
-- Preserves existing users, sessions, credit_ledger, redeem_codes, and existing gemini/gpt configs & jobs.

CREATE TABLE provider_configs_new (
  provider_id TEXT PRIMARY KEY CHECK (provider_id IN ('gemini', 'gpt', 'grok')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  credit_cost INTEGER NOT NULL DEFAULT 10 CHECK (credit_cost >= 0),
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  custom_model TEXT NOT NULL DEFAULT '',
  api_key_encrypted TEXT NOT NULL DEFAULT '',
  api_key_hint TEXT NOT NULL DEFAULT '',
  params_json TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

INSERT INTO provider_configs_new (
  provider_id, enabled, credit_cost, base_url, model, custom_model,
  api_key_encrypted, api_key_hint, params_json, sort_order, updated_at
)
SELECT
  provider_id, enabled, credit_cost, base_url, model, custom_model,
  api_key_encrypted, api_key_hint, params_json, sort_order, updated_at
FROM provider_configs
WHERE provider_id IN ('gemini', 'gpt', 'grok');

DROP TABLE provider_configs;
ALTER TABLE provider_configs_new RENAME TO provider_configs;

CREATE TABLE generation_jobs_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'gpt', 'grok')),
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'succeeded', 'failed')),
  credits_cost INTEGER NOT NULL CHECK (credits_cost >= 0),
  credits_refunded INTEGER NOT NULL DEFAULT 0 CHECK (credits_refunded >= 0),
  prompt TEXT NOT NULL,
  recipe_summary TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL DEFAULT '3:4',
  style_preset TEXT NOT NULL DEFAULT 'none',
  snapshot_json TEXT NOT NULL,
  result_r2_key TEXT,
  result_mime TEXT,
  result_bytes INTEGER,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER,
  UNIQUE (user_id, idempotency_key)
);

INSERT INTO generation_jobs_new (
  id, user_id, idempotency_key, provider, model, status,
  credits_cost, credits_refunded, prompt, recipe_summary, aspect_ratio, style_preset,
  snapshot_json, result_r2_key, result_mime, result_bytes, error_message, created_at, finished_at
)
SELECT
  id, user_id, idempotency_key, provider, model, status,
  credits_cost, credits_refunded, prompt, recipe_summary, aspect_ratio, style_preset,
  snapshot_json, result_r2_key, result_mime, result_bytes, error_message, created_at, finished_at
FROM generation_jobs
WHERE provider IN ('gemini', 'gpt', 'grok');

DROP TABLE generation_jobs;
ALTER TABLE generation_jobs_new RENAME TO generation_jobs;

CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_time ON generation_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status_time ON generation_jobs(status, created_at DESC);

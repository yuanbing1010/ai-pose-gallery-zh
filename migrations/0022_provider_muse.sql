-- Expand provider_configs, provider_channels, model_profiles, and generation_jobs constraints to support 'muse' (Muse Image).
-- Preserves all existing data, indexes, and foreign key relationships.

CREATE TABLE provider_configs_new (
  provider_id TEXT PRIMARY KEY CHECK (provider_id IN ('gemini', 'gpt', 'grok', 'muse')),
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
FROM provider_configs;

DROP TABLE provider_configs;
ALTER TABLE provider_configs_new RENAME TO provider_configs;

CREATE TABLE provider_channels_new (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL CHECK (provider_id IN ('gemini', 'gpt', 'grok', 'muse')),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  model TEXT NOT NULL,
  custom_model TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 100,
  weight INTEGER NOT NULL DEFAULT 100 CHECK (weight >= 1),
  params_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  profile_id TEXT
);

INSERT INTO provider_channels_new (
  id, provider_id, supplier_id, name, enabled, model, custom_model,
  priority, weight, params_json, created_at, updated_at, profile_id
)
SELECT
  id, provider_id, supplier_id, name, enabled, model, custom_model,
  priority, weight, params_json, created_at, updated_at, profile_id
FROM provider_channels;

DROP TABLE provider_channels;
ALTER TABLE provider_channels_new RENAME TO provider_channels;

CREATE INDEX IF NOT EXISTS idx_provider_channels_route
  ON provider_channels(provider_id, enabled, priority DESC);
CREATE INDEX IF NOT EXISTS idx_provider_channels_supplier
  ON provider_channels(supplier_id);
CREATE INDEX IF NOT EXISTS idx_provider_channels_profile
  ON provider_channels(profile_id, enabled, priority DESC);

CREATE TABLE model_profiles_new (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL CHECK (provider_id IN ('gemini', 'gpt', 'grok', 'muse')),
  display_name TEXT NOT NULL,
  badge TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  credit_cost INTEGER NOT NULL DEFAULT 10 CHECK (credit_cost >= 0),
  default_resolution TEXT NOT NULL DEFAULT '2K' CHECK (default_resolution IN ('1K', '2K', '4K')),
  resolutions_json TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO model_profiles_new (
  id, provider_id, display_name, badge, tagline, enabled, is_default,
  credit_cost, default_resolution, resolutions_json, sort_order, created_at, updated_at
)
SELECT
  id, provider_id, display_name, badge, tagline, enabled, is_default,
  credit_cost, default_resolution, resolutions_json, sort_order, created_at, updated_at
FROM model_profiles;

DROP TABLE model_profiles;
ALTER TABLE model_profiles_new RENAME TO model_profiles;

CREATE INDEX IF NOT EXISTS idx_model_profiles_provider
  ON model_profiles(provider_id, sort_order ASC, created_at ASC);

CREATE TABLE generation_jobs_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'gpt', 'grok', 'muse')),
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'succeeded', 'failed', 'cancelled')),
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
  started_at INTEGER,
  finished_at INTEGER,
  channel_id TEXT,
  channel_name TEXT,
  supplier_id TEXT,
  supplier_name TEXT,
  trace_json TEXT,
  profile_id TEXT,
  profile_name TEXT,
  resolution TEXT,
  queue_payload_json TEXT,
  UNIQUE (user_id, idempotency_key)
);

INSERT INTO generation_jobs_new (
  id, user_id, idempotency_key, provider, model, status,
  credits_cost, credits_refunded, prompt, recipe_summary, aspect_ratio, style_preset,
  snapshot_json, result_r2_key, result_mime, result_bytes, error_message,
  created_at, started_at, finished_at,
  channel_id, channel_name, supplier_id, supplier_name,
  trace_json, profile_id, profile_name, resolution, queue_payload_json
)
SELECT
  id, user_id, idempotency_key, provider, model, status,
  credits_cost, credits_refunded, prompt, recipe_summary, aspect_ratio, style_preset,
  snapshot_json, result_r2_key, result_mime, result_bytes, error_message,
  created_at, started_at, finished_at,
  channel_id, channel_name, supplier_id, supplier_name,
  trace_json, profile_id, profile_name, resolution, queue_payload_json
FROM generation_jobs;

DROP TABLE generation_jobs;
ALTER TABLE generation_jobs_new RENAME TO generation_jobs;

CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_time ON generation_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status_time ON generation_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_queue_fifo ON generation_jobs(status, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_status ON generation_jobs(user_id, status);

-- Seed Muse slot & default brush profile if not present
INSERT OR IGNORE INTO provider_configs (
  provider_id, enabled, credit_cost, base_url, model, custom_model,
  api_key_encrypted, api_key_hint, params_json, sort_order, updated_at
) VALUES (
  'muse',
  1,
  10,
  'https://muse.geminirun.com/v1',
  'muse-image',
  '',
  '',
  '',
  '{"endpointMode":"muse_tasks","aspectRatio":"3:4","responseFormat":"b64_json"}',
  3,
  unixepoch() * 1000
);

INSERT OR IGNORE INTO model_profiles (
  id, provider_id, display_name, badge, tagline, enabled, is_default,
  credit_cost, default_resolution, resolutions_json, sort_order, created_at, updated_at
) VALUES (
  'prof_muse_default',
  'muse',
  '灵韵织画',
  '创意强',
  '中文理解细腻 · 光影氛围与创意绘染表现突出',
  1,
  1,
  10,
  '2K',
  '[]',
  0,
  unixepoch() * 1000,
  unixepoch() * 1000
);

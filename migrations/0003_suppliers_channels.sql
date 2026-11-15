-- Add suppliers and multi-channel routing (provider_channels) with priority + weight + failover.
-- Safely migrates existing configured provider_configs credentials into suppliers + provider_channels.

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL DEFAULT '',
  api_key_hint TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_suppliers_created ON suppliers(created_at DESC);

CREATE TABLE IF NOT EXISTS provider_channels (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL CHECK (provider_id IN ('gemini', 'gpt', 'grok')),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  model TEXT NOT NULL,
  custom_model TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 100,
  weight INTEGER NOT NULL DEFAULT 100 CHECK (weight >= 1),
  params_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_provider_channels_route
  ON provider_channels(provider_id, enabled, priority DESC);
CREATE INDEX IF NOT EXISTS idx_provider_channels_supplier
  ON provider_channels(supplier_id);

-- Preserve existing configured providers as initial suppliers + channels
INSERT OR IGNORE INTO suppliers (
  id, name, base_url, api_key_encrypted, api_key_hint, enabled, note, created_at, updated_at
)
SELECT
  'sup_' || provider_id,
  CASE provider_id
    WHEN 'gemini' THEN '默认 Gemini 供应商'
    WHEN 'gpt' THEN '默认 OpenAI 供应商'
    ELSE '默认 xAI 供应商'
  END,
  base_url,
  api_key_encrypted,
  api_key_hint,
  1,
  '由旧版单渠道配置自动迁移',
  updated_at,
  updated_at
FROM provider_configs
WHERE api_key_encrypted != '';

INSERT OR IGNORE INTO provider_channels (
  id, provider_id, supplier_id, name, enabled, model, custom_model,
  priority, weight, params_json, created_at, updated_at
)
SELECT
  'ch_' || provider_id || '_default',
  provider_id,
  'sup_' || provider_id,
  CASE provider_id
    WHEN 'gemini' THEN '默认 Gemini 渠道'
    WHEN 'gpt' THEN '默认 OpenAI 渠道'
    ELSE '默认 Grok 渠道'
  END,
  enabled,
  model,
  custom_model,
  100,
  100,
  params_json,
  updated_at,
  updated_at
FROM provider_configs
WHERE api_key_encrypted != '';

-- Track channel & supplier attribution on generation_jobs for admin auditing
ALTER TABLE generation_jobs ADD COLUMN channel_id TEXT;
ALTER TABLE generation_jobs ADD COLUMN channel_name TEXT;
ALTER TABLE generation_jobs ADD COLUMN supplier_id TEXT;
ALTER TABLE generation_jobs ADD COLUMN supplier_name TEXT;

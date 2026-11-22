-- Allow '1.5K' in model_profiles.default_resolution (used by ByteDance Seedream 5.5).
-- Preserves all existing columns (including default_model / default_custom_model from 0026), rows, and indexes.

CREATE TABLE model_profiles_new (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL CHECK (provider_id IN ('gemini', 'gpt', 'grok', 'muse', 'seedream')),
  display_name TEXT NOT NULL,
  badge TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  credit_cost INTEGER NOT NULL DEFAULT 10 CHECK (credit_cost >= 0),
  default_resolution TEXT NOT NULL DEFAULT '2K' CHECK (default_resolution IN ('1K', '1.5K', '2K', '4K')),
  resolutions_json TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  default_model TEXT NOT NULL DEFAULT '',
  default_custom_model TEXT NOT NULL DEFAULT ''
);

INSERT INTO model_profiles_new (
  id, provider_id, display_name, badge, tagline, enabled, is_default,
  credit_cost, default_resolution, resolutions_json, sort_order, created_at, updated_at,
  default_model, default_custom_model
)
SELECT
  id, provider_id, display_name, badge, tagline, enabled, is_default,
  credit_cost, default_resolution, resolutions_json, sort_order, created_at, updated_at,
  default_model, default_custom_model
FROM model_profiles;

DROP TABLE model_profiles;
ALTER TABLE model_profiles_new RENAME TO model_profiles;

CREATE INDEX IF NOT EXISTS idx_model_profiles_provider
  ON model_profiles(provider_id, sort_order ASC, created_at ASC);

-- Introduce model_profiles layer between provider_configs (artist families) and provider_channels (routing).
-- Allows each provider family to expose multiple user-selectable model profiles (e.g. Banana 2.1 & Banana Pro),
-- independent per-profile / per-resolution credit pricing, and strict channel isolation per profile.

CREATE TABLE IF NOT EXISTS model_profiles (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL CHECK (provider_id IN ('gemini', 'gpt', 'grok')),
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

CREATE INDEX IF NOT EXISTS idx_model_profiles_provider
  ON model_profiles(provider_id, sort_order ASC, created_at ASC);

ALTER TABLE provider_channels ADD COLUMN profile_id TEXT;

CREATE INDEX IF NOT EXISTS idx_provider_channels_profile
  ON provider_channels(profile_id, enabled, priority DESC);

ALTER TABLE generation_jobs ADD COLUMN profile_id TEXT;
ALTER TABLE generation_jobs ADD COLUMN profile_name TEXT;
ALTER TABLE generation_jobs ADD COLUMN resolution TEXT;

-- Backfill one default model profile per existing provider_configs row
INSERT OR IGNORE INTO model_profiles (
  id, provider_id, display_name, badge, tagline, enabled, is_default,
  credit_cost, default_resolution, resolutions_json, sort_order, created_at, updated_at
)
SELECT
  'prof_' || provider_id || '_default',
  provider_id,
  CASE provider_id
    WHEN 'gemini' THEN 'Nano Banana'
    WHEN 'gpt' THEN 'GPT Image'
    ELSE 'Grok 2.0'
  END,
  '',
  '',
  enabled,
  1,
  credit_cost,
  '2K',
  CASE provider_id
    WHEN 'gemini' THEN
      '[{"resolution":"1K","enabled":true,"creditCost":' || credit_cost || '},{"resolution":"2K","enabled":true,"creditCost":' || credit_cost || '},{"resolution":"4K","enabled":true,"creditCost":' || credit_cost || '}]'
    WHEN 'grok' THEN
      '[{"resolution":"1K","enabled":true,"creditCost":' || credit_cost || '},{"resolution":"2K","enabled":true,"creditCost":' || credit_cost || '}]'
    ELSE '[]'
  END,
  0,
  updated_at,
  updated_at
FROM provider_configs;

-- Attach all existing channels to their provider's default profile
UPDATE provider_channels
SET profile_id = 'prof_' || provider_id || '_default'
WHERE profile_id IS NULL;

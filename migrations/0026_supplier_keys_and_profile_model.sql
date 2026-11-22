-- Introduce multi-key pools per supplier (supplier_keys), channel key-scope binding (key_ids_json),
-- and canonical default model binding on brush profiles (model_profiles.default_model).

CREATE TABLE IF NOT EXISTS supplier_keys (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  api_key_encrypted TEXT NOT NULL,
  api_key_hint TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  cooldown_until INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  last_used_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_supplier_keys_supplier
  ON supplier_keys(supplier_id, enabled, created_at ASC);

-- Backfill existing supplier credentials into supplier_keys (idempotent)
INSERT OR IGNORE INTO supplier_keys (
  id, supplier_id, label, api_key_encrypted, api_key_hint, enabled,
  cooldown_until, last_error, last_used_at, created_at, updated_at
)
SELECT
  'key_' || id,
  id,
  '默认密钥',
  api_key_encrypted,
  api_key_hint,
  1,
  0,
  '',
  0,
  created_at,
  updated_at
FROM suppliers
WHERE api_key_encrypted != '';

-- Allow brush profiles to declare their canonical upstream model ID
ALTER TABLE model_profiles ADD COLUMN default_model TEXT NOT NULL DEFAULT '';
ALTER TABLE model_profiles ADD COLUMN default_custom_model TEXT NOT NULL DEFAULT '';

-- Backfill each brush profile's canonical model from its primary channel
UPDATE model_profiles
SET
  default_model = COALESCE(
    (
      SELECT c.model
      FROM provider_channels c
      WHERE c.profile_id = model_profiles.id
      ORDER BY c.enabled DESC, c.priority DESC, c.created_at ASC
      LIMIT 1
    ),
    ''
  ),
  default_custom_model = COALESCE(
    (
      SELECT c.custom_model
      FROM provider_channels c
      WHERE c.profile_id = model_profiles.id
      ORDER BY c.enabled DESC, c.priority DESC, c.created_at ASC
      LIMIT 1
    ),
    ''
  )
WHERE default_model = '';

-- Allow channels to optionally bind specific keys from the supplier's key pool ('[]' = all enabled keys)
ALTER TABLE provider_channels ADD COLUMN key_ids_json TEXT NOT NULL DEFAULT '[]';

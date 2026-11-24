-- Native OAuth subscription support for suppliers (OpenAI Codex OAuth & xAI Grok OAuth)

ALTER TABLE suppliers ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'api_key';

ALTER TABLE supplier_keys ADD COLUMN credential_type TEXT NOT NULL DEFAULT 'api_key';
ALTER TABLE supplier_keys ADD COLUMN oauth_expires_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE supplier_keys ADD COLUMN oauth_account_id TEXT NOT NULL DEFAULT '';
ALTER TABLE supplier_keys ADD COLUMN oauth_token_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS supplier_oauth_sessions (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  auth_mode TEXT NOT NULL,
  flow_type TEXT NOT NULL,
  device_code_encrypted TEXT NOT NULL DEFAULT '',
  user_code TEXT NOT NULL DEFAULT '',
  verification_uri TEXT NOT NULL DEFAULT '',
  code_verifier_encrypted TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  interval_sec INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_supplier_oauth_sessions_supplier
  ON supplier_oauth_sessions(supplier_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_supplier_oauth_sessions_expires
  ON supplier_oauth_sessions(expires_at);

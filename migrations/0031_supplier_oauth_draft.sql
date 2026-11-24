-- Allow draft OAuth sessions before a new supplier is saved, so admins can
-- complete OAuth authorization and save the supplier in a single modal.

CREATE TABLE supplier_oauth_sessions_new (
  id TEXT PRIMARY KEY,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE CASCADE,
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
  oauth_bundle_encrypted TEXT NOT NULL DEFAULT '',
  oauth_account_id TEXT NOT NULL DEFAULT '',
  oauth_account_hint TEXT NOT NULL DEFAULT '',
  oauth_expires_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

INSERT INTO supplier_oauth_sessions_new (
  id, supplier_id, auth_mode, flow_type, device_code_encrypted, user_code,
  verification_uri, code_verifier_encrypted, state, label, interval_sec,
  status, error_message, created_at, expires_at
)
SELECT
  id, supplier_id, auth_mode, flow_type, device_code_encrypted, user_code,
  verification_uri, code_verifier_encrypted, state, label, interval_sec,
  status, error_message, created_at, expires_at
FROM supplier_oauth_sessions;

DROP TABLE supplier_oauth_sessions;
ALTER TABLE supplier_oauth_sessions_new RENAME TO supplier_oauth_sessions;

CREATE INDEX IF NOT EXISTS idx_supplier_oauth_sessions_supplier
  ON supplier_oauth_sessions(supplier_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_supplier_oauth_sessions_expires
  ON supplier_oauth_sessions(expires_at);

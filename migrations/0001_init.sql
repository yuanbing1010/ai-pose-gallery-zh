-- Cloudflare D1 Schema for ai-pose-gallery-zh
-- Supports user auth, sessions, credit ledger, redeem codes, provider configs, R2 assets, and generation history.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_lower TEXT NOT NULL UNIQUE,
  email TEXT,
  email_lower TEXT UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  credit_balance INTEGER NOT NULL DEFAULT 0 CHECK (credit_balance >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_role_created ON users(role, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_configs (
  provider_id TEXT PRIMARY KEY CHECK (provider_id IN ('gemini', 'gpt', 'qwen', 'doubao')),
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

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('register_bonus', 'redeem_code', 'admin_adjust', 'generate_deduct', 'generate_refund')),
  ref_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  operator_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_time ON credit_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_time ON credit_ledger(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_unique_refund
  ON credit_ledger(type, ref_id)
  WHERE type = 'generate_refund';

CREATE TABLE IF NOT EXISTS redeem_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  credits INTEGER NOT NULL CHECK (credits > 0),
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0 AND used_count <= max_uses),
  expires_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_redeem_codes_created ON redeem_codes(created_at DESC);

CREATE TABLE IF NOT EXISTS redeem_claims (
  id TEXT PRIMARY KEY,
  code_id TEXT NOT NULL REFERENCES redeem_codes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credits INTEGER NOT NULL CHECK (credits > 0),
  created_at INTEGER NOT NULL,
  UNIQUE (code_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_redeem_claims_user ON redeem_claims(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'gpt', 'qwen', 'doubao')),
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

CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_time ON generation_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status_time ON generation_jobs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS uploaded_assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('portrait', 'costume', 'pose', 'extra', 'stitched')),
  mime_type TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  width INTEGER,
  height INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_uploaded_assets_user_time ON uploaded_assets(user_id, created_at DESC);

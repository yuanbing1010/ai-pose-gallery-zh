-- Add WeChat Open Platform OAuth accounts and single-use anti-CSRF OAuth states.

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('wechat_open')),
  openid TEXT NOT NULL,
  unionid TEXT,
  nickname TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (provider, openid),
  UNIQUE (user_id, provider)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_accounts_unionid
  ON oauth_accounts(provider, unionid)
  WHERE unionid IS NOT NULL AND unionid != '';

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user ON oauth_accounts(user_id);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  intent TEXT NOT NULL CHECK (intent IN ('login', 'bind')),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  return_to TEXT NOT NULL DEFAULT '/',
  cookie_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);

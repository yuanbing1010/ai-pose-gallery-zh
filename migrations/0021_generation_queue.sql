-- Expand generation_jobs status constraint to support background task queuing and cancellation,
-- add started_at (to distinguish queue wait time from execution time) and queue_payload_json.

CREATE TABLE generation_jobs_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'gpt', 'grok')),
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
  created_at, created_at, finished_at,
  channel_id, channel_name, supplier_id, supplier_name,
  trace_json, profile_id, profile_name, resolution, NULL
FROM generation_jobs;

DROP TABLE generation_jobs;
ALTER TABLE generation_jobs_new RENAME TO generation_jobs;

CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_time ON generation_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status_time ON generation_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_queue_fifo ON generation_jobs(status, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_status ON generation_jobs(user_id, status);

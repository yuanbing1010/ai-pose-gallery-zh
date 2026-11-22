-- Seed Muse2API supplier & default channel so /admin manages Muse natively alongside GPT/Grok/Gemini.
-- Uses env:MUSE_API_KEY reference resolved from Worker secret MUSE_API_KEY (never stores plaintext in DB).

INSERT OR IGNORE INTO suppliers (
  id, name, base_url, api_key_encrypted, api_key_hint, enabled, note, created_at, updated_at
) VALUES (
  'sup_muse',
  'Muse官方',
  'https://muse.geminirun.com/v1',
  'env:MUSE_API_KEY',
  'm2a_***f17b',
  1,
  'GCP 东京 muse2api 自建服务（默认引用 MUSE_API_KEY，也可随时在后台覆盖为独立密钥）',
  unixepoch() * 1000,
  unixepoch() * 1000
);

INSERT OR IGNORE INTO provider_channels (
  id, provider_id, profile_id, supplier_id, name, enabled, model, custom_model,
  priority, weight, params_json, created_at, updated_at
) VALUES (
  'ch_muse_default',
  'muse',
  'prof_muse_default',
  'sup_muse',
  'Muse官方',
  1,
  'muse-image',
  '',
  100,
  100,
  '{"endpointMode":"muse_tasks","aspectRatio":"3:4","responseFormat":"b64_json"}',
  unixepoch() * 1000,
  unixepoch() * 1000
);

-- Add full-chain execution audit trace JSON to generation_jobs
-- and reorder provider_configs slots to: gpt -> grok -> gemini.

ALTER TABLE generation_jobs ADD COLUMN trace_json TEXT;

UPDATE provider_configs
SET sort_order = CASE provider_id
  WHEN 'gpt' THEN 0
  WHEN 'grok' THEN 1
  WHEN 'gemini' THEN 2
  ELSE 99
END;

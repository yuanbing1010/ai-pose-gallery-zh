-- Persist auto/manual image-to-text descriptions for pose and costume references,
-- guaranteeing each unique reference image is transcribed at most once across retries.
CREATE TABLE IF NOT EXISTS reference_descriptions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('pose', 'costume')),
  ref_key TEXT NOT NULL,
  source_label TEXT NOT NULL DEFAULT '',
  preview_path TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'auto' CHECK (source_type IN ('auto', 'manual')),
  vision_model TEXT NOT NULL DEFAULT '',
  vision_supplier_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (kind, ref_key)
);

CREATE INDEX IF NOT EXISTS idx_reference_descriptions_kind_updated
  ON reference_descriptions(kind, updated_at DESC);

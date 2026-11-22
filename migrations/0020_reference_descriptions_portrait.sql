-- Expand reference_descriptions.kind constraint to support 'portrait' and 'extra'
-- so text_fallback can transcribe ALL reference images into pure text-to-image prompts.
CREATE TABLE reference_descriptions_next (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('pose', 'costume', 'portrait', 'extra')),
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

INSERT INTO reference_descriptions_next (
  id, kind, ref_key, source_label, preview_path, description,
  source_type, vision_model, vision_supplier_id, created_at, updated_at
)
SELECT
  id, kind, ref_key, source_label, preview_path, description,
  source_type, vision_model, vision_supplier_id, created_at, updated_at
FROM reference_descriptions;

DROP TABLE reference_descriptions;

ALTER TABLE reference_descriptions_next RENAME TO reference_descriptions;

CREATE INDEX IF NOT EXISTS idx_reference_descriptions_kind_updated
  ON reference_descriptions(kind, updated_at DESC);

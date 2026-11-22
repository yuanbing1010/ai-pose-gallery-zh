-- Persist selected upstream model IDs discovered from each supplier's /models endpoint.
ALTER TABLE suppliers ADD COLUMN models_json TEXT NOT NULL DEFAULT '[]';

-- Add admin-only internal identification note to users (never exposed to regular user endpoints).

ALTER TABLE users ADD COLUMN admin_note TEXT NOT NULL DEFAULT '';

-- Infinite Canvas v2 cloud-synced projects per authenticated user
CREATE TABLE IF NOT EXISTS canvas_projects (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  bg_pattern TEXT NOT NULL DEFAULT 'dots',
  pan_x REAL NOT NULL DEFAULT 80,
  pan_y REAL NOT NULL DEFAULT 60,
  zoom REAL NOT NULL DEFAULT 0.92,
  payload_json TEXT NOT NULL,
  node_count INTEGER NOT NULL DEFAULT 0,
  edge_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canvas_projects_user_updated
  ON canvas_projects (user_id, updated_at DESC);

-- Phase 1 & 2 Schema for Prompt Gallery (Public & Personal Gallery + X Prompt Sync)
-- Pre-moderation workflow: user submissions default to 'pending', require admin approval to become 'published'.

CREATE TABLE IF NOT EXISTS gallery_items (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('user_t2i', 'user_recipe', 'x_sync')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected', 'hidden')),
  author_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL DEFAULT '',
  source_job_id TEXT REFERENCES generation_jobs(id) ON DELETE SET NULL,
  x_tweet_id TEXT,
  x_author_handle TEXT,
  x_author_name TEXT,
  x_author_avatar TEXT,
  x_tweet_url TEXT,
  title TEXT NOT NULL DEFAULT '',
  prompt_text TEXT NOT NULL DEFAULT '',
  prompt_zh TEXT NOT NULL DEFAULT '',
  prompt_public INTEGER NOT NULL DEFAULT 1 CHECK (prompt_public IN (0, 1)),
  recipe_public_json TEXT,
  aspect_ratio TEXT NOT NULL DEFAULT '3:4',
  width INTEGER,
  height INTEGER,
  profile_name TEXT,
  style_preset TEXT NOT NULL DEFAULT 'none',
  image_r2_key TEXT NOT NULL,
  thumb_r2_key TEXT,
  image_mime TEXT NOT NULL DEFAULT 'image/webp',
  image_bytes INTEGER NOT NULL DEFAULT 0,
  tags_json TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL DEFAULT '',
  like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  bookmark_count INTEGER NOT NULL DEFAULT 0 CHECK (bookmark_count >= 0),
  comment_count INTEGER NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  remix_count INTEGER NOT NULL DEFAULT 0 CHECK (remix_count >= 0),
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
  review_note TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gallery_items_x_tweet
  ON gallery_items(x_tweet_id)
  WHERE x_tweet_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gallery_items_source_job
  ON gallery_items(source_job_id)
  WHERE source_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gallery_items_status_published
  ON gallery_items(status, is_featured DESC, published_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gallery_items_author_time
  ON gallery_items(author_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gallery_items_source_status
  ON gallery_items(source_type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gallery_items_category_status
  ON gallery_items(category, status, published_at DESC);

CREATE TABLE IF NOT EXISTS gallery_likes (
  item_id TEXT NOT NULL REFERENCES gallery_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_gallery_likes_user ON gallery_likes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gallery_bookmarks (
  item_id TEXT NOT NULL REFERENCES gallery_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_gallery_bookmarks_user ON gallery_bookmarks(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gallery_comments (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES gallery_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reply_to_id TEXT REFERENCES gallery_comments(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'deleted', 'hidden')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gallery_comments_item ON gallery_comments(item_id, status, created_at ASC);

CREATE TABLE IF NOT EXISTS x_sync_sources (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  auto_publish INTEGER NOT NULL DEFAULT 0 CHECK (auto_publish IN (0, 1)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  note TEXT NOT NULL DEFAULT '',
  last_tweet_id TEXT,
  last_synced_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

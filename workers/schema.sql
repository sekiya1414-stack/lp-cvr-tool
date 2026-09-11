-- lp-cvr-tool フェーズ2: D1スキーマ
-- 適用方法: npx wrangler d1 execute lp-cvr-tool-db --file=./schema.sql (--remote を付けると本番へ適用)

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  variant TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'view' | 'click' | 'cv' など
  meta TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_project_variant ON events (project, variant);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events (created_at);

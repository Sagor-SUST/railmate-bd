CREATE TABLE IF NOT EXISTS journeys (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  travel_date TEXT NOT NULL,
  train TEXT,
  seat_class TEXT,
  release_at TEXT NOT NULL,
  release_is_estimate INTEGER NOT NULL DEFAULT 1,
  lead_minutes INTEGER NOT NULL DEFAULT 30,
  notify_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  last_error TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_due ON journeys (status, notify_at);
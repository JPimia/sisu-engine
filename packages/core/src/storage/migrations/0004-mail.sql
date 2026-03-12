CREATE TABLE IF NOT EXISTS mail (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  payload JSONB,
  work_item_id TEXT,
  plan_id TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS execution_plans (
  id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL,
  workflow_template_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

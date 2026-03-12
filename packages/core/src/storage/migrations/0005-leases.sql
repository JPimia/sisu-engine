CREATE TABLE IF NOT EXISTS leases (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  role TEXT NOT NULL,
  work_item_id TEXT,
  plan_id TEXT,
  model TEXT NOT NULL,
  token_usage JSONB NOT NULL DEFAULT '{"inputTokens":0,"outputTokens":0,"cacheCreationTokens":0,"cacheReadTokens":0}'::jsonb,
  last_heartbeat TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

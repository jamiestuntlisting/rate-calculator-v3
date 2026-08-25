-- Migration number: 0002 	 App configuration key/value store.
-- Currently holds SESSION_SECRET as a fallback when the Worker has no
-- SESSION_SECRET environment secret (see src/lib/session-secret.ts).

CREATE TABLE app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

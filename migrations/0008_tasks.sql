-- Migration number: 0008 	 The work that still needs doing.
-- The open-work list lived only in CLAUDE.md, so it went stale between
-- sessions and could not be read or changed from a phone. Keeping it here
-- makes it one editable list. `owner` separates work a Claude session can
-- finish from work that needs a key, an install or a real-world answer only
-- James can supply, so the blocked items stop looking like available ones.

CREATE TABLE tasks (
  _id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'blocked', 'done')),
  owner TEXT NOT NULL DEFAULT 'claude' CHECK (owner IN ('claude', 'james')),
  -- Lower sorts first, so the list keeps a deliberate order rather than
  -- whatever order rows happened to be written in.
  position INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX idx_tasks_status ON tasks(status, position);

-- Seeded from the open-work list as it stood on 2026-08-26. Ids are literal
-- because a migration cannot call crypto.randomUUID().
INSERT INTO tasks (_id, title, detail, status, owner, position, createdAt, updatedAt) VALUES
  ('8f3c1d20-0000-4000-8000-000000000001',
   'ShowBiz CSV import + weekly test bench',
   'Admin-only: upload a ShowBiz export, run the weekly engine against every card and show the diffs. Parser and engine both exist and are verified.',
   'open', 'claude', 10, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('8f3c1d20-0000-4000-8000-000000000002',
   'Weekly calculator UI',
   'The weekly engine has no front end yet. Needs to work at 390px.',
   'open', 'claude', 20, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('8f3c1d20-0000-4000-8000-000000000003',
   'Stripe billing',
   'Plans are defined and tier resolution already prefers Stripe. Needs a restricted STRIPE_SECRET_KEY (read on customers, subscriptions, products) and the price ids for Plus and the transcription add-on. The $15 per-Exhibit-G price is a placeholder James has not confirmed.',
   'blocked', 'james', 30, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('8f3c1d20-0000-4000-8000-000000000004',
   'Historical rate schedules',
   'Rates are a single current set, so a 2021 work day is calculated at 2026 rates. Records go back years. Needs the historical SAG-AFTRA schedules as data — guessing them would silently misstate pay.',
   'open', 'claude', 40, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('8f3c1d20-0000-4000-8000-000000000005',
   'Weekly overtime absorption threshold',
   'Bounded by the sample to an adjusted weekly rate between $5,646 and $7,146, not pinned. See OVERTIME_ABSORPTION_NOTE. If James learns the real rule it is one constant.',
   'blocked', 'james', 50, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('8f3c1d20-0000-4000-8000-000000000006',
   'StuntListing org GitHub access',
   'The shared rate-calculator repo is under the StuntListing org, which the Claude GitHub app is not installed on, so it can only be reached by uploading a zip. An org owner installing the app at github.com/apps/claude/installations/new fixes it permanently.',
   'blocked', 'james', 60, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('8f3c1d20-0000-4000-8000-000000000007',
   'Rotate the credentials pasted into chat',
   'The Mongo password (jamie_db_user) can just be deleted now MongoDB is retired; the cfut_ Cloudflare API token needs rotating at dash.cloudflare.com/profile/api-tokens.',
   'blocked', 'james', 70, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('8f3c1d20-0000-4000-8000-000000000008',
   'Delete the stray Cloudflare account, worker and Vercel project',
   'A second Cloudflare account briefly held a duplicate database and bucket — that mismatch caused days of "database not found" errors. Also delete the orphaned rate-calculator-v3 worker and pause or delete the retired Vercel project.',
   'blocked', 'james', 80, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z'),
  ('8f3c1d20-0000-4000-8000-000000000009',
   'Re-sync the 07/01/2026 rates upstream',
   'src/lib/rate-calculator/ is a vendored copy of StuntListing/rate-calculator. Rates here are the 07/01/2026 schedule ($1,283/day); the source repo still has 2025 rates, so the next sync would silently revert them. Blocked on the org GitHub access above.',
   'blocked', 'james', 90, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z');

-- Migration number: 0015 	 Names get a review state.
-- pending: entered by a performer, not yet looked at. approved: an admin
-- says this is the real spelling — the approved tabs are the monitoring
-- view. ignored: an admin says we are not curating this one (most
-- character names — one-off roles are not worth correcting). Blocking
-- stays the separate, stronger thing it was: a blocked spelling is
-- corrected to its replacement wherever anyone types it.
--
-- The standard stunt roles arrive pre-approved: they are the character
-- names worth suggesting, and typing should autocomplete onto them.

ALTER TABLE name_suggestions ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'approved', 'ignored'));

INSERT INTO name_suggestions (kind, name, blocked, replacement, status, createdAt, updatedAt)
VALUES
  ('character', 'Stunt Performer',   0, NULL, 'approved', datetime('now'), datetime('now')),
  ('character', 'Stunt Double',      0, NULL, 'approved', datetime('now'), datetime('now')),
  ('character', 'Stunt Coordinator', 0, NULL, 'approved', datetime('now'), datetime('now')),
  ('character', 'Stunt Rigger',      0, NULL, 'approved', datetime('now'), datetime('now')),
  ('character', 'Stunt Driver',      0, NULL, 'approved', datetime('now'), datetime('now')),
  ('character', 'Utility Stunts',    0, NULL, 'approved', datetime('now'), datetime('now')),
  ('character', 'ND Stunt',          0, NULL, 'approved', datetime('now'), datetime('now'))
ON CONFLICT(kind, name) DO UPDATE SET status = 'approved', updatedAt = datetime('now');

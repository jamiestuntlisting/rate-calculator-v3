-- Migration number: 0026 	 What kind of file an upload is.
-- A member can send a PDF call sheet as well as an Exhibit G, and a
-- call sheet starts a work day too — but it is not transcribed, so it
-- must not sit in the pile or count as a to-do. `kind` says which it
-- is (exhibit_g | call_sheet | other); a PDF arrives as a call sheet,
-- an image as an Exhibit G, and either can be reclassified from the
-- pile or from the day's Photos & Documents. The linked work record's
-- document carries the same type.
ALTER TABLE g_uploads ADD COLUMN kind TEXT NOT NULL DEFAULT 'exhibit_g';
CREATE INDEX idx_g_uploads_kind ON g_uploads(userId, kind);

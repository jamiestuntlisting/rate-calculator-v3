-- Migration number: 0032 	 Audit a show.
-- An audit is its own world: a show, the performers involved, a note,
-- and every Exhibit G from the run. Its uploads sit in g_uploads with
-- auditId set and no work record, so they never appear on anyone's
-- tracker, pile or the transcription queue; the admin who opened the
-- audit owns them, which is what lets the transcription view open them.
CREATE TABLE IF NOT EXISTS audits (
  _id TEXT PRIMARY KEY,
  createdBy TEXT NOT NULL,
  showName TEXT NOT NULL,
  performers TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
ALTER TABLE g_uploads ADD COLUMN auditId TEXT;
CREATE INDEX IF NOT EXISTS idx_g_uploads_audit ON g_uploads(auditId);

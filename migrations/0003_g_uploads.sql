-- Migration number: 0003 	 Exhibit G image uploads and their transcriptions.
-- Image bytes live in R2 (key = `filename`); this table holds the metadata,
-- the non-destructive rotation, and the transcription grid once entered.

CREATE TABLE g_uploads (
  _id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  filename TEXT NOT NULL,
  originalName TEXT NOT NULL,
  contentType TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  -- SHA-256 of the file bytes; uniqueness is per user so two performers can
  -- both upload the same call sheet.
  sha256 TEXT NOT NULL,
  rotation INTEGER NOT NULL DEFAULT 0,
  transcription TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_g_uploads_user_hash ON g_uploads(userId, sha256);
CREATE INDEX idx_g_uploads_userId ON g_uploads(userId, createdAt DESC);

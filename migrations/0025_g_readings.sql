-- Migration number: 0025 	 Claude's reading of an Exhibit G, and how it scored.
-- For test users only (src/lib/test-users.ts): when their G lands, the
-- top model reads the performer's row off the card and the transcription
-- form opens pre-filled from it. When the performer marks the G done,
-- each field Claude read is scored against what they finally saved, so
-- a batting average can be kept per field and per prompt version, and
-- the prompt tuned against it. Save is never scored; only Done is.

CREATE TABLE g_readings (
  _id TEXT PRIMARY KEY,
  gUploadId TEXT NOT NULL,
  userId TEXT NOT NULL,
  -- The model asked for, and the one that answered (a refusal fallback
  -- could differ; the analytics separate them).
  model TEXT NOT NULL,
  servedModel TEXT,
  -- Which rule book the reading was made with; the prompt carries a
  -- version so readings under different instructions compare apart.
  promptVersion TEXT NOT NULL,
  -- The row as read, JSON (src/lib/g-reader/schema.ts); NULL on error.
  reading TEXT,
  error TEXT,
  durationMs INTEGER,
  inputTokens INTEGER,
  outputTokens INTEGER,
  createdAt TEXT NOT NULL
);
CREATE INDEX idx_g_readings_upload ON g_readings(gUploadId, createdAt DESC);
CREATE INDEX idx_g_readings_user ON g_readings(userId, createdAt DESC);

CREATE TABLE g_reading_scores (
  _id TEXT PRIMARY KEY,
  readingId TEXT NOT NULL,
  gUploadId TEXT NOT NULL,
  userId TEXT NOT NULL,
  promptVersion TEXT NOT NULL,
  field TEXT NOT NULL,
  readValue TEXT,
  finalValue TEXT,
  -- exact | small | meridiem | large | missed | spurious | blank
  -- (src/lib/g-reader/score.ts says what each means).
  outcome TEXT NOT NULL,
  -- Minutes for a time, dollars for money, signed final − read; NULL
  -- where a difference has no size (text, a miss).
  delta REAL,
  scoredAt TEXT NOT NULL
);
CREATE INDEX idx_g_reading_scores_reading ON g_reading_scores(readingId);
CREATE INDEX idx_g_reading_scores_user ON g_reading_scores(userId, scoredAt DESC);

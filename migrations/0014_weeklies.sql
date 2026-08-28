-- Migration number: 0014 	 A saved weekly: days grouped into one contract.
-- /weekly works a week out; saving it makes the grouping real. The terms
-- the questionnaire established live on the weekly row, each member day
-- points back at it through work_records.weeklyId, and the tracker shows
-- the days folded under one collapsible header instead of scattered.

CREATE TABLE weeklies (
  _id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  title TEXT NOT NULL,
  weekStart TEXT NOT NULL,            -- "YYYY-MM-DD" the week runs from
  weekStartsOn INTEGER NOT NULL DEFAULT 1,
  agreement TEXT NOT NULL DEFAULT 'theatrical_basic',
  weeklyRate REAL NOT NULL,           -- the deal; scale comes from the agreement
  distantLocation INTEGER NOT NULL DEFAULT 0,
  expectedAmount REAL NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX idx_weeklies_user ON weeklies(userId, weekStart);

ALTER TABLE work_records ADD COLUMN weeklyId TEXT;

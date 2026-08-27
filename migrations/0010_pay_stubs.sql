-- Migration number: 0010 	 Transcribed pay stubs.
-- A stub is laid out in three columns — what the payment was for, the hours
-- it covered, and the money — so it is stored that way. A shortfall can then
-- be pointed at a line rather than left as a difference in a total.
--
-- It gets its own table because a stub does not always belong to a day: on a
-- weekly contract it covers the week, and the week is not a stored record,
-- so it is identified by the Sunday it runs from instead.

CREATE TABLE pay_stubs (
  _id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('day', 'week')),
  -- Set when scope = 'day'.
  workRecordId TEXT,
  -- "YYYY-MM-DD" of the Sunday, set when scope = 'week'.
  weekStart TEXT,
  showName TEXT NOT NULL DEFAULT '',
  -- [{ label, hours, amount }] as read off the stub.
  lineItems TEXT NOT NULL DEFAULT '[]',
  total REAL NOT NULL DEFAULT 0,
  -- The photograph of the stub itself.
  documents TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX idx_pay_stubs_user ON pay_stubs(userId, createdAt DESC);
CREATE INDEX idx_pay_stubs_record ON pay_stubs(workRecordId);
CREATE INDEX idx_pay_stubs_week ON pay_stubs(userId, weekStart);

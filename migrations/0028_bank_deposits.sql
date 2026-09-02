-- Migration number: 0028 	 Bank deposits via Plaid (a feature under test).
-- A tester connects a bank account, view only; deposits above a floor
-- are pulled and each is matched to the calculated pay it lines up
-- with — a day's expected amount, a weekly's, or a residual — and how
-- far the deposit fell from the expected pay date. The Plaid access
-- token is stored here; it can only read transactions, never move
-- money, and a connection can be removed from the page.
CREATE TABLE bank_connections (
  _id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  itemId TEXT NOT NULL,
  accessToken TEXT NOT NULL,
  institution TEXT,
  cursor TEXT,
  lastSyncedAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX idx_bank_connections_user ON bank_connections(userId);

CREATE TABLE bank_deposits (
  _id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  connectionId TEXT NOT NULL,
  transactionId TEXT NOT NULL UNIQUE,
  accountId TEXT,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  name TEXT,
  pending INTEGER NOT NULL DEFAULT 0,
  -- day | weekly | residual | unmatched
  matchKind TEXT NOT NULL DEFAULT 'unmatched',
  matchId TEXT,
  matchLabel TEXT,
  expectedAmount REAL,
  expectedDate TEXT,
  daysOff INTEGER,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX idx_bank_deposits_user ON bank_deposits(userId, date DESC);

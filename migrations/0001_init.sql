-- Migration number: 0001 	 Initial schema for StuntListing Bookkeeper on Cloudflare D1.
-- Mirrors the previous Mongoose models. IDs are UUID strings kept in `_id`
-- so API payload shapes stay identical to the MongoDB era. Dates are stored
-- as ISO-8601 UTC strings (sortable with plain string comparison). Booleans
-- are INTEGER 0/1. Nested structures (documents, calculation, photos) are
-- JSON-encoded TEXT columns.

CREATE TABLE users (
  _id TEXT PRIMARY KEY,
  stuntlistingUserId TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  firstName TEXT NOT NULL DEFAULT '',
  lastName TEXT NOT NULL DEFAULT '',
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'standard', 'plus')),
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  lastLogin TEXT,
  stlAccessToken TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX idx_users_email ON users(email);

-- userId is intentionally nullable: legacy imports may carry orphaned rows,
-- and POST /api/auth/migrate re-attaches them to a user.
CREATE TABLE work_records (
  _id TEXT PRIMARY KEY,
  userId TEXT,
  workType TEXT NOT NULL DEFAULT 'sag_aftra',
  otherWorkCategory TEXT,
  showName TEXT NOT NULL,
  workDate TEXT NOT NULL,
  callTime TEXT,
  dismissOnSet TEXT,
  dismissMakeupWardrobe TEXT,
  ndMealIn TEXT,
  ndMealOut TEXT,
  firstMealStart TEXT,
  firstMealFinish TEXT,
  secondMealStart TEXT,
  secondMealFinish TEXT,
  stuntAdjustment REAL NOT NULL DEFAULT 0,
  forcedCall INTEGER NOT NULL DEFAULT 0,
  isSixthDay INTEGER NOT NULL DEFAULT 0,
  isSeventhDay INTEGER NOT NULL DEFAULT 0,
  isHoliday INTEGER NOT NULL DEFAULT 0,
  workStatus TEXT,
  characterName TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  recordStatus TEXT NOT NULL DEFAULT 'complete',
  documents TEXT NOT NULL DEFAULT '[]',
  calculation TEXT,
  paymentStatus TEXT NOT NULL DEFAULT 'unpaid',
  paidAmount REAL NOT NULL DEFAULT 0,
  paidDate TEXT,
  expectedAmount REAL NOT NULL DEFAULT 0,
  paymentDueDate TEXT,
  missingExhibitG INTEGER NOT NULL DEFAULT 0,
  photos TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX idx_work_records_userId ON work_records(userId);
CREATE INDEX idx_work_records_workDate ON work_records(workDate DESC);
CREATE INDEX idx_work_records_showName ON work_records(showName);
CREATE INDEX idx_work_records_paymentStatus ON work_records(paymentStatus);
CREATE INDEX idx_work_records_recordStatus ON work_records(recordStatus);

CREATE TABLE residual_imports (
  _id TEXT PRIMARY KEY,
  userId TEXT,
  performerName TEXT NOT NULL,
  filename TEXT NOT NULL,
  totalChecks INTEGER NOT NULL DEFAULT 0,
  totalGross REAL NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX idx_residual_imports_userId ON residual_imports(userId);
CREATE INDEX idx_residual_imports_performerName ON residual_imports(performerName);

-- One row per residual check; `seq` preserves original CSV row order.
CREATE TABLE residual_checks (
  _id TEXT PRIMARY KEY,
  importId TEXT NOT NULL REFERENCES residual_imports(_id) ON DELETE CASCADE,
  seq INTEGER NOT NULL DEFAULT 0,
  sagAftraId TEXT NOT NULL DEFAULT '',
  payeeName TEXT NOT NULL DEFAULT '',
  payeeType TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  payrollHouse TEXT NOT NULL DEFAULT '',
  productionTitle TEXT NOT NULL,
  checkStatus TEXT NOT NULL DEFAULT '',
  checkStatusDate TEXT NOT NULL DEFAULT '',
  checkNumber TEXT NOT NULL DEFAULT '',
  checkDate TEXT NOT NULL DEFAULT '',
  grossAmount REAL NOT NULL DEFAULT 0,
  netAmount REAL NOT NULL DEFAULT 0,
  receivedDate TEXT NOT NULL DEFAULT '',
  donated TEXT NOT NULL DEFAULT '',
  prodTitleGrossAmt REAL NOT NULL DEFAULT 0
);

CREATE INDEX idx_residual_checks_importId ON residual_checks(importId);
CREATE INDEX idx_residual_checks_productionTitle ON residual_checks(productionTitle);

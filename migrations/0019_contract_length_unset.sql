-- A day that never stated a contract length is not the same as a day
-- deliberately set Daily. The first can be pulled into a weekly (and its
-- contract updated); the second was decided and stays out of the weekly
-- picker. The old NOT NULL DEFAULT 'daily' made every untouched day read
-- as decided, which kept ordinary logged days out of weeklies. NULL now
-- means "never stated". Existing 'daily' rows all came from the default,
-- so they reset to NULL; a deliberate Daily is set from the record page,
-- which now writes it explicitly.
ALTER TABLE work_records ADD COLUMN contractLengthNew TEXT
  CHECK (contractLengthNew IN ('daily', 'three_day', 'weekly'));

UPDATE work_records SET contractLengthNew =
  CASE WHEN contractLength = 'daily' THEN NULL ELSE contractLength END;

ALTER TABLE work_records DROP COLUMN contractLength;

ALTER TABLE work_records RENAME COLUMN contractLengthNew TO contractLength;

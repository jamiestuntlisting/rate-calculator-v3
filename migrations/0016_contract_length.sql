-- Migration number: 0016 	 How long the deal runs: a day, three days, a week.
-- The weekly flag was a checkbox; television also employs three-day
-- players (the ShowBiz sample has them), so the length is a proper enum.
-- weeklyContract stays, kept in step, because the weekly page and the
-- tracker grouping already read it.

ALTER TABLE work_records ADD COLUMN contractLength TEXT NOT NULL DEFAULT 'daily'
  CHECK (contractLength IN ('daily', 'three_day', 'weekly'));

UPDATE work_records SET contractLength = 'weekly' WHERE weeklyContract = 1;

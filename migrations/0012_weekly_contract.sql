-- Migration number: 0012 	 A day that belongs to a weekly contract.
-- The day still logs its times and still gets a daily calculation (the
-- weekly derivation needs its overtime hours), but the money it is owed
-- comes from the week it folds into on /weekly, not from the day alone.
-- The flag says which kind of deal the day was worked under.

ALTER TABLE work_records ADD COLUMN weeklyContract INTEGER NOT NULL DEFAULT 0;

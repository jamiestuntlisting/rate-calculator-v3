-- Migration number: 0009 	 More than one contract on the same day.
-- A performer who works two productions in a day signs two contracts and is
-- owed for both: the first is calculated in full, and each one after it adds
-- the day rate minimum. `contracts` counts every contract worked that day,
-- including the calculated one, so 1 is the ordinary case and the default.
--
-- The exception is a multiple-episode weekly, where the episodes already sit
-- inside the weekly guarantee and must not stack on top of it.

ALTER TABLE work_records ADD COLUMN contracts INTEGER NOT NULL DEFAULT 1;
ALTER TABLE work_records ADD COLUMN multipleEpisodeWeekly INTEGER NOT NULL DEFAULT 0;

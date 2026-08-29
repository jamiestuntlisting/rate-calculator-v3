-- A saved contract group is not always a weekly: a 3-day (TV) contract
-- groups days the same way and is paid as one check the same way, so it
-- rides the same table with a kind.
ALTER TABLE weeklies ADD COLUMN kind TEXT NOT NULL DEFAULT 'weekly';

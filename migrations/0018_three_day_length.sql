-- A 3-day (TV) contract's rate depends on the show's format — ½ & 1-hour
-- shows pay one 3-day figure, 1½ & 2-hour shows another — so a day logged
-- on a 3-day contract remembers which it was.
ALTER TABLE work_records ADD COLUMN threeDayLength TEXT;

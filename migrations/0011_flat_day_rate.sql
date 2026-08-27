-- Migration number: 0011 	 A day rate that is not one of the schedules.
-- Most work is on a published SAG-AFTRA minimum, and `workStatus` names
-- which one. A flat deal names its own number instead: given a flatDayRate,
-- it replaces the schedule's daily rate and everything else — overtime
-- tiers, the stunt adjustment, meal penalties — is worked out from it as
-- normal. NULL means the schedule applies, which is the ordinary case.

ALTER TABLE work_records ADD COLUMN flatDayRate REAL;

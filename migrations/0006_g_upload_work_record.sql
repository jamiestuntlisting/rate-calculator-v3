-- Migration number: 0006 	 Link each Exhibit G to a work record.
-- An Exhibit G is one work day, so every upload gets a row in the tracker.
-- Transcribing the G fills that row in; until then it sits as an
-- attachment-only record dated the day it was uploaded.

ALTER TABLE g_uploads ADD COLUMN workRecordId TEXT;

-- Migration number: 0029 	 A Google Calendar work log per member.
-- The company's Google account (a service account) owns one calendar
-- per member — "Jamie Northrup — StuntListing Work Log" — shared to the
-- member by invitation, read only. Every logged day is mirrored there
-- as an all-day event; the app's work_records stay the truth and the
-- event id rides the row so an edit updates the same event.
ALTER TABLE users ADD COLUMN calendarId TEXT;
ALTER TABLE users ADD COLUMN calendarSharedAt TEXT;
ALTER TABLE work_records ADD COLUMN googleEventId TEXT;

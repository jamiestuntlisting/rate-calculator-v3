-- Small per-user UI preferences as one JSON object (first key:
-- transcribeTimeOrder — whether the transcription page runs its time
-- fields in day order or in the card's column order). NULL means every
-- default; the shape is owned by src/lib/repos/users.ts.
ALTER TABLE users ADD COLUMN prefs TEXT;

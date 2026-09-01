-- A transcription being saved and a transcription being FINISHED are
-- different things: partial saves are supported and expected ("even
-- just the date"), so the moment the member declares the card done gets
-- its own column. NULL means still in progress, or never started.
ALTER TABLE g_uploads ADD COLUMN transcribedAt TEXT;

-- Backfill: transcriptions saved before the mark existed count as done
-- when they carry both ends of the day — the same bar a work record
-- meets to be called complete. Anything thinner stays in progress.
UPDATE g_uploads
SET transcribedAt = updatedAt
WHERE transcription IS NOT NULL
  AND COALESCE(json_extract(transcription, '$.rows[0].callTime'), '') != ''
  AND COALESCE(json_extract(transcription, '$.rows[0].dismissOnSet'), '') != '';

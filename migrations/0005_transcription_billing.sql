-- Migration number: 0005 	 How a member pays for transcription.
-- 'monthly' = the flat add-on (unlimited Exhibit Gs); 'per_g' = charged for
-- each Exhibit G we transcribe. NULL means they transcribe their own.

ALTER TABLE users ADD COLUMN transcriptionBilling TEXT;

-- Migration number: 0013 	 "Do the typing for me", recorded.
-- A member who bulk-uploads a backlog can ask us to transcribe it. The ask
-- has to live somewhere the admin queue can see, so it is a flag on the
-- upload itself. Billing is users.transcriptionBilling and is not changed
-- by asking — nothing is charged until Stripe is wired.

ALTER TABLE g_uploads ADD COLUMN transcriptionRequested INTEGER NOT NULL DEFAULT 0;

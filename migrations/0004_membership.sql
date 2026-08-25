-- Migration number: 0004 	 Self-service membership selection.
-- `tierOverride` is a manually chosen tier that wins over what Stripe or the
-- StuntListing profile reports — used while memberships are set by hand and
-- no payment is collected. `transcriptionAddOn` is the paid add-on where we
-- transcribe a performer's Exhibit Gs and run the calculations for them.

ALTER TABLE users ADD COLUMN tierOverride TEXT;
ALTER TABLE users ADD COLUMN transcriptionAddOn INTEGER NOT NULL DEFAULT 0;

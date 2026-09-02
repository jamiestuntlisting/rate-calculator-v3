-- Migration number: 0024 	 Who a stunt double stood in for.
-- When the character on a day is a stunt double, the form asks for the
-- actor doubled; it is the line a résumé and a StuntListing profile want
-- ("doubled Adam Sandler"), and a card never carries it. NULL on every
-- other kind of day.
ALTER TABLE work_records ADD COLUMN actorDoubled TEXT;

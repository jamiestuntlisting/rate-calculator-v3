-- Migration number: 0030 	 A thumbnail per upload.
-- The pile and the admin queue showed every card through its original
-- photo, 2–5 MB each, and a phone asked for 59 of them at 40px gave up
-- on most (iOS drops images it cannot afford to decode). A small JPEG
-- copy — 320 px on its long edge — lives in R2 under thumbs/<filename>;
-- this column is its key, NULL until one has been made. Thumbnails are
-- made in the browser by whoever first lists the file (the owner on the
-- pile, an admin on the queue), so files that arrived by text or email
-- get one too.
ALTER TABLE g_uploads ADD COLUMN thumbnail TEXT;

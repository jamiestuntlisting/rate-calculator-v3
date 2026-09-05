-- Migration number: 0031 	 An IMDb title id per show.
-- The IMDb pages look a show up on IMDb and keep its tt… id here, on
-- the show's name row, so a member's credits can link the title and
-- the contribution form can be handed the right one. A member's own
-- nm… id lives in users.prefs.imdbId already.
ALTER TABLE name_suggestions ADD COLUMN imdbId TEXT;

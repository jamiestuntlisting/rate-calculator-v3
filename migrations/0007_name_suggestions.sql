-- Migration number: 0007 	 Known show titles and character names.
-- Suggestions come from what performers have already entered, so the same
-- production or role is spelled the same way every time. Admins can block a
-- spelling (a typo, a duplicate) so it stops being offered, optionally
-- pointing at the spelling that should be used instead.

CREATE TABLE name_suggestions (
  kind TEXT NOT NULL CHECK (kind IN ('show', 'character')),
  name TEXT NOT NULL,
  blocked INTEGER NOT NULL DEFAULT 0,
  replacement TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (kind, name)
);

CREATE INDEX idx_name_suggestions_kind ON name_suggestions(kind, blocked);

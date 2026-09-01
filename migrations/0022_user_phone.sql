-- Exhibit Gs texted to the intake number match on the sender's mobile.
-- Stored as bare digits (country code kept when given); matching
-- compares the last ten, which is how two North American numbers agree
-- whatever their formatting. Filled from Preferences, or best-effort
-- from the StuntListing profile at login.
ALTER TABLE users ADD COLUMN phone TEXT;
CREATE INDEX idx_users_phone ON users(phone);

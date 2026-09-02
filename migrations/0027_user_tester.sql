-- Migration number: 0027 	 Test users.
-- Features under test are shown to test users — performers whose own
-- days exercise a feature before it launches, distinct from admins. The
-- code carries a seed list (src/lib/test-users.ts); this flag lets an
-- admin add or remove one from Admin → Members without a deploy.
ALTER TABLE users ADD COLUMN tester INTEGER NOT NULL DEFAULT 0;

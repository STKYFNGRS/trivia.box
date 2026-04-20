-- 0005: collapse the legacy "venue" account_type into "host".
-- The `venues` table itself is kept as a location-records table; only the
-- accounts-level role is being retired. Site admin accounts are left alone.

UPDATE accounts
SET account_type = 'host'
WHERE account_type = 'venue';

-- Record a breadcrumb so we can audit the migration later if needed.
INSERT INTO accounts (clerk_user_id, account_type, name, email, city)
SELECT
  '__migration_0005_venue_retire__',
  'site_admin',
  'migration_0005',
  '__migration_0005_venue_retire__@internal.trivia.box',
  'N/A'
WHERE FALSE; -- noop, documentation only

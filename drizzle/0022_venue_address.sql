ALTER TABLE "venue_profiles" ADD COLUMN IF NOT EXISTS "address_street" text;
ALTER TABLE "venue_profiles" ADD COLUMN IF NOT EXISTS "address_city" text;
ALTER TABLE "venue_profiles" ADD COLUMN IF NOT EXISTS "address_region" text;
ALTER TABLE "venue_profiles" ADD COLUMN IF NOT EXISTS "address_postal_code" text;
ALTER TABLE "venue_profiles" ADD COLUMN IF NOT EXISTS "address_country" text;

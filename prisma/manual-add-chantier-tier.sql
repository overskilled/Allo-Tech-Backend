-- Manual patch: add ChantierTier enum and tier/specialty columns to Chantier.
-- Apply this directly to the production DB (Neon SQL editor or psql) because
-- the existing migration history fails shadow-DB validation.
--
-- Idempotent: safe to run more than once.

DO $$
BEGIN
  -- Create the enum if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'ChantierTier'
  ) THEN
    CREATE TYPE "ChantierTier" AS ENUM ('BASIC', 'STANDARD', 'ENTERPRISE');
  END IF;
END$$;

-- Add the tier column with a default
ALTER TABLE "Chantier"
  ADD COLUMN IF NOT EXISTS "tier" "ChantierTier" NOT NULL DEFAULT 'BASIC';

-- Add the specialty column (nullable)
ALTER TABLE "Chantier"
  ADD COLUMN IF NOT EXISTS "specialty" TEXT;

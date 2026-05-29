-- Step 1: allow NULL on email. UNIQUE in Postgres allows multiple NULLs,
-- so the existing unique index keeps protecting real addresses.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- Step 2: clear the synthetic placeholders we used to invent for phone-only
-- signups. Apple private-relay addresses are real forwarders — keep them.
UPDATE "User" SET email = NULL WHERE email LIKE '%@phone.allotech.local';

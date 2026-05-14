-- Re-enable local email/password authentication while keeping Google users valid.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;

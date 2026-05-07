-- Drop email/password remnants. Google OAuth is the only supported provider.

-- 1. Re-tag any legacy 'local' rows so the enum coercion below cannot fail.
UPDATE "User" SET "provider" = 'google' WHERE "provider" = 'local';

-- 2. Drop the unused passwordHash column.
ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordHash";

-- 3. Convert "provider" from AuthProvider enum to TEXT defaulting to 'google'.
ALTER TABLE "User" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TABLE "User"
    ALTER COLUMN "provider" TYPE TEXT USING ("provider"::text);
ALTER TABLE "User" ALTER COLUMN "provider" SET DEFAULT 'google';

-- 4. Drop the now-unused AuthProvider enum type.
DROP TYPE IF EXISTS "AuthProvider";

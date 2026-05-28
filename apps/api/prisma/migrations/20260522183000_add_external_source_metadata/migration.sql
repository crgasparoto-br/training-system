DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StudentRecordSourceType') THEN
    CREATE TYPE "StudentRecordSourceType" AS ENUM ('student', 'professional', 'integration', 'system');
  END IF;
END $$;

-- AlterTable
ALTER TABLE "StudentExternalAccount"
ADD COLUMN IF NOT EXISTS "sourceType" "StudentRecordSourceType" NOT NULL DEFAULT 'integration',
ADD COLUMN IF NOT EXISTS "sourceReference" TEXT,
ADD COLUMN IF NOT EXISTS "recordedByUserId" TEXT;

-- AlterTable
ALTER TABLE "StudentExternalActivity"
ADD COLUMN IF NOT EXISTS "sourceType" "StudentRecordSourceType" NOT NULL DEFAULT 'integration',
ADD COLUMN IF NOT EXISTS "sourceReference" TEXT,
ADD COLUMN IF NOT EXISTS "recordedByUserId" TEXT;

-- Backfill source references from existing external ids where possible
UPDATE "StudentExternalAccount"
SET "sourceReference" = COALESCE("sourceReference", "externalUserId", "id")
WHERE "sourceReference" IS NULL;

UPDATE "StudentExternalActivity"
SET "sourceReference" = COALESCE("sourceReference", "externalActivityId", "id")
WHERE "sourceReference" IS NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StudentExternalAccount_sourceType_idx" ON "StudentExternalAccount"("sourceType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StudentExternalAccount_recordedByUserId_idx" ON "StudentExternalAccount"("recordedByUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StudentExternalActivity_sourceType_idx" ON "StudentExternalActivity"("sourceType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StudentExternalActivity_recordedByUserId_idx" ON "StudentExternalActivity"("recordedByUserId");

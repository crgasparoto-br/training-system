-- AlterTable
ALTER TABLE "StudentExternalAccount"
ADD COLUMN "sourceType" "StudentRecordSourceType" NOT NULL DEFAULT 'integration',
ADD COLUMN "sourceReference" TEXT,
ADD COLUMN "recordedByUserId" TEXT;

-- AlterTable
ALTER TABLE "StudentExternalActivity"
ADD COLUMN "sourceType" "StudentRecordSourceType" NOT NULL DEFAULT 'integration',
ADD COLUMN "sourceReference" TEXT,
ADD COLUMN "recordedByUserId" TEXT;

-- Backfill source references from existing external ids where possible
UPDATE "StudentExternalAccount"
SET "sourceReference" = COALESCE("sourceReference", "externalUserId", "id")
WHERE "sourceReference" IS NULL;

UPDATE "StudentExternalActivity"
SET "sourceReference" = COALESCE("sourceReference", "externalActivityId", "id")
WHERE "sourceReference" IS NULL;

-- CreateIndex
CREATE INDEX "StudentExternalAccount_sourceType_idx" ON "StudentExternalAccount"("sourceType");

-- CreateIndex
CREATE INDEX "StudentExternalAccount_recordedByUserId_idx" ON "StudentExternalAccount"("recordedByUserId");

-- CreateIndex
CREATE INDEX "StudentExternalActivity_sourceType_idx" ON "StudentExternalActivity"("sourceType");

-- CreateIndex
CREATE INDEX "StudentExternalActivity_recordedByUserId_idx" ON "StudentExternalActivity"("recordedByUserId");

-- Add contractId to ExerciseLibrary and TrainingParameter
ALTER TABLE "ExerciseLibrary" ADD COLUMN "contractId" TEXT;
ALTER TABLE "TrainingParameter" ADD COLUMN "contractId" TEXT;

-- Backfill existing rows with the first contract
UPDATE "ExerciseLibrary"
SET "contractId" = (SELECT id FROM "Contract" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "contractId" IS NULL;

UPDATE "TrainingParameter"
SET "contractId" = (SELECT id FROM "Contract" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "contractId" IS NULL;

-- Enforce NOT NULL after backfill
ALTER TABLE "ExerciseLibrary" ALTER COLUMN "contractId" SET NOT NULL;
ALTER TABLE "TrainingParameter" ALTER COLUMN "contractId" SET NOT NULL;

-- Drop old unique/indexes
DROP INDEX IF EXISTS "TrainingParameter_category_code_key";
DROP INDEX IF EXISTS "TrainingParameter_category_idx";

-- Create new indexes
CREATE UNIQUE INDEX "TrainingParameter_contractId_category_code_key"
ON "TrainingParameter"("contractId", "category", "code");

CREATE INDEX "TrainingParameter_contractId_category_idx"
ON "TrainingParameter"("contractId", "category");

CREATE INDEX "ExerciseLibrary_contractId_idx"
ON "ExerciseLibrary"("contractId");

CREATE INDEX "ExerciseLibrary_contractId_name_idx"
ON "ExerciseLibrary"("contractId", "name");

CREATE INDEX "ExerciseLibrary_contractId_category_idx"
ON "ExerciseLibrary"("contractId", "category");

-- Add foreign keys
ALTER TABLE "ExerciseLibrary"
ADD CONSTRAINT "ExerciseLibrary_contractId_fkey"
FOREIGN KEY ("contractId") REFERENCES "Contract"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrainingParameter"
ADD CONSTRAINT "TrainingParameter_contractId_fkey"
FOREIGN KEY ("contractId") REFERENCES "Contract"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Restore the nullable Assessment.professorId column expected by the current Prisma schema.
-- The operation is idempotent so environments that already contain the column remain valid.
ALTER TABLE "Assessment"
  ADD COLUMN IF NOT EXISTS "professorId" TEXT;

CREATE INDEX IF NOT EXISTS "Assessment_professorId_idx"
  ON "Assessment"("professorId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Assessment_professorId_fkey'
  ) THEN
    ALTER TABLE "Assessment"
      ADD CONSTRAINT "Assessment_professorId_fkey"
      FOREIGN KEY ("professorId") REFERENCES "Educator"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

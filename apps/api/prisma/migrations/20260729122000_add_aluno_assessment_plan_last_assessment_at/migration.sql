-- Keep the migrated database aligned with the Prisma model used by assessment-plan queries.
ALTER TABLE "AlunoAssessmentPlanItem"
ADD COLUMN IF NOT EXISTS "lastAssessmentAt" TIMESTAMP(3);

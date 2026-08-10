-- Issue #272 audit remediation: existing canonical records already containing
-- health answers cannot remain NOT_STARTED after the metadata columns are added.
-- This migration is idempotent and does not infer consent, completion or author.
UPDATE "StudentHealthIntake"
SET
  "status" = 'IN_PROGRESS'::"StudentOnboardingModuleStatus",
  "currentStep" = 'REVIEW',
  "formVersion" = COALESCE("formVersion", 'health-intake-v1'),
  "lastSavedAt" = COALESCE("lastSavedAt", "updatedAt")
WHERE "status" = 'NOT_STARTED'::"StudentOnboardingModuleStatus"
  AND "completedAt" IS NULL
  AND (
    "assessmentDate" IS NOT NULL OR
    (COALESCE(jsonb_typeof("clinicalHistoryData"), 'null') = 'object' AND "clinicalHistoryData" <> '{}'::jsonb) OR
    (COALESCE(jsonb_typeof("medicationData"), 'null') = 'object' AND "medicationData" <> '{}'::jsonb) OR
    (COALESCE(jsonb_typeof("injuryData"), 'null') = 'object' AND "injuryData" <> '{}'::jsonb) OR
    (COALESCE(jsonb_typeof("allergyData"), 'null') = 'object' AND "allergyData" <> '{}'::jsonb) OR
    NULLIF(BTRIM("observations"), '') IS NOT NULL
  );

UPDATE "StudentOnboardingProcess" AS onboarding
SET
  "healthIntakeId" = intake."id",
  "healthModuleStatus" = intake."status",
  "healthStartedAt" = CASE
    WHEN intake."status" <> 'NOT_STARTED'::"StudentOnboardingModuleStatus"
      THEN COALESCE(onboarding."healthStartedAt", intake."createdAt")
    ELSE onboarding."healthStartedAt"
  END,
  "healthLastSavedAt" = COALESCE(
    onboarding."healthLastSavedAt",
    intake."lastSavedAt",
    intake."updatedAt"
  ),
  "healthCompletedAt" = COALESCE(onboarding."healthCompletedAt", intake."completedAt"),
  "updatedAt" = GREATEST(onboarding."updatedAt", intake."updatedAt")
FROM "StudentHealthIntake" AS intake
WHERE onboarding."alunoId" = intake."alunoId"
  AND onboarding."contractId" = intake."contractId";

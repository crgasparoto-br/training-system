-- Issue #272: consolida a Anamnese Inicial em StudentHealthIntake.
-- A migration e deliberadamente idempotente: novos deploys e repeticoes do
-- backfill preservam a fonte canonica e nunca recriam registros por aluno.

-- Eventos auditaveis do ciclo da Anamnese.
ALTER TYPE "StudentLifecycleEventType" ADD VALUE IF NOT EXISTS 'HEALTH_INTAKE_STARTED';
ALTER TYPE "StudentLifecycleEventType" ADD VALUE IF NOT EXISTS 'HEALTH_INTAKE_SAVED';
ALTER TYPE "StudentLifecycleEventType" ADD VALUE IF NOT EXISTS 'HEALTH_INTAKE_COMPLETED';
ALTER TYPE "StudentLifecycleEventType" ADD VALUE IF NOT EXISTS 'HEALTH_INTAKE_MIGRATED';

ALTER TABLE "StudentOnboardingProcess"
  ADD COLUMN IF NOT EXISTS "healthIntakeId" TEXT,
  ADD COLUMN IF NOT EXISTS "healthStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "healthLastSavedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "healthCompletedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "StudentOnboardingProcess_healthIntakeId_key"
  ON "StudentOnboardingProcess"("healthIntakeId")
  WHERE "healthIntakeId" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'StudentOnboardingProcess_healthIntakeId_fkey'
  ) THEN
    ALTER TABLE "StudentOnboardingProcess"
      ADD CONSTRAINT "StudentOnboardingProcess_healthIntakeId_fkey"
      FOREIGN KEY ("healthIntakeId") REFERENCES "StudentHealthIntake"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "StudentHealthIntake"
  ADD COLUMN IF NOT EXISTS "formVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "status" "StudentOnboardingModuleStatus" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS "currentStep" TEXT NOT NULL DEFAULT 'CONSENT',
  ADD COLUMN IF NOT EXISTS "consentNoticeVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "consentAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "consentAcceptedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "consentAcceptedIp" TEXT,
  ADD COLUMN IF NOT EXISTS "consentAcceptedUserAgent" TEXT,
  ADD COLUMN IF NOT EXISTS "respondentRole" TEXT,
  ADD COLUMN IF NOT EXISTS "respondentUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "lastSavedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "completedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "declarationAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "legacyIntakeId" TEXT,
  ADD COLUMN IF NOT EXISTS "legacyMigratedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "migrationStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "migrationProvenance" JSONB,
  ADD COLUMN IF NOT EXISTS "migrationReviewRequired" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "migrationReviewData" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "StudentHealthIntake_legacyIntakeId_key"
  ON "StudentHealthIntake"("legacyIntakeId")
  WHERE "legacyIntakeId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "StudentHealthIntake_status_idx"
  ON "StudentHealthIntake"("status");
CREATE INDEX IF NOT EXISTS "StudentHealthIntake_migrationReviewRequired_idx"
  ON "StudentHealthIntake"("migrationReviewRequired");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'StudentHealthIntake_currentStep_check'
  ) THEN
    ALTER TABLE "StudentHealthIntake"
      ADD CONSTRAINT "StudentHealthIntake_currentStep_check"
      CHECK ("currentStep" IN ('CONSENT','HEALTH_HISTORY','MEDICATIONS','INJURIES','ACTIVITY','REVIEW'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'StudentHealthIntake_respondentRole_check'
  ) THEN
    ALTER TABLE "StudentHealthIntake"
      ADD CONSTRAINT "StudentHealthIntake_respondentRole_check"
      CHECK ("respondentRole" IS NULL OR "respondentRole" IN ('STUDENT','GUARDIAN','PROFESSIONAL','SYSTEM'));
  END IF;
END $$;

-- Insere apenas campos semanticamente equivalentes. PAR-Q, antropometria,
-- composicao corporal, nutricao e dados cardiovasculares nao participam.
INSERT INTO "StudentHealthIntake" (
  "id", "alunoId", "contractId", "sourceType", "sourceReference",
  "assessmentDate", "clinicalHistoryData", "medicationData", "injuryData",
  "observations", "formVersion", "version", "status", "currentStep",
  "legacyIntakeId", "legacyMigratedAt", "migrationStatus",
  "migrationProvenance", "migrationReviewRequired", "createdAt", "updatedAt"
)
SELECT
  'shi_' || md5(legacy."id"),
  legacy."alunoId",
  student."contractId",
  'system'::"StudentRecordSourceType",
  'legacy:AlunoIntakeForm:' || legacy."id",
  legacy."assessmentDate",
  jsonb_strip_nulls(jsonb_build_object(
    'mainGoal', NULLIF(BTRIM(legacy."mainGoal"), ''),
    'medicalHistory', NULLIF(BTRIM(legacy."medicalHistory"), ''),
    'trainingBackground', NULLIF(BTRIM(legacy."trainingBackground"), '')
  )),
  jsonb_strip_nulls(jsonb_build_object(
    'currentMedications', NULLIF(BTRIM(legacy."currentMedications"), '')
  )),
  jsonb_strip_nulls(jsonb_build_object(
    'injuriesHistory', NULLIF(BTRIM(legacy."injuriesHistory"), '')
  )),
  NULLIF(BTRIM(legacy."observations"), ''),
  'health-intake-v1',
  1,
  CASE WHEN
    legacy."assessmentDate" IS NOT NULL OR
    NULLIF(BTRIM(legacy."mainGoal"), '') IS NOT NULL OR
    NULLIF(BTRIM(legacy."medicalHistory"), '') IS NOT NULL OR
    NULLIF(BTRIM(legacy."currentMedications"), '') IS NOT NULL OR
    NULLIF(BTRIM(legacy."injuriesHistory"), '') IS NOT NULL OR
    NULLIF(BTRIM(legacy."trainingBackground"), '') IS NOT NULL OR
    NULLIF(BTRIM(legacy."observations"), '') IS NOT NULL
  THEN 'IN_PROGRESS'::"StudentOnboardingModuleStatus"
  ELSE 'NOT_STARTED'::"StudentOnboardingModuleStatus" END,
  'REVIEW',
  legacy."id",
  CURRENT_TIMESTAMP,
  'INSERTED',
  jsonb_build_object(
    'strategy', 'canonical_wins_then_fill_missing',
    'sourceTable', 'AlunoIntakeForm',
    'sourceId', legacy."id",
    'excludedFields', jsonb_build_array('parqResponses', 'formResponses')
  ),
  FALSE,
  legacy."createdAt",
  GREATEST(legacy."updatedAt", CURRENT_TIMESTAMP)
FROM "AlunoIntakeForm" AS legacy
JOIN "Aluno" AS student ON student."id" = legacy."alunoId"
ON CONFLICT ("alunoId") DO NOTHING;

-- Para coexistencia historica, a fonte canonica sempre vence. Somente lacunas
-- canonicas recebem dados legados. Divergencias ficam registradas por nome de
-- campo, sem sobrescrita silenciosa.
WITH compared AS (
  SELECT
    intake."id" AS "intakeId",
    legacy."id" AS "legacyId",
    ARRAY_REMOVE(ARRAY[
      CASE WHEN intake."assessmentDate" IS NOT NULL AND legacy."assessmentDate" IS NOT NULL
             AND intake."assessmentDate" IS DISTINCT FROM legacy."assessmentDate" THEN 'assessmentDate' END,
      CASE WHEN NULLIF(intake."clinicalHistoryData"->>'mainGoal','') IS NOT NULL
             AND NULLIF(BTRIM(legacy."mainGoal"),'') IS NOT NULL
             AND intake."clinicalHistoryData"->>'mainGoal' IS DISTINCT FROM BTRIM(legacy."mainGoal") THEN 'mainGoal' END,
      CASE WHEN NULLIF(intake."clinicalHistoryData"->>'medicalHistory','') IS NOT NULL
             AND NULLIF(BTRIM(legacy."medicalHistory"),'') IS NOT NULL
             AND intake."clinicalHistoryData"->>'medicalHistory' IS DISTINCT FROM BTRIM(legacy."medicalHistory") THEN 'medicalHistory' END,
      CASE WHEN NULLIF(intake."clinicalHistoryData"->>'trainingBackground','') IS NOT NULL
             AND NULLIF(BTRIM(legacy."trainingBackground"),'') IS NOT NULL
             AND intake."clinicalHistoryData"->>'trainingBackground' IS DISTINCT FROM BTRIM(legacy."trainingBackground") THEN 'trainingBackground' END,
      CASE WHEN NULLIF(intake."medicationData"->>'currentMedications','') IS NOT NULL
             AND NULLIF(BTRIM(legacy."currentMedications"),'') IS NOT NULL
             AND intake."medicationData"->>'currentMedications' IS DISTINCT FROM BTRIM(legacy."currentMedications") THEN 'currentMedications' END,
      CASE WHEN NULLIF(intake."injuryData"->>'injuriesHistory','') IS NOT NULL
             AND NULLIF(BTRIM(legacy."injuriesHistory"),'') IS NOT NULL
             AND intake."injuryData"->>'injuriesHistory' IS DISTINCT FROM BTRIM(legacy."injuriesHistory") THEN 'injuriesHistory' END,
      CASE WHEN NULLIF(BTRIM(intake."observations"),'') IS NOT NULL
             AND NULLIF(BTRIM(legacy."observations"),'') IS NOT NULL
             AND BTRIM(intake."observations") IS DISTINCT FROM BTRIM(legacy."observations") THEN 'observations' END
    ], NULL) AS conflicts
  FROM "StudentHealthIntake" intake
  JOIN "AlunoIntakeForm" legacy ON legacy."alunoId" = intake."alunoId"
)
UPDATE "StudentHealthIntake" AS intake
SET
  "assessmentDate" = COALESCE(intake."assessmentDate", legacy."assessmentDate"),
  "clinicalHistoryData" = COALESCE(intake."clinicalHistoryData", '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'mainGoal', CASE WHEN COALESCE(intake."clinicalHistoryData"->>'mainGoal','') = '' THEN NULLIF(BTRIM(legacy."mainGoal"),'') END,
      'medicalHistory', CASE WHEN COALESCE(intake."clinicalHistoryData"->>'medicalHistory','') = '' THEN NULLIF(BTRIM(legacy."medicalHistory"),'') END,
      'trainingBackground', CASE WHEN COALESCE(intake."clinicalHistoryData"->>'trainingBackground','') = '' THEN NULLIF(BTRIM(legacy."trainingBackground"),'') END
    )),
  "medicationData" = COALESCE(intake."medicationData", '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'currentMedications', CASE WHEN COALESCE(intake."medicationData"->>'currentMedications','') = '' THEN NULLIF(BTRIM(legacy."currentMedications"),'') END
    )),
  "injuryData" = COALESCE(intake."injuryData", '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'injuriesHistory', CASE WHEN COALESCE(intake."injuryData"->>'injuriesHistory','') = '' THEN NULLIF(BTRIM(legacy."injuriesHistory"),'') END
    )),
  "observations" = COALESCE(NULLIF(BTRIM(intake."observations"),''), NULLIF(BTRIM(legacy."observations"),'')),
  "legacyIntakeId" = COALESCE(intake."legacyIntakeId", legacy."id"),
  "legacyMigratedAt" = COALESCE(intake."legacyMigratedAt", CURRENT_TIMESTAMP),
  "migrationStatus" = CASE WHEN cardinality(compared.conflicts) > 0 THEN 'CONFLICT' ELSE COALESCE(intake."migrationStatus", 'MERGED') END,
  "migrationReviewRequired" = intake."migrationReviewRequired" OR cardinality(compared.conflicts) > 0,
  "migrationReviewData" = CASE WHEN cardinality(compared.conflicts) > 0
    THEN jsonb_build_object('legacyIntakeId', legacy."id", 'fields', to_jsonb(compared.conflicts), 'precedence', 'canonical')
    ELSE intake."migrationReviewData" END,
  "migrationProvenance" = COALESCE(intake."migrationProvenance", '{}'::jsonb) || jsonb_build_object(
    'strategy', 'canonical_wins_then_fill_missing',
    'sourceTable', 'AlunoIntakeForm',
    'sourceId', legacy."id",
    'excludedFields', jsonb_build_array('parqResponses', 'formResponses')
  ),
  "updatedAt" = GREATEST(intake."updatedAt", legacy."updatedAt")
FROM "AlunoIntakeForm" legacy, compared
WHERE legacy."alunoId" = intake."alunoId"
  AND compared."intakeId" = intake."id"
  AND compared."legacyId" = legacy."id";

UPDATE "StudentOnboardingProcess" onboarding
SET
  "healthIntakeId" = intake."id",
  "healthModuleStatus" = intake."status",
  "healthStartedAt" = CASE WHEN intake."status" <> 'NOT_STARTED' THEN COALESCE(onboarding."healthStartedAt", intake."createdAt") ELSE onboarding."healthStartedAt" END,
  "healthLastSavedAt" = COALESCE(onboarding."healthLastSavedAt", intake."lastSavedAt", intake."updatedAt"),
  "healthCompletedAt" = COALESCE(onboarding."healthCompletedAt", intake."completedAt"),
  "updatedAt" = GREATEST(onboarding."updatedAt", intake."updatedAt")
FROM "StudentHealthIntake" intake
WHERE onboarding."alunoId" = intake."alunoId"
  AND onboarding."contractId" = intake."contractId";

-- O valor financeiro corrente deixa de ser espelhado em AlunoIntakeForm.
-- A autoridade permanece em GeneratedContract/StudentContract/Aluno e os
-- gatilhos de contrato nao podem tentar atualizar a tabela historica.
DROP TRIGGER IF EXISTS "StudentContract_sync_financial_service" ON "StudentContract";
DROP TRIGGER IF EXISTS "StudentContract_sync_financial_service_insert" ON "StudentContract";
DROP TRIGGER IF EXISTS "StudentContract_sync_financial_service_update" ON "StudentContract";
DROP TRIGGER IF EXISTS "StudentContract_sync_financial_service_delete" ON "StudentContract";
DROP FUNCTION IF EXISTS sync_active_student_contract_financial_service();
DROP FUNCTION IF EXISTS refresh_student_financial_current_service(TEXT);

-- Mantem a rotina de reparo publica usada operacionalmente, mas remove qualquer
-- dependencia da tabela historica. O reparo passa a corrigir somente a relacao
-- financeira canonica do contrato do aluno.
CREATE OR REPLACE FUNCTION repair_student_contract_service_authority_data()
RETURNS VOID AS $$
BEGIN
  UPDATE "StudentContract" AS student_contract
  SET "serviceId" = COALESCE(generated_contract."serviceId", aluno."serviceId"),
      "updatedAt" = CURRENT_TIMESTAMP
  FROM "GeneratedContract" AS generated_contract,
       "Aluno" AS aluno
  WHERE student_contract."contractId" = generated_contract."id"
    AND student_contract."alunoId" = aluno."id"
    AND student_contract."serviceId"
        IS DISTINCT FROM COALESCE(generated_contract."serviceId", aluno."serviceId");
END;
$$ LANGUAGE plpgsql;

-- Enforcement pos-cutover: AlunoIntakeForm permanece somente leitura. O trigger
-- transforma uma regressao de dual-write em erro explicito e transacional.
CREATE OR REPLACE FUNCTION "reject_legacy_aluno_intake_write"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AlunoIntakeForm is read-only after issue #272 cutover'
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AlunoIntakeForm_read_only_after_issue_272" ON "AlunoIntakeForm";
CREATE TRIGGER "AlunoIntakeForm_read_only_after_issue_272"
BEFORE INSERT OR UPDATE ON "AlunoIntakeForm"
FOR EACH ROW EXECUTE FUNCTION "reject_legacy_aluno_intake_write"();

-- Issue #273: PAR-Q canônico, versionado, histórico e reconciliado.

ALTER TYPE "StudentLifecycleEventType" ADD VALUE IF NOT EXISTS 'PARQ_STARTED';
ALTER TYPE "StudentLifecycleEventType" ADD VALUE IF NOT EXISTS 'PARQ_SAVED';
ALTER TYPE "StudentLifecycleEventType" ADD VALUE IF NOT EXISTS 'PARQ_COMPLETED';
ALTER TYPE "StudentLifecycleEventType" ADD VALUE IF NOT EXISTS 'PARQ_MIGRATED';
ALTER TYPE "StudentLifecycleEventType" ADD VALUE IF NOT EXISTS 'PARQ_REVIEWED';

ALTER TABLE "StudentParqSubmission"
  ADD COLUMN IF NOT EXISTS "catalogVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "positiveCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "legacySourceType" TEXT,
  ADD COLUMN IF NOT EXISTS "legacySourceId" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

ALTER TABLE "StudentOnboardingProcess"
  ADD COLUMN IF NOT EXISTS "parqSubmissionId" TEXT;

-- Classifica o histórico canônico já existente sem recriá-lo. q8 era a declaração
-- no contrato legado e nunca permanece como pergunta clínica na representação nova.
UPDATE "StudentParqSubmission"
SET "catalogVersion" = CASE
      WHEN "declarationAccepted" = true
       AND jsonb_typeof("responses") = 'object'
       AND jsonb_object_length("responses") = 8
       AND "responses" ?& ARRAY['q1','q2','q3','q4','q5','q6','q7','q8']
       AND "responses"->>'q8' = 'true'
      THEN 'parq-legacy-8-declaration-v1'
      WHEN "declarationAccepted" = true
       AND jsonb_typeof("responses") = 'object'
       AND jsonb_object_length("responses") = 7
       AND "responses" ?& ARRAY['q1','q2','q3','q4','q5','q6','q7']
      THEN 'parq-2026-01'
      ELSE 'legacy-unknown'
    END,
    "responses" = CASE
      WHEN jsonb_typeof("responses") = 'object' AND "responses" ? 'q8'
      THEN "responses" - 'q8'
      ELSE "responses"
    END,
    "positiveCount" = COALESCE(jsonb_array_length(COALESCE("positiveItems", '[]'::jsonb)), 0)
WHERE "catalogVersion" IS NULL OR "positiveCount" IS NULL;

ALTER TABLE "StudentParqSubmission"
  ALTER COLUMN "catalogVersion" SET NOT NULL,
  ALTER COLUMN "positiveCount" SET DEFAULT 0,
  ALTER COLUMN "positiveCount" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "StudentParqSubmission"
    ADD CONSTRAINT "StudentParqSubmission_positiveCount_check" CHECK ("positiveCount" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "StudentParqSubmission_aluno_idempotency_key"
  ON "StudentParqSubmission"("alunoId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "StudentParqSubmission_legacy_origin_key"
  ON "StudentParqSubmission"("legacySourceType", "legacySourceId")
  WHERE "legacySourceType" IS NOT NULL AND "legacySourceId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "StudentParqSubmission_catalogVersion_idx"
  ON "StudentParqSubmission"("catalogVersion");

CREATE TABLE IF NOT EXISTS "StudentParqDraft" (
  "id" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "catalogVersion" TEXT NOT NULL,
  "responses" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "version" INTEGER NOT NULL DEFAULT 1,
  "consentNoticeVersion" TEXT NOT NULL,
  "consentAcceptedAt" TIMESTAMP(3) NOT NULL,
  "consentAcceptedByUserId" TEXT NOT NULL,
  "lastSavedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentParqDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentParqDraft_alunoId_key" UNIQUE ("alunoId"),
  CONSTRAINT "StudentParqDraft_version_check" CHECK ("version" >= 1),
  CONSTRAINT "StudentParqDraft_catalog_check" CHECK ("catalogVersion" = 'parq-2026-01'),
  CONSTRAINT "StudentParqDraft_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentParqDraft_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentParqDraft_consentUser_fkey" FOREIGN KEY ("consentAcceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "StudentParqDraft_contract_lastSavedAt_idx"
  ON "StudentParqDraft"("contractId", "lastSavedAt");

CREATE TABLE IF NOT EXISTS "StudentParqProfessionalReview" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "positiveCount" INTEGER NOT NULL,
  "positiveItems" JSONB NOT NULL,
  "reviewedByProfessorId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentParqProfessionalReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentParqProfessionalReview_submissionId_key" UNIQUE ("submissionId"),
  CONSTRAINT "StudentParqProfessionalReview_status_check" CHECK ("status" IN ('PENDING', 'REVIEWED')),
  CONSTRAINT "StudentParqProfessionalReview_positiveCount_check" CHECK ("positiveCount" > 0),
  CONSTRAINT "StudentParqProfessionalReview_review_state_check" CHECK (
    ("status" = 'PENDING' AND "reviewedAt" IS NULL AND "reviewedByProfessorId" IS NULL)
    OR ("status" = 'REVIEWED' AND "reviewedAt" IS NOT NULL AND "reviewedByProfessorId" IS NOT NULL)
  ),
  CONSTRAINT "StudentParqProfessionalReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "StudentParqSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentParqProfessionalReview_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentParqProfessionalReview_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentParqProfessionalReview_professorId_fkey" FOREIGN KEY ("reviewedByProfessorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "StudentParqProfessionalReview_contract_status_idx"
  ON "StudentParqProfessionalReview"("contractId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "StudentParqProfessionalReview_aluno_created_idx"
  ON "StudentParqProfessionalReview"("alunoId", "createdAt");

CREATE TABLE IF NOT EXISTS "StudentParqLegacyRecord" (
  "id" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "rawResponses" JSONB NOT NULL,
  "observedAt" TIMESTAMP(3),
  "sourceActorUserId" TEXT,
  "fingerprint" TEXT NOT NULL,
  "migrationStatus" TEXT NOT NULL,
  "migrationReason" TEXT,
  "mappedSubmissionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentParqLegacyRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentParqLegacyRecord_source_key" UNIQUE ("sourceType", "sourceId"),
  CONSTRAINT "StudentParqLegacyRecord_status_check" CHECK ("migrationStatus" IN ('IMPORTABLE','IMPORTED','DUPLICATE_EQUIVALENT','DIVERGENT','INCOMPATIBLE')),
  CONSTRAINT "StudentParqLegacyRecord_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentParqLegacyRecord_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentParqLegacyRecord_mappedSubmissionId_fkey" FOREIGN KEY ("mappedSubmissionId") REFERENCES "StudentParqSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "StudentParqLegacyRecord_aluno_status_idx"
  ON "StudentParqLegacyRecord"("alunoId", "migrationStatus");
CREATE INDEX IF NOT EXISTS "StudentParqLegacyRecord_contract_status_idx"
  ON "StudentParqLegacyRecord"("contractId", "migrationStatus");
CREATE INDEX IF NOT EXISTS "StudentParqLegacyRecord_fingerprint_idx"
  ON "StudentParqLegacyRecord"("fingerprint");

-- Preserva as duas fontes legadas integralmente antes de qualquer normalização.
INSERT INTO "StudentParqLegacyRecord" (
  "id", "sourceType", "sourceId", "alunoId", "contractId", "rawResponses",
  "observedAt", "sourceActorUserId", "fingerprint", "migrationStatus", "migrationReason",
  "createdAt", "updatedAt"
)
SELECT
  'legacy-aif-' || md5(intake."id"), 'AlunoIntakeForm', intake."id", intake."alunoId",
  aluno."contractId", intake."parqResponses", intake."assessmentDate", NULL,
  md5(intake."parqResponses"::text || '|' || COALESCE(intake."assessmentDate"::text, '')),
  CASE WHEN intake."assessmentDate" IS NOT NULL
         AND jsonb_typeof(intake."parqResponses") = 'object'
         AND jsonb_object_length(intake."parqResponses") = 8
         AND intake."parqResponses" ?& ARRAY['q1','q2','q3','q4','q5','q6','q7','q8']
         AND intake."parqResponses"->>'q8' = 'true'
       THEN 'IMPORTABLE' ELSE 'INCOMPATIBLE' END,
  CASE WHEN intake."assessmentDate" IS NULL THEN 'missing_observed_at'
       WHEN jsonb_typeof(intake."parqResponses") <> 'object' THEN 'invalid_shape'
       WHEN NOT (intake."parqResponses" ?& ARRAY['q1','q2','q3','q4','q5','q6','q7','q8']) THEN 'incomplete_question_set'
       WHEN intake."parqResponses"->>'q8' <> 'true' THEN 'declaration_not_supported'
       ELSE NULL END,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AlunoIntakeForm" intake
JOIN "Aluno" aluno ON aluno."id" = intake."alunoId"
WHERE intake."parqResponses" IS NOT NULL
ON CONFLICT ("sourceType", "sourceId") DO NOTHING;

INSERT INTO "StudentParqLegacyRecord" (
  "id", "sourceType", "sourceId", "alunoId", "contractId", "rawResponses",
  "observedAt", "sourceActorUserId", "fingerprint", "migrationStatus", "migrationReason",
  "createdAt", "updatedAt"
)
SELECT
  'legacy-shi-' || md5(intake."id"), 'StudentHealthIntake', intake."id", intake."alunoId",
  intake."contractId", intake."questionnaireParq", intake."assessmentDate", intake."recordedByUserId",
  md5(intake."questionnaireParq"::text || '|' || COALESCE(intake."assessmentDate"::text, '')),
  CASE WHEN intake."assessmentDate" IS NOT NULL
         AND jsonb_typeof(intake."questionnaireParq") = 'object'
         AND jsonb_object_length(intake."questionnaireParq") = 8
         AND intake."questionnaireParq" ?& ARRAY['q1','q2','q3','q4','q5','q6','q7','q8']
         AND intake."questionnaireParq"->>'q8' = 'true'
       THEN 'IMPORTABLE' ELSE 'INCOMPATIBLE' END,
  CASE WHEN intake."assessmentDate" IS NULL THEN 'missing_observed_at'
       WHEN jsonb_typeof(intake."questionnaireParq") <> 'object' THEN 'invalid_shape'
       WHEN NOT (intake."questionnaireParq" ?& ARRAY['q1','q2','q3','q4','q5','q6','q7','q8']) THEN 'incomplete_question_set'
       WHEN intake."questionnaireParq"->>'q8' <> 'true' THEN 'declaration_not_supported'
       ELSE NULL END,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "StudentHealthIntake" intake
WHERE intake."questionnaireParq" IS NOT NULL
ON CONFLICT ("sourceType", "sourceId") DO NOTHING;

-- Fontes com a mesma pessoa/data e conteúdo diferente são preservadas para revisão,
-- sem escolher silenciosamente por updatedAt.
UPDATE "StudentParqLegacyRecord" candidate
SET "migrationStatus" = 'DIVERGENT', "migrationReason" = 'conflicting_sources_same_observed_at', "updatedAt" = CURRENT_TIMESTAMP
WHERE candidate."migrationStatus" = 'IMPORTABLE'
  AND EXISTS (
    SELECT 1 FROM "StudentParqLegacyRecord" other
    WHERE other."alunoId" = candidate."alunoId"
      AND other."observedAt" = candidate."observedAt"
      AND other."sourceType" <> candidate."sourceType"
      AND (other."rawResponses" - 'q8') <> (candidate."rawResponses" - 'q8')
  );

-- Importa somente registros semanticamente completos, com declaração e data sustentáveis.
INSERT INTO "StudentParqSubmission" (
  "id", "alunoId", "contractId", "sourceType", "submittedByUserId", "submittedAt",
  "catalogVersion", "responses", "positiveItems", "positiveCount", "declarationAccepted",
  "legacySourceType", "legacySourceId", "createdAt", "updatedAt"
)
SELECT
  'parq-' || md5(legacy."sourceType" || ':' || legacy."sourceId"),
  legacy."alunoId", legacy."contractId", 'system'::"StudentRecordSourceType",
  legacy."sourceActorUserId", legacy."observedAt", 'parq-legacy-8-declaration-v1',
  legacy."rawResponses" - 'q8',
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('key', question.key, 'label', question.label) ORDER BY question.ord)
    FROM (VALUES
      ('q1', 1, 'Algum médico já disse que você possui algum problema cardíaco e recomendou atividade física somente sob supervisão médica?'),
      ('q2', 2, 'Você sente dor no peito durante a prática de atividade física?'),
      ('q3', 3, 'No último mês, você sentiu dor no peito quando não estava praticando atividade física?'),
      ('q4', 4, 'Você perde o equilíbrio por tontura ou alguma vez perdeu a consciência?'),
      ('q5', 5, 'Você possui algum problema ósseo ou articular que poderia piorar com uma mudança na sua atividade física?'),
      ('q6', 6, 'Algum médico prescreveu atualmente medicamentos para pressão arterial ou problema cardíaco?'),
      ('q7', 7, 'Você conhece alguma outra razão pela qual não deveria praticar atividade física?')
    ) AS question(key, ord, label)
    WHERE legacy."rawResponses"->>question.key = 'true'
  ), '[]'::jsonb),
  (SELECT count(*)::integer FROM unnest(ARRAY['q1','q2','q3','q4','q5','q6','q7']) AS keys(key) WHERE legacy."rawResponses"->>keys.key = 'true'),
  true, legacy."sourceType", legacy."sourceId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "StudentParqLegacyRecord" legacy
WHERE legacy."migrationStatus" = 'IMPORTABLE'
  AND NOT EXISTS (
    SELECT 1 FROM "StudentParqSubmission" existing
    WHERE existing."alunoId" = legacy."alunoId"
      AND existing."submittedAt" = legacy."observedAt"
      AND existing."catalogVersion" IN ('parq-2026-01', 'parq-legacy-8-declaration-v1')
  )
ON CONFLICT DO NOTHING;

UPDATE "StudentParqLegacyRecord" legacy
SET "migrationStatus" = 'IMPORTED',
    "mappedSubmissionId" = submission."id",
    "migrationReason" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "StudentParqSubmission" submission
WHERE submission."legacySourceType" = legacy."sourceType"
  AND submission."legacySourceId" = legacy."sourceId"
  AND legacy."migrationStatus" = 'IMPORTABLE';

UPDATE "StudentParqLegacyRecord" legacy
SET "migrationStatus" = 'DUPLICATE_EQUIVALENT',
    "mappedSubmissionId" = existing."id",
    "migrationReason" = 'equivalent_canonical_submission_exists',
    "updatedAt" = CURRENT_TIMESTAMP
FROM "StudentParqSubmission" existing
WHERE legacy."migrationStatus" = 'IMPORTABLE'
  AND existing."alunoId" = legacy."alunoId"
  AND existing."submittedAt" = legacy."observedAt"
  AND existing."responses" = (legacy."rawResponses" - 'q8')
  AND existing."catalogVersion" IN ('parq-2026-01', 'parq-legacy-8-declaration-v1');

-- Gera pendência para todo histórico válido positivo que ainda não tenha revisão.
INSERT INTO "StudentParqProfessionalReview" (
  "id", "submissionId", "alunoId", "contractId", "status", "positiveCount",
  "positiveItems", "createdAt", "updatedAt"
)
SELECT 'review-' || md5(submission."id"), submission."id", submission."alunoId",
       submission."contractId", 'PENDING', submission."positiveCount",
       COALESCE(submission."positiveItems", '[]'::jsonb), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "StudentParqSubmission" submission
WHERE submission."catalogVersion" IN ('parq-2026-01', 'parq-legacy-8-declaration-v1')
  AND submission."declarationAccepted" = true
  AND submission."positiveCount" > 0
ON CONFLICT ("submissionId") DO NOTHING;

-- O onboarding armazena somente referência/estado, nunca respostas.
UPDATE "StudentOnboardingProcess" onboarding
SET "parqModuleStatus" = 'COMPLETED',
    "parqSubmissionId" = (
      SELECT submission."id"
      FROM "StudentParqSubmission" submission
      WHERE submission."alunoId" = onboarding."alunoId"
        AND submission."contractId" = onboarding."contractId"
        AND submission."catalogVersion" IN ('parq-2026-01', 'parq-legacy-8-declaration-v1')
        AND submission."declarationAccepted" = true
      ORDER BY submission."submittedAt" DESC, submission."createdAt" DESC, submission."id" DESC
      LIMIT 1
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM "StudentParqSubmission" submission
  WHERE submission."alunoId" = onboarding."alunoId"
    AND submission."contractId" = onboarding."contractId"
    AND submission."catalogVersion" IN ('parq-2026-01', 'parq-legacy-8-declaration-v1')
    AND submission."declarationAccepted" = true
);

UPDATE "Aluno" aluno
SET "parqRequiresProfessionalReview" = EXISTS (
  SELECT 1 FROM "StudentParqProfessionalReview" review
  WHERE review."alunoId" = aluno."id" AND review."contractId" = aluno."contractId" AND review."status" = 'PENDING'
);

DO $$ BEGIN
  ALTER TABLE "StudentOnboardingProcess"
    ADD CONSTRAINT "StudentOnboardingProcess_parqSubmissionId_key" UNIQUE ("parqSubmissionId");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StudentOnboardingProcess"
    ADD CONSTRAINT "StudentOnboardingProcess_parqSubmissionId_fkey"
    FOREIGN KEY ("parqSubmissionId") REFERENCES "StudentParqSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Defesa em profundidade: todas as novas linhas clínicas devem permanecer no tenant do Aluno.
CREATE OR REPLACE FUNCTION "validate_student_parq_tenant"() RETURNS trigger AS $$
DECLARE expected_contract TEXT;
DECLARE submission_aluno TEXT;
DECLARE submission_contract TEXT;
BEGIN
  SELECT "contractId" INTO expected_contract FROM "Aluno" WHERE "id" = NEW."alunoId";
  IF expected_contract IS NULL OR expected_contract <> NEW."contractId" THEN
    RAISE EXCEPTION 'PARQ_TENANT_MISMATCH';
  END IF;
  IF TG_TABLE_NAME = 'StudentParqProfessionalReview' THEN
    SELECT "alunoId", "contractId" INTO submission_aluno, submission_contract
    FROM "StudentParqSubmission" WHERE "id" = NEW."submissionId";
    IF submission_aluno IS NULL OR submission_aluno <> NEW."alunoId" OR submission_contract <> NEW."contractId" THEN
      RAISE EXCEPTION 'PARQ_SUBMISSION_SCOPE_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "StudentParqSubmission_tenant_guard" ON "StudentParqSubmission";
CREATE TRIGGER "StudentParqSubmission_tenant_guard" BEFORE INSERT OR UPDATE OF "alunoId", "contractId"
ON "StudentParqSubmission" FOR EACH ROW EXECUTE FUNCTION "validate_student_parq_tenant"();
DROP TRIGGER IF EXISTS "StudentParqDraft_tenant_guard" ON "StudentParqDraft";
CREATE TRIGGER "StudentParqDraft_tenant_guard" BEFORE INSERT OR UPDATE OF "alunoId", "contractId"
ON "StudentParqDraft" FOR EACH ROW EXECUTE FUNCTION "validate_student_parq_tenant"();
DROP TRIGGER IF EXISTS "StudentParqProfessionalReview_tenant_guard" ON "StudentParqProfessionalReview";
CREATE TRIGGER "StudentParqProfessionalReview_tenant_guard" BEFORE INSERT OR UPDATE OF "submissionId", "alunoId", "contractId"
ON "StudentParqProfessionalReview" FOR EACH ROW EXECUTE FUNCTION "validate_student_parq_tenant"();
DROP TRIGGER IF EXISTS "StudentParqLegacyRecord_tenant_guard" ON "StudentParqLegacyRecord";
CREATE TRIGGER "StudentParqLegacyRecord_tenant_guard" BEFORE INSERT OR UPDATE OF "alunoId", "contractId"
ON "StudentParqLegacyRecord" FOR EACH ROW EXECUTE FUNCTION "validate_student_parq_tenant"();

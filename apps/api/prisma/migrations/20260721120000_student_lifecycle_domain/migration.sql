-- Issue #268: ciclo unico lead -> aluno, identidade canonica e migrations.
--
-- A migration e deliberadamente reexecutavel: todo objeto usa guarda de
-- existencia e todos os backfills usam UPSERT/condicoes convergentes. Ela
-- preserva os IDs e relacionamentos dos alunos existentes e suporta uma
-- janela de rollback da aplicacao anterior por meio de triggers de
-- compatibilidade para inserts/updates legados.

-- CreateEnum (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StudentLifecycleStatus') THEN
    CREATE TYPE "StudentLifecycleStatus" AS ENUM (
      'LEAD',
      'INVITED',
      'PRE_REGISTRATION_IN_PROGRESS',
      'PRE_REGISTRATION_COMPLETED',
      'READY_FOR_ENROLLMENT',
      'ACTIVE_STUDENT',
      'DISCARDED'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StudentOnboardingModuleStatus') THEN
    CREATE TYPE "StudentOnboardingModuleStatus" AS ENUM (
      'NOT_STARTED',
      'IN_PROGRESS',
      'COMPLETED'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StudentLifecycleEventType') THEN
    CREATE TYPE "StudentLifecycleEventType" AS ENUM (
      'LEAD_CREATED',
      'IDENTIFIER_NORMALIZED_CHANGED',
      'STATUS_CHANGED',
      'ACCOUNT_LINKED',
      'ACCOUNT_UNLINKED',
      'PRE_REGISTRATION_COMPLETED',
      'PRIVACY_CONSENT_RECORDED',
      'ADMIN_REVIEWED',
      'DISCARDED',
      'REOPENED',
      'CONVERTED_TO_ACTIVE_STUDENT'
    );
  END IF;
END $$;

ALTER TYPE "StudentLifecycleEventType"
  ADD VALUE IF NOT EXISTS 'PRIVACY_CONSENT_RECORDED';

-- AlterTable: adicionar primeiro como nullable para permitir backfill seguro.
ALTER TABLE "Aluno"
  ADD COLUMN IF NOT EXISTS "contractId" TEXT,
  ADD COLUMN IF NOT EXISTS "status" "StudentLifecycleStatus" NOT NULL DEFAULT 'LEAD',
  ADD COLUMN IF NOT EXISTS "leadName" TEXT,
  ADD COLUMN IF NOT EXISTS "leadPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "leadPhoneNormalized" TEXT,
  ADD COLUMN IF NOT EXISTS "leadEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "leadEmailNormalized" TEXT,
  ADD COLUMN IF NOT EXISTS "leadCpf" TEXT,
  ADD COLUMN IF NOT EXISTS "leadCpfNormalized" TEXT,
  ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "leadOrigin" TEXT,
  ADD COLUMN IF NOT EXISTS "createdByProfessorId" TEXT,
  ADD COLUMN IF NOT EXISTS "invitedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "readyForEnrollmentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "activatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "discardedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "discardReason" TEXT,
  ADD COLUMN IF NOT EXISTS "discardedByProfessorId" TEXT;

ALTER TABLE "Aluno" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Aluno" ALTER COLUMN "professorId" DROP NOT NULL;
ALTER TABLE "Aluno" ALTER COLUMN "age" DROP NOT NULL;

-- A conta e global, mas o vinculo operacional e tenant-scoped. Remover a
-- unicidade global antiga e recriar a constraint composta por contrato.
DROP INDEX IF EXISTS "Athlete_userId_key";
DROP INDEX IF EXISTS "Aluno_userId_key";
DROP INDEX IF EXISTS "Aluno_contractId_leadEmailNormalized_key";
DROP INDEX IF EXISTS "Aluno_contractId_leadPhoneNormalized_key";
DROP INDEX IF EXISTS "Profile_cpf_key";
CREATE INDEX IF NOT EXISTS "Profile_cpf_idx" ON "Profile"("cpf");

-- Backfill estrutural dos alunos existentes. Nenhum ID ou relacionamento muda.
UPDATE "Aluno" a
SET "contractId" = p."contractId"
FROM "Professor" p
WHERE a."professorId" = p."id"
  AND a."contractId" IS NULL;

DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM "Aluno" WHERE "contractId" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'student_lifecycle_domain migration: % Aluno rows without a resolvable contractId; backfill manually before rerunning', orphan_count;
  END IF;
END $$;

UPDATE "Aluno"
SET "status" = 'ACTIVE_STUDENT',
    "activatedAt" = COALESCE("activatedAt", "createdAt")
WHERE "userId" IS NOT NULL
  AND "professorId" IS NOT NULL
  AND "status" = 'LEAD';

-- Projecoes tenant-scoped derivadas do legado. Esses campos existem para
-- busca/compatibilidade; StudentProfile.identificationData e a fonte canonica.
UPDATE "Aluno" a
SET "leadName" = COALESCE(a."leadName", p."name"),
    "leadEmail" = COALESCE(a."leadEmail", u."email"),
    "leadEmailNormalized" = COALESCE(a."leadEmailNormalized", lower(trim(u."email"))),
    "leadPhone" = COALESCE(a."leadPhone", p."phone"),
    "leadPhoneNormalized" = COALESCE(
      a."leadPhoneNormalized",
      NULLIF(regexp_replace(COALESCE(p."phone", ''), '\\D', '', 'g'), '')
    ),
    "leadCpf" = COALESCE(a."leadCpf", p."cpf"),
    "leadCpfNormalized" = COALESCE(
      a."leadCpfNormalized",
      NULLIF(regexp_replace(COALESCE(p."cpf", ''), '\\D', '', 'g'), '')
    ),
    "birthDate" = COALESCE(a."birthDate", p."birthDate")
FROM "User" u
LEFT JOIN "Profile" p ON p."userId" = u."id"
WHERE a."userId" = u."id";

-- Garantir uma identidade canonica para todo aluno existente sem sobrescrever
-- dados segmentados ja migrados.
INSERT INTO "StudentProfile" (
  "id",
  "alunoId",
  "contractId",
  "sourceType",
  "sourceReference",
  "recordedByUserId",
  "identificationData",
  "createdAt",
  "updatedAt"
)
SELECT
  'student-profile-' || a."id",
  a."id",
  a."contractId",
  'system'::"StudentRecordSourceType",
  'issue-268-backfill',
  a."userId",
  jsonb_strip_nulls(jsonb_build_object(
    'name', a."leadName",
    'email', a."leadEmail",
    'phone', a."leadPhone",
    'cpf', a."leadCpf",
    'birthDate', CASE
      WHEN a."birthDate" IS NULL THEN NULL
      ELSE to_char(a."birthDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    END
  )),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Aluno" a
ON CONFLICT ("alunoId") DO NOTHING;

ALTER TABLE "Aluno" ALTER COLUMN "contractId" SET NOT NULL;

-- CreateTable (idempotente)
CREATE TABLE IF NOT EXISTS "StudentOnboardingProcess" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "formVersion" TEXT,
    "privacyNoticeVersion" TEXT,
    "privacyAcceptedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "lastSavedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByProfessorId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "claimedByUserId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "healthModuleStatus" "StudentOnboardingModuleStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "parqModuleStatus" "StudentOnboardingModuleStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentOnboardingProcess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StudentLifecycleEvent" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "eventType" "StudentLifecycleEventType" NOT NULL,
    "actorUserId" TEXT,
    "actorProfessorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentLifecycleEvent_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "StudentOnboardingProcess_alunoId_key"
  ON "StudentOnboardingProcess"("alunoId");

-- Backfill do processo para alunos legados. Sem consentir, atribuir origem ou
-- inventar atores/datas historicas. O indice unico acima torna o UPSERT seguro.
INSERT INTO "StudentOnboardingProcess" (
  "id", "alunoId", "contractId", "convertedAt", "createdAt", "updatedAt"
)
SELECT
  'student-onboarding-' || a."id",
  a."id",
  a."contractId",
  CASE WHEN a."status" = 'ACTIVE_STUDENT' THEN a."activatedAt" ELSE NULL END,
  a."createdAt",
  CURRENT_TIMESTAMP
FROM "Aluno" a
ON CONFLICT ("alunoId") DO NOTHING;
CREATE INDEX IF NOT EXISTS "StudentOnboardingProcess_contractId_idx"
  ON "StudentOnboardingProcess"("contractId");
CREATE INDEX IF NOT EXISTS "StudentOnboardingProcess_claimedByUserId_idx"
  ON "StudentOnboardingProcess"("claimedByUserId");
CREATE INDEX IF NOT EXISTS "StudentLifecycleEvent_alunoId_createdAt_idx"
  ON "StudentLifecycleEvent"("alunoId", "createdAt");
CREATE INDEX IF NOT EXISTS "StudentLifecycleEvent_contractId_createdAt_idx"
  ON "StudentLifecycleEvent"("contractId", "createdAt");
CREATE INDEX IF NOT EXISTS "Aluno_contractId_status_idx"
  ON "Aluno"("contractId", "status");
CREATE INDEX IF NOT EXISTS "Aluno_createdByProfessorId_idx"
  ON "Aluno"("createdByProfessorId");
CREATE INDEX IF NOT EXISTS "Aluno_discardedByProfessorId_idx"
  ON "Aluno"("discardedByProfessorId");
CREATE UNIQUE INDEX IF NOT EXISTS "Aluno_contractId_userId_key"
  ON "Aluno"("contractId", "userId");
CREATE INDEX IF NOT EXISTS "Aluno_contractId_leadEmailNormalized_idx"
  ON "Aluno"("contractId", "leadEmailNormalized");
CREATE INDEX IF NOT EXISTS "Aluno_contractId_leadPhoneNormalized_idx"
  ON "Aluno"("contractId", "leadPhoneNormalized");
CREATE UNIQUE INDEX IF NOT EXISTS "Aluno_contractId_leadCpfNormalized_key"
  ON "Aluno"("contractId", "leadCpfNormalized");

-- Foreign keys, adicionadas apenas quando ausentes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Aluno_contractId_fkey') THEN
    ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_contractId_fkey"
      FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Aluno_createdByProfessorId_fkey') THEN
    ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_createdByProfessorId_fkey"
      FOREIGN KEY ("createdByProfessorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Aluno_discardedByProfessorId_fkey') THEN
    ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_discardedByProfessorId_fkey"
      FOREIGN KEY ("discardedByProfessorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudentOnboardingProcess_alunoId_fkey') THEN
    ALTER TABLE "StudentOnboardingProcess" ADD CONSTRAINT "StudentOnboardingProcess_alunoId_fkey"
      FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudentOnboardingProcess_contractId_fkey') THEN
    ALTER TABLE "StudentOnboardingProcess" ADD CONSTRAINT "StudentOnboardingProcess_contractId_fkey"
      FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudentLifecycleEvent_alunoId_fkey') THEN
    ALTER TABLE "StudentLifecycleEvent" ADD CONSTRAINT "StudentLifecycleEvent_alunoId_fkey"
      FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudentLifecycleEvent_contractId_fkey') THEN
    ALTER TABLE "StudentLifecycleEvent" ADD CONSTRAINT "StudentLifecycleEvent_contractId_fkey"
      FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Compatibilidade para rollback da aplicacao anterior: o codigo antigo ainda
-- insere Aluno sem contractId/status. O trigger deriva o tenant do professor e
-- classifica o cadastro completo como ACTIVE_STUDENT antes das constraints.
CREATE OR REPLACE FUNCTION "student_lifecycle_legacy_aluno_defaults"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."contractId" IS NULL AND NEW."professorId" IS NOT NULL THEN
    SELECT p."contractId" INTO NEW."contractId"
    FROM "Professor" p
    WHERE p."id" = NEW."professorId";
  END IF;

  IF NEW."status" = 'LEAD'
     AND NEW."userId" IS NOT NULL
     AND NEW."professorId" IS NOT NULL
     AND NEW."age" IS NOT NULL THEN
    NEW."status" := 'ACTIVE_STUDENT';
    NEW."activatedAt" := COALESCE(NEW."activatedAt", NEW."createdAt", CURRENT_TIMESTAMP);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "student_lifecycle_legacy_aluno_defaults_trigger" ON "Aluno";
CREATE TRIGGER "student_lifecycle_legacy_aluno_defaults_trigger"
BEFORE INSERT OR UPDATE OF "professorId", "userId", "age", "contractId", "status"
ON "Aluno"
FOR EACH ROW
EXECUTE FUNCTION "student_lifecycle_legacy_aluno_defaults"();

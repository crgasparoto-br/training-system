-- Issue #268: ciclo unico lead -> aluno, identidade canonica e migrations.
--
-- Esta migration NAO descarta nenhum dado historico. Alunos ja existentes sao
-- classificados como ACTIVE_STUDENT sem troca de id nem de relacionamentos.
-- E idempotente: pode ser reexecutada com seguranca porque so altera linhas
-- cujo contractId/status ainda nao foram preenchidos por ela.

-- CreateEnum
CREATE TYPE "StudentLifecycleStatus" AS ENUM ('LEAD', 'INVITED', 'PRE_REGISTRATION_IN_PROGRESS', 'PRE_REGISTRATION_COMPLETED', 'READY_FOR_ENROLLMENT', 'ACTIVE_STUDENT', 'DISCARDED');

-- CreateEnum
CREATE TYPE "StudentOnboardingModuleStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "StudentLifecycleEventType" AS ENUM ('LEAD_CREATED', 'IDENTIFIER_NORMALIZED_CHANGED', 'STATUS_CHANGED', 'ACCOUNT_LINKED', 'ACCOUNT_UNLINKED', 'PRE_REGISTRATION_COMPLETED', 'ADMIN_REVIEWED', 'DISCARDED', 'REOPENED', 'CONVERTED_TO_ACTIVE_STUDENT');

-- AlterTable: novas colunas do ciclo (todas nullable neste primeiro passo,
-- inclusive contractId, para permitir o backfill antes de travar NOT NULL).
ALTER TABLE "Aluno"
  ADD COLUMN "contractId" TEXT,
  ADD COLUMN "status" "StudentLifecycleStatus" NOT NULL DEFAULT 'LEAD',
  ADD COLUMN "leadName" TEXT,
  ADD COLUMN "leadPhone" TEXT,
  ADD COLUMN "leadPhoneNormalized" TEXT,
  ADD COLUMN "leadEmail" TEXT,
  ADD COLUMN "leadEmailNormalized" TEXT,
  ADD COLUMN "leadCpf" TEXT,
  ADD COLUMN "leadCpfNormalized" TEXT,
  ADD COLUMN "birthDate" TIMESTAMP(3),
  ADD COLUMN "leadOrigin" TEXT,
  ADD COLUMN "createdByProfessorId" TEXT,
  ADD COLUMN "invitedAt" TIMESTAMP(3),
  ADD COLUMN "readyForEnrollmentAt" TIMESTAMP(3),
  ADD COLUMN "activatedAt" TIMESTAMP(3),
  ADD COLUMN "discardedAt" TIMESTAMP(3),
  ADD COLUMN "discardReason" TEXT,
  ADD COLUMN "discardedByProfessorId" TEXT;

-- AlterTable: relaxar obrigatoriedade que impedia representar um lead
-- incompleto (sem conta, sem professor, sem idade).
ALTER TABLE "Aluno" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Aluno" ALTER COLUMN "professorId" DROP NOT NULL;
ALTER TABLE "Aluno" ALTER COLUMN "age" DROP NOT NULL;

-- Backfill: todo Aluno existente antes desta migration tem professorId e
-- userId preenchidos (eram obrigatorios). Classificar como ACTIVE_STUDENT,
-- derivar contractId do professor responsavel e preservar createdAt como
-- activatedAt (nao inventamos data de ativacao: reaproveitamos a data real
-- de criacao do registro).
UPDATE "Aluno" a
SET "contractId" = p."contractId",
    "status" = 'ACTIVE_STUDENT',
    "activatedAt" = a."createdAt"
FROM "Professor" p
WHERE a."professorId" = p."id"
  AND a."contractId" IS NULL;

-- Guarda de seguranca: se sobrar algum Aluno sem contractId (ex.: dado
-- historico inconsistente fora do padrao userId/professorId obrigatorios),
-- a migration falha alto e explicito em vez de truncar/descartar dado.
DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM "Aluno" WHERE "contractId" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'student_lifecycle_domain migration: % Aluno rows without a resolvable contractId; backfill manually before rerunning', orphan_count;
  END IF;
END $$;

-- AlterTable: agora que todo registro tem contractId, travar NOT NULL.
ALTER TABLE "Aluno" ALTER COLUMN "contractId" SET NOT NULL;

-- CreateTable
CREATE TABLE "StudentOnboardingProcess" (
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

-- CreateTable
CREATE TABLE "StudentLifecycleEvent" (
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

-- CreateIndex
CREATE UNIQUE INDEX "StudentOnboardingProcess_alunoId_key" ON "StudentOnboardingProcess"("alunoId");
CREATE INDEX "StudentOnboardingProcess_contractId_idx" ON "StudentOnboardingProcess"("contractId");
CREATE INDEX "StudentOnboardingProcess_claimedByUserId_idx" ON "StudentOnboardingProcess"("claimedByUserId");

CREATE INDEX "StudentLifecycleEvent_alunoId_createdAt_idx" ON "StudentLifecycleEvent"("alunoId", "createdAt");
CREATE INDEX "StudentLifecycleEvent_contractId_createdAt_idx" ON "StudentLifecycleEvent"("contractId", "createdAt");

CREATE INDEX "Aluno_contractId_status_idx" ON "Aluno"("contractId", "status");
CREATE INDEX "Aluno_createdByProfessorId_idx" ON "Aluno"("createdByProfessorId");
CREATE INDEX "Aluno_discardedByProfessorId_idx" ON "Aluno"("discardedByProfessorId");

-- Unicidade tenant-scoped dos identificadores de lead. NULL nao colide em
-- indices unicos do Postgres, entao "somente telefone" ou "somente e-mail"
-- continuam permitidos sem violar a constraint do outro campo.
CREATE UNIQUE INDEX "Aluno_contractId_leadEmailNormalized_key" ON "Aluno"("contractId", "leadEmailNormalized");
CREATE UNIQUE INDEX "Aluno_contractId_leadPhoneNormalized_key" ON "Aluno"("contractId", "leadPhoneNormalized");
CREATE UNIQUE INDEX "Aluno_contractId_leadCpfNormalized_key" ON "Aluno"("contractId", "leadCpfNormalized");

-- AddForeignKey
ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_createdByProfessorId_fkey" FOREIGN KEY ("createdByProfessorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_discardedByProfessorId_fkey" FOREIGN KEY ("discardedByProfessorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StudentOnboardingProcess" ADD CONSTRAINT "StudentOnboardingProcess_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentOnboardingProcess" ADD CONSTRAINT "StudentOnboardingProcess_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentLifecycleEvent" ADD CONSTRAINT "StudentLifecycleEvent_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentLifecycleEvent" ADD CONSTRAINT "StudentLifecycleEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "ProntuarioRecordStatus" AS ENUM ('open', 'closed', 'archived');
CREATE TYPE "ProntuarioItemStatus" AS ENUM ('active', 'monitoring', 'resolved', 'archived');
CREATE TYPE "ProntuarioActivityType" AS ENUM ('running', 'strength', 'mobility', 'sport', 'occupational', 'other');
CREATE TYPE "ProntuarioMedicationProcedureType" AS ENUM ('medication', 'supplement', 'procedure', 'exam', 'therapy', 'other');
CREATE TYPE "ProntuarioPainCaseStatus" AS ENUM ('active', 'monitoring', 'resolved', 'archived');

CREATE TABLE "StudentParqSubmission" (
  "id" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "sourceType" "StudentRecordSourceType" NOT NULL DEFAULT 'student',
  "submittedByUserId" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "responses" JSONB NOT NULL,
  "positiveItems" JSONB,
  "declarationAccepted" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentParqSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProntuarioRecord" (
  "id" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "professorId" TEXT,
  "code" TEXT NOT NULL,
  "status" "ProntuarioRecordStatus" NOT NULL DEFAULT 'open',
  "recordDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "summary" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "ProntuarioRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProntuarioGoal" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "ProntuarioItemStatus" NOT NULL DEFAULT 'active',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "targetDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProntuarioGoal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProntuarioAnamnesisFollowUp" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "parqSubmissionId" TEXT,
  "itemKey" TEXT NOT NULL,
  "itemLabel" TEXT NOT NULL,
  "status" "ProntuarioItemStatus" NOT NULL DEFAULT 'active',
  "followUpNotes" TEXT,
  "actionPlan" TEXT,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProntuarioAnamnesisFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProntuarioActivityHistory" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "activityType" "ProntuarioActivityType" NOT NULL DEFAULT 'other',
  "description" TEXT NOT NULL,
  "frequency" TEXT,
  "duration" TEXT,
  "intensity" TEXT,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProntuarioActivityHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProntuarioMedicationProcedure" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "type" "ProntuarioMedicationProcedureType" NOT NULL,
  "name" TEXT NOT NULL,
  "dosage" TEXT,
  "frequency" TEXT,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProntuarioMedicationProcedure_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProntuarioPainCase" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "region" TEXT,
  "status" "ProntuarioPainCaseStatus" NOT NULL DEFAULT 'active',
  "onsetDate" TIMESTAMP(3),
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "ProntuarioPainCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProntuarioPainFollowUp" (
  "id" TEXT NOT NULL,
  "painCaseId" TEXT NOT NULL,
  "followUpAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "intensity" INTEGER,
  "notes" TEXT,
  "conduct" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProntuarioPainFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProntuarioDiscomfortSnapshot" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProntuarioDiscomfortSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProntuarioDiscomfortEntry" (
  "id" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "regionId" TEXT NOT NULL,
  "regionName" TEXT NOT NULL,
  "discomfortTypes" TEXT[],
  "intensity" INTEGER NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProntuarioDiscomfortEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudentParqSubmission_contractId_submittedAt_idx" ON "StudentParqSubmission"("contractId", "submittedAt");
CREATE INDEX "StudentParqSubmission_alunoId_submittedAt_idx" ON "StudentParqSubmission"("alunoId", "submittedAt");
CREATE UNIQUE INDEX "ProntuarioRecord_contractId_alunoId_code_key" ON "ProntuarioRecord"("contractId", "alunoId", "code");
CREATE INDEX "ProntuarioRecord_contractId_alunoId_recordDate_idx" ON "ProntuarioRecord"("contractId", "alunoId", "recordDate");
CREATE INDEX "ProntuarioRecord_professorId_idx" ON "ProntuarioRecord"("professorId");
CREATE INDEX "ProntuarioRecord_status_idx" ON "ProntuarioRecord"("status");
CREATE INDEX "ProntuarioGoal_recordId_status_idx" ON "ProntuarioGoal"("recordId", "status");
CREATE INDEX "ProntuarioGoal_targetDate_idx" ON "ProntuarioGoal"("targetDate");
CREATE INDEX "ProntuarioAnamnesisFollowUp_recordId_status_idx" ON "ProntuarioAnamnesisFollowUp"("recordId", "status");
CREATE INDEX "ProntuarioAnamnesisFollowUp_parqSubmissionId_idx" ON "ProntuarioAnamnesisFollowUp"("parqSubmissionId");
CREATE INDEX "ProntuarioAnamnesisFollowUp_itemKey_idx" ON "ProntuarioAnamnesisFollowUp"("itemKey");
CREATE INDEX "ProntuarioActivityHistory_recordId_idx" ON "ProntuarioActivityHistory"("recordId");
CREATE INDEX "ProntuarioActivityHistory_activityType_idx" ON "ProntuarioActivityHistory"("activityType");
CREATE INDEX "ProntuarioMedicationProcedure_recordId_type_idx" ON "ProntuarioMedicationProcedure"("recordId", "type");
CREATE INDEX "ProntuarioPainCase_recordId_status_idx" ON "ProntuarioPainCase"("recordId", "status");
CREATE INDEX "ProntuarioPainFollowUp_painCaseId_followUpAt_idx" ON "ProntuarioPainFollowUp"("painCaseId", "followUpAt");
CREATE INDEX "ProntuarioDiscomfortSnapshot_contractId_alunoId_snapshotAt_idx" ON "ProntuarioDiscomfortSnapshot"("contractId", "alunoId", "snapshotAt");
CREATE INDEX "ProntuarioDiscomfortSnapshot_recordId_snapshotAt_idx" ON "ProntuarioDiscomfortSnapshot"("recordId", "snapshotAt");
CREATE INDEX "ProntuarioDiscomfortEntry_snapshotId_idx" ON "ProntuarioDiscomfortEntry"("snapshotId");
CREATE INDEX "ProntuarioDiscomfortEntry_regionId_idx" ON "ProntuarioDiscomfortEntry"("regionId");

ALTER TABLE "StudentParqSubmission" ADD CONSTRAINT "StudentParqSubmission_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentParqSubmission" ADD CONSTRAINT "StudentParqSubmission_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProntuarioRecord" ADD CONSTRAINT "ProntuarioRecord_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProntuarioRecord" ADD CONSTRAINT "ProntuarioRecord_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProntuarioRecord" ADD CONSTRAINT "ProntuarioRecord_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProntuarioGoal" ADD CONSTRAINT "ProntuarioGoal_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ProntuarioRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProntuarioAnamnesisFollowUp" ADD CONSTRAINT "ProntuarioAnamnesisFollowUp_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ProntuarioRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProntuarioAnamnesisFollowUp" ADD CONSTRAINT "ProntuarioAnamnesisFollowUp_parqSubmissionId_fkey" FOREIGN KEY ("parqSubmissionId") REFERENCES "StudentParqSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProntuarioActivityHistory" ADD CONSTRAINT "ProntuarioActivityHistory_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ProntuarioRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProntuarioMedicationProcedure" ADD CONSTRAINT "ProntuarioMedicationProcedure_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ProntuarioRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProntuarioPainCase" ADD CONSTRAINT "ProntuarioPainCase_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ProntuarioRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProntuarioPainFollowUp" ADD CONSTRAINT "ProntuarioPainFollowUp_painCaseId_fkey" FOREIGN KEY ("painCaseId") REFERENCES "ProntuarioPainCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProntuarioDiscomfortSnapshot" ADD CONSTRAINT "ProntuarioDiscomfortSnapshot_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ProntuarioRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProntuarioDiscomfortSnapshot" ADD CONSTRAINT "ProntuarioDiscomfortSnapshot_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProntuarioDiscomfortSnapshot" ADD CONSTRAINT "ProntuarioDiscomfortSnapshot_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProntuarioDiscomfortEntry" ADD CONSTRAINT "ProntuarioDiscomfortEntry_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ProntuarioDiscomfortSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

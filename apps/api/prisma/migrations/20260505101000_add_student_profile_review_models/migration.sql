-- CreateEnum
CREATE TYPE "StudentProfileReviewStatus" AS ENUM (
  'pending',
  'completed_no_changes',
  'completed_with_changes',
  'expired',
  'canceled'
);

-- CreateTable
CREATE TABLE "ProfileReviewPolicy" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "defaultReviewPeriodMonths" INTEGER NOT NULL DEFAULT 4,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sections" JSONB NOT NULL,
  "reminderBeforeDays" INTEGER,
  "reminderAfterDays" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProfileReviewPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlunoProfileReviewSettings" (
  "id" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "reviewPeriodMonths" INTEGER,
  "nextReviewAt" TIMESTAMP(3),
  "isReviewRequired" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AlunoProfileReviewSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProfileReview" (
  "id" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "requestedByUserId" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "status" "StudentProfileReviewStatus" NOT NULL DEFAULT 'pending',
  "sectionsRequested" JSONB,
  "snapshotBefore" JSONB,
  "snapshotAfter" JSONB,
  "changedFields" JSONB,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedByUserId" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "nextReviewAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StudentProfileReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfileReviewPolicy_contractId_isActive_idx" ON "ProfileReviewPolicy"("contractId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AlunoProfileReviewSettings_alunoId_key" ON "AlunoProfileReviewSettings"("alunoId");

-- CreateIndex
CREATE INDEX "AlunoProfileReviewSettings_nextReviewAt_idx" ON "AlunoProfileReviewSettings"("nextReviewAt");

-- CreateIndex
CREATE INDEX "AlunoProfileReviewSettings_isReviewRequired_idx" ON "AlunoProfileReviewSettings"("isReviewRequired");

-- CreateIndex
CREATE INDEX "StudentProfileReview_alunoId_status_idx" ON "StudentProfileReview"("alunoId", "status");

-- CreateIndex
CREATE INDEX "StudentProfileReview_requestedAt_idx" ON "StudentProfileReview"("requestedAt");

-- CreateIndex
CREATE INDEX "StudentProfileReview_dueAt_idx" ON "StudentProfileReview"("dueAt");

-- CreateIndex
CREATE INDEX "StudentProfileReview_nextReviewAt_idx" ON "StudentProfileReview"("nextReviewAt");

-- CreateIndex
CREATE INDEX "StudentProfileReview_requestedByUserId_idx" ON "StudentProfileReview"("requestedByUserId");

-- CreateIndex
CREATE INDEX "StudentProfileReview_approvedByUserId_idx" ON "StudentProfileReview"("approvedByUserId");

-- CreateIndex
CREATE INDEX "StudentProfileReview_rejectedByUserId_idx" ON "StudentProfileReview"("rejectedByUserId");

-- AddForeignKey
ALTER TABLE "ProfileReviewPolicy"
ADD CONSTRAINT "ProfileReviewPolicy_contractId_fkey"
FOREIGN KEY ("contractId") REFERENCES "Contract"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlunoProfileReviewSettings"
ADD CONSTRAINT "AlunoProfileReviewSettings_alunoId_fkey"
FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfileReview"
ADD CONSTRAINT "StudentProfileReview_alunoId_fkey"
FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfileReview"
ADD CONSTRAINT "StudentProfileReview_requestedByUserId_fkey"
FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfileReview"
ADD CONSTRAINT "StudentProfileReview_approvedByUserId_fkey"
FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfileReview"
ADD CONSTRAINT "StudentProfileReview_rejectedByUserId_fkey"
FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

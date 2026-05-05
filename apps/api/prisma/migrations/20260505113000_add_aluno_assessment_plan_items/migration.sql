-- CreateTable
CREATE TABLE "AlunoAssessmentPlanItem" (
  "id" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "assessmentTypeId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "cadenceMonths" INTEGER,
  "startDate" TIMESTAMP(3),
  "nextDueDate" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AlunoAssessmentPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AlunoAssessmentPlanItem_alunoId_assessmentTypeId_key"
ON "AlunoAssessmentPlanItem"("alunoId", "assessmentTypeId");

-- CreateIndex
CREATE INDEX "AlunoAssessmentPlanItem_alunoId_isActive_idx"
ON "AlunoAssessmentPlanItem"("alunoId", "isActive");

-- CreateIndex
CREATE INDEX "AlunoAssessmentPlanItem_nextDueDate_idx"
ON "AlunoAssessmentPlanItem"("nextDueDate");

-- AddForeignKey
ALTER TABLE "AlunoAssessmentPlanItem"
ADD CONSTRAINT "AlunoAssessmentPlanItem_alunoId_fkey"
FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlunoAssessmentPlanItem"
ADD CONSTRAINT "AlunoAssessmentPlanItem_assessmentTypeId_fkey"
FOREIGN KEY ("assessmentTypeId") REFERENCES "AssessmentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "AssessmentAuditAction" AS ENUM ('update', 'delete');

-- CreateTable
CREATE TABLE "AssessmentAuditLog" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "educatorId" TEXT NOT NULL,
    "action" "AssessmentAuditAction" NOT NULL,
    "beforeData" JSONB,
    "afterData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssessmentAuditLog_assessmentId_idx" ON "AssessmentAuditLog"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentAuditLog_educatorId_idx" ON "AssessmentAuditLog"("educatorId");

-- AddForeignKey
ALTER TABLE "AssessmentAuditLog" ADD CONSTRAINT "AssessmentAuditLog_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAuditLog" ADD CONSTRAINT "AssessmentAuditLog_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "Educator"("id") ON DELETE CASCADE ON UPDATE CASCADE;


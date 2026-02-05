-- CreateEnum
CREATE TYPE "AssessmentScheduleType" AS ENUM ('fixed_interval', 'after_type');

-- AlterTable
ALTER TABLE "ContractDataCloneLog"
ADD COLUMN     "assessmentTypesCreated" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "assessmentTypesSkipped" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AssessmentType" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "scheduleType" "AssessmentScheduleType" NOT NULL,
    "intervalMonths" INTEGER,
    "afterTypeId" TEXT,
    "offsetMonths" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "assessmentDate" TIMESTAMP(3) NOT NULL,
    "filePath" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "extractedData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssessmentType_contractId_idx" ON "AssessmentType"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentType_contractId_code_key" ON "AssessmentType"("contractId", "code");

-- CreateIndex
CREATE INDEX "Assessment_athleteId_idx" ON "Assessment"("athleteId");

-- CreateIndex
CREATE INDEX "Assessment_typeId_idx" ON "Assessment"("typeId");

-- CreateIndex
CREATE INDEX "Assessment_assessmentDate_idx" ON "Assessment"("assessmentDate");

-- AddForeignKey
ALTER TABLE "AssessmentType" ADD CONSTRAINT "AssessmentType_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentType" ADD CONSTRAINT "AssessmentType_afterTypeId_fkey" FOREIGN KEY ("afterTypeId") REFERENCES "AssessmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "AssessmentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;


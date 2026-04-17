-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other');

-- AlterTable
ALTER TABLE "Profile"
ADD COLUMN "birthDate" TIMESTAMP(3),
ADD COLUMN "gender" "Gender";

-- AlterTable
ALTER TABLE "Aluno"
ADD COLUMN "systolicPressure" INTEGER,
ADD COLUMN "diastolicPressure" INTEGER;

-- CreateTable
CREATE TABLE "AlunoIntakeForm" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "assessmentDate" TIMESTAMP(3),
    "mainGoal" TEXT,
    "medicalHistory" TEXT,
    "currentMedications" TEXT,
    "injuriesHistory" TEXT,
    "trainingBackground" TEXT,
    "observations" TEXT,
    "parqResponses" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlunoIntakeForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AlunoIntakeForm_alunoId_key" ON "AlunoIntakeForm"("alunoId");

-- CreateIndex
CREATE INDEX "AlunoIntakeForm_assessmentDate_idx" ON "AlunoIntakeForm"("assessmentDate");

-- AddForeignKey
ALTER TABLE "AlunoIntakeForm" ADD CONSTRAINT "AlunoIntakeForm_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
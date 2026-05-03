-- CreateEnum
CREATE TYPE "AnthropometrySegmentType" AS ENUM ('principal', 'opcional', 'personalizado');

-- CreateEnum
CREATE TYPE "AnthropometrySexApplicability" AS ENUM ('masculino', 'feminino', 'ambos');

-- CreateTable
CREATE TABLE "AnthropometrySegment" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "technicalDescription" TEXT,
    "sexApplicability" "AnthropometrySexApplicability" NOT NULL DEFAULT 'ambos',
    "type" "AnthropometrySegmentType" NOT NULL DEFAULT 'principal',
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "importByDefault" BOOLEAN NOT NULL DEFAULT true,
    "importObservationByDefault" BOOLEAN NOT NULL DEFAULT false,
    "femaleImageUrl" TEXT,
    "maleImageUrl" TEXT,
    "tutorialVideoUrl" TEXT,
    "formulaHint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnthropometrySegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnthropometryAssessment" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "professorId" TEXT,
    "code" TEXT NOT NULL,
    "assessmentDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnthropometryAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnthropometryAssessmentValue" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "value" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'cm',
    "observation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnthropometryAssessmentValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnthropometryObservation" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "segmentId" TEXT,
    "text" TEXT NOT NULL,
    "importable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnthropometryObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnthropometrySegment_contractId_name_key" ON "AnthropometrySegment"("contractId", "name");

-- CreateIndex
CREATE INDEX "AnthropometrySegment_contractId_active_order_idx" ON "AnthropometrySegment"("contractId", "active", "order");

-- CreateIndex
CREATE INDEX "AnthropometrySegment_contractId_type_idx" ON "AnthropometrySegment"("contractId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "AnthropometryAssessment_contractId_alunoId_code_key" ON "AnthropometryAssessment"("contractId", "alunoId", "code");

-- CreateIndex
CREATE INDEX "AnthropometryAssessment_contractId_alunoId_assessmentDate_idx" ON "AnthropometryAssessment"("contractId", "alunoId", "assessmentDate");

-- CreateIndex
CREATE INDEX "AnthropometryAssessment_professorId_idx" ON "AnthropometryAssessment"("professorId");

-- CreateIndex
CREATE UNIQUE INDEX "AnthropometryAssessmentValue_assessmentId_segmentId_key" ON "AnthropometryAssessmentValue"("assessmentId", "segmentId");

-- CreateIndex
CREATE INDEX "AnthropometryAssessmentValue_segmentId_idx" ON "AnthropometryAssessmentValue"("segmentId");

-- CreateIndex
CREATE INDEX "AnthropometryObservation_assessmentId_idx" ON "AnthropometryObservation"("assessmentId");

-- CreateIndex
CREATE INDEX "AnthropometryObservation_segmentId_idx" ON "AnthropometryObservation"("segmentId");

-- AddForeignKey
ALTER TABLE "AnthropometrySegment" ADD CONSTRAINT "AnthropometrySegment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnthropometryAssessment" ADD CONSTRAINT "AnthropometryAssessment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnthropometryAssessment" ADD CONSTRAINT "AnthropometryAssessment_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnthropometryAssessment" ADD CONSTRAINT "AnthropometryAssessment_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnthropometryAssessmentValue" ADD CONSTRAINT "AnthropometryAssessmentValue_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "AnthropometryAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnthropometryAssessmentValue" ADD CONSTRAINT "AnthropometryAssessmentValue_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "AnthropometrySegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnthropometryObservation" ADD CONSTRAINT "AnthropometryObservation_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "AnthropometryAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnthropometryObservation" ADD CONSTRAINT "AnthropometryObservation_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "AnthropometrySegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

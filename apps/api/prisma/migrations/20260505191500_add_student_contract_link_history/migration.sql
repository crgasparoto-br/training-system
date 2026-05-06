-- CreateEnum
CREATE TYPE "StudentContractStatus" AS ENUM (
  'draft',
  'pending_signature',
  'active',
  'expired',
  'canceled',
  'terminated'
);

-- CreateTable
CREATE TABLE "StudentContract" (
  "id" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "serviceId" TEXT,
  "status" "StudentContractStatus" NOT NULL DEFAULT 'draft',
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "signedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "amount" DECIMAL(10,2),
  "paymentDay" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StudentContract_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Aluno" ADD COLUMN "currentStudentContractId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StudentContract_contractId_key" ON "StudentContract"("contractId");

-- CreateIndex
CREATE INDEX "StudentContract_alunoId_idx" ON "StudentContract"("alunoId");

-- CreateIndex
CREATE INDEX "StudentContract_contractId_idx" ON "StudentContract"("contractId");

-- CreateIndex
CREATE INDEX "StudentContract_status_idx" ON "StudentContract"("status");

-- CreateIndex
CREATE INDEX "StudentContract_startDate_idx" ON "StudentContract"("startDate");

-- CreateIndex
CREATE INDEX "StudentContract_endDate_idx" ON "StudentContract"("endDate");

-- CreateIndex
CREATE UNIQUE INDEX "StudentContract_single_active_per_aluno_idx"
ON "StudentContract"("alunoId")
WHERE "status" = 'active';

-- CreateIndex
CREATE INDEX "Aluno_currentStudentContractId_idx" ON "Aluno"("currentStudentContractId");

-- AddForeignKey
ALTER TABLE "StudentContract"
ADD CONSTRAINT "StudentContract_alunoId_fkey"
FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentContract"
ADD CONSTRAINT "StudentContract_contractId_fkey"
FOREIGN KEY ("contractId") REFERENCES "GeneratedContract"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentContract"
ADD CONSTRAINT "StudentContract_serviceId_fkey"
FOREIGN KEY ("serviceId") REFERENCES "ServiceOption"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aluno"
ADD CONSTRAINT "Aluno_currentStudentContractId_fkey"
FOREIGN KEY ("currentStudentContractId") REFERENCES "StudentContract"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

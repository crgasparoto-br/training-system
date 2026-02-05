-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('academy', 'personal');

-- CreateEnum
CREATE TYPE "EducatorRole" AS ENUM ('master', 'educator');

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "type" "ContractType" NOT NULL,
    "document" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Educator" ADD COLUMN     "contractId" TEXT,
ADD COLUMN     "role" "EducatorRole" NOT NULL DEFAULT 'educator';

-- Data migration for existing educators
INSERT INTO "Contract" ("id", "type", "document", "createdAt", "updatedAt")
SELECT CONCAT('contract_', "id"), 'personal', CONCAT('TEMP-', "id"), NOW(), NOW()
FROM "Educator";

UPDATE "Educator"
SET "contractId" = CONCAT('contract_', "id"),
    "role" = 'master'
WHERE "contractId" IS NULL;

-- Enforce NOT NULL after backfill
ALTER TABLE "Educator" ALTER COLUMN "contractId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Contract_document_key" ON "Contract"("document");

-- CreateIndex
CREATE INDEX "Contract_type_idx" ON "Contract"("type");

-- CreateIndex
CREATE INDEX "Educator_contractId_idx" ON "Educator"("contractId");

-- AddForeignKey
ALTER TABLE "Educator" ADD CONSTRAINT "Educator_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

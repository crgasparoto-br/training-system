-- CreateEnum
CREATE TYPE "SubjectiveScaleType" AS ENUM ('PSE', 'PSR');

-- CreateTable
CREATE TABLE "SubjectiveScaleItem" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" "SubjectiveScaleType" NOT NULL,
    "value" INTEGER NOT NULL,
    "label" TEXT,
    "order" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectiveScaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubjectiveScaleItem_contractId_type_idx" ON "SubjectiveScaleItem"("contractId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectiveScaleItem_contractId_type_value_key" ON "SubjectiveScaleItem"("contractId", "type", "value");

-- AddForeignKey
ALTER TABLE "SubjectiveScaleItem" ADD CONSTRAINT "SubjectiveScaleItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

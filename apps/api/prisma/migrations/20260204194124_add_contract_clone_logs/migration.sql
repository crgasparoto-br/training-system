-- DropIndex
DROP INDEX "ExerciseLibrary_category_idx";

-- DropIndex
DROP INDEX "ExerciseLibrary_name_idx";

-- CreateTable
CREATE TABLE "ContractDataCloneLog" (
    "id" TEXT NOT NULL,
    "sourceContractId" TEXT NOT NULL,
    "targetContractId" TEXT NOT NULL,
    "educatorId" TEXT,
    "parametersCreated" INTEGER NOT NULL,
    "parametersSkipped" INTEGER NOT NULL,
    "exercisesCreated" INTEGER NOT NULL,
    "exercisesSkipped" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractDataCloneLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractDataCloneLog_sourceContractId_idx" ON "ContractDataCloneLog"("sourceContractId");

-- CreateIndex
CREATE INDEX "ContractDataCloneLog_targetContractId_idx" ON "ContractDataCloneLog"("targetContractId");

-- CreateIndex
CREATE INDEX "ContractDataCloneLog_educatorId_idx" ON "ContractDataCloneLog"("educatorId");

-- AddForeignKey
ALTER TABLE "ContractDataCloneLog" ADD CONSTRAINT "ContractDataCloneLog_sourceContractId_fkey" FOREIGN KEY ("sourceContractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDataCloneLog" ADD CONSTRAINT "ContractDataCloneLog_targetContractId_fkey" FOREIGN KEY ("targetContractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDataCloneLog" ADD CONSTRAINT "ContractDataCloneLog_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "Educator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

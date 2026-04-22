ALTER TABLE "Profile"
ADD COLUMN "companyDocument" TEXT,
ADD COLUMN "bankName" TEXT,
ADD COLUMN "bankBranch" TEXT,
ADD COLUMN "bankAccount" TEXT,
ADD COLUMN "pixKey" TEXT,
ADD COLUMN "legalFinancialProvidedAt" TIMESTAMP(3),
ADD COLUMN "legalFinancialProvidedByProfessorId" TEXT,
ADD COLUMN "legalFinancialValidatedAt" TIMESTAMP(3),
ADD COLUMN "legalFinancialValidatedByProfessorId" TEXT;

CREATE INDEX "Profile_legalFinancialProvidedByProfessorId_idx" ON "Profile"("legalFinancialProvidedByProfessorId");
CREATE INDEX "Profile_legalFinancialValidatedByProfessorId_idx" ON "Profile"("legalFinancialValidatedByProfessorId");

ALTER TABLE "Profile"
ADD CONSTRAINT "Profile_legalFinancialProvidedByProfessorId_fkey"
FOREIGN KEY ("legalFinancialProvidedByProfessorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Profile"
ADD CONSTRAINT "Profile_legalFinancialValidatedByProfessorId_fkey"
FOREIGN KEY ("legalFinancialValidatedByProfessorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

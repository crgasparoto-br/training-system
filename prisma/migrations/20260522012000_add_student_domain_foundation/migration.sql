CREATE TYPE "StudentRecordSourceType" AS ENUM ('student', 'professional', 'integration', 'system');
CREATE TYPE "StudentAssessmentRecordStatus" AS ENUM ('draft', 'completed', 'superseded', 'archived');
CREATE TYPE "StudentMeasurementValueType" AS ENUM ('text', 'number', 'boolean', 'json');
CREATE TYPE "StudentExternalConnectionStatus" AS ENUM ('pending', 'connected', 'error', 'revoked');

CREATE TABLE "StudentProfile" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "sourceType" "StudentRecordSourceType" NOT NULL DEFAULT 'student',
    "sourceReference" TEXT,
    "recordedByUserId" TEXT,
    "identificationData" JSONB,
    "preferenceData" JSONB,
    "objectiveData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentHealthIntake" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "sourceType" "StudentRecordSourceType" NOT NULL DEFAULT 'student',
    "sourceReference" TEXT,
    "recordedByUserId" TEXT,
    "assessmentDate" TIMESTAMP(3),
    "questionnaireParq" JSONB,
    "questionnaireAha" JSONB,
    "clinicalHistoryData" JSONB,
    "medicationData" JSONB,
    "injuryData" JSONB,
    "allergyData" JSONB,
    "rawFormResponses" JSONB,
    "observations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentHealthIntake_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentAssessmentRecord" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "assessmentCategory" TEXT NOT NULL,
    "assessmentCode" TEXT,
    "title" TEXT,
    "sourceType" "StudentRecordSourceType" NOT NULL DEFAULT 'professional',
    "sourceReference" TEXT,
    "recordedByUserId" TEXT,
    "performedByProfessorId" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "status" "StudentAssessmentRecordStatus" NOT NULL DEFAULT 'completed',
    "summaryData" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentAssessmentRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentAssessmentMeasurement" (
    "id" TEXT NOT NULL,
    "assessmentRecordId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "metricLabel" TEXT,
    "valueType" "StudentMeasurementValueType" NOT NULL DEFAULT 'text',
    "valueText" TEXT,
    "valueNumber" DECIMAL(12,4),
    "valueBoolean" BOOLEAN,
    "valueJson" JSONB,
    "unit" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentAssessmentMeasurement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentFinancialProfile" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "sourceType" "StudentRecordSourceType" NOT NULL DEFAULT 'student',
    "sourceReference" TEXT,
    "recordedByUserId" TEXT,
    "currentServiceName" TEXT,
    "specialCondition" TEXT,
    "monthlyAmount" DECIMAL(10,2),
    "discountPercentage" DECIMAL(5,2),
    "paymentDay" INTEGER,
    "contractStartDate" TIMESTAMP(3),
    "contractDueDate" TIMESTAMP(3),
    "cameFromReferral" BOOLEAN,
    "referralPerson" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentFinancialProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentExternalAccount" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalUserId" TEXT,
    "connectionStatus" "StudentExternalConnectionStatus" NOT NULL DEFAULT 'pending',
    "lastSyncAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentExternalAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentExternalActivity" (
    "id" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalActivityId" TEXT NOT NULL,
    "activityType" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "distanceMeters" DECIMAL(12,2),
    "durationSeconds" INTEGER,
    "paceSecondsPerKm" DECIMAL(10,2),
    "averageHeartRate" INTEGER,
    "maxHeartRate" INTEGER,
    "calories" DECIMAL(10,2),
    "elevationGainMeters" DECIMAL(10,2),
    "rawPayload" JSONB,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentExternalActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentProfile_alunoId_key" ON "StudentProfile"("alunoId");
CREATE UNIQUE INDEX "StudentHealthIntake_alunoId_key" ON "StudentHealthIntake"("alunoId");
CREATE UNIQUE INDEX "StudentFinancialProfile_alunoId_key" ON "StudentFinancialProfile"("alunoId");
CREATE UNIQUE INDEX "StudentExternalAccount_alunoId_provider_key" ON "StudentExternalAccount"("alunoId", "provider");
CREATE UNIQUE INDEX "StudentExternalActivity_externalAccountId_externalActivityId_key" ON "StudentExternalActivity"("externalAccountId", "externalActivityId");

CREATE INDEX "StudentProfile_contractId_idx" ON "StudentProfile"("contractId");
CREATE INDEX "StudentProfile_sourceType_idx" ON "StudentProfile"("sourceType");
CREATE INDEX "StudentProfile_recordedByUserId_idx" ON "StudentProfile"("recordedByUserId");
CREATE INDEX "StudentHealthIntake_contractId_idx" ON "StudentHealthIntake"("contractId");
CREATE INDEX "StudentHealthIntake_assessmentDate_idx" ON "StudentHealthIntake"("assessmentDate");
CREATE INDEX "StudentHealthIntake_sourceType_idx" ON "StudentHealthIntake"("sourceType");
CREATE INDEX "StudentAssessmentRecord_contractId_performedAt_idx" ON "StudentAssessmentRecord"("contractId", "performedAt");
CREATE INDEX "StudentAssessmentRecord_alunoId_performedAt_idx" ON "StudentAssessmentRecord"("alunoId", "performedAt");
CREATE INDEX "StudentAssessmentRecord_status_idx" ON "StudentAssessmentRecord"("status");
CREATE INDEX "StudentAssessmentRecord_sourceType_idx" ON "StudentAssessmentRecord"("sourceType");
CREATE INDEX "StudentAssessmentMeasurement_assessmentRecordId_sortOrder_idx" ON "StudentAssessmentMeasurement"("assessmentRecordId", "sortOrder");
CREATE INDEX "StudentAssessmentMeasurement_assessmentRecordId_metricKey_idx" ON "StudentAssessmentMeasurement"("assessmentRecordId", "metricKey");
CREATE INDEX "StudentFinancialProfile_contractId_idx" ON "StudentFinancialProfile"("contractId");
CREATE INDEX "StudentFinancialProfile_sourceType_idx" ON "StudentFinancialProfile"("sourceType");
CREATE INDEX "StudentExternalAccount_contractId_provider_idx" ON "StudentExternalAccount"("contractId", "provider");
CREATE INDEX "StudentExternalAccount_connectionStatus_idx" ON "StudentExternalAccount"("connectionStatus");
CREATE INDEX "StudentExternalActivity_contractId_provider_startedAt_idx" ON "StudentExternalActivity"("contractId", "provider", "startedAt");
CREATE INDEX "StudentExternalActivity_alunoId_startedAt_idx" ON "StudentExternalActivity"("alunoId", "startedAt");
CREATE INDEX "StudentExternalActivity_provider_externalActivityId_idx" ON "StudentExternalActivity"("provider", "externalActivityId");

ALTER TABLE "StudentProfile"
ADD CONSTRAINT "StudentProfile_alunoId_fkey"
FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentProfile"
ADD CONSTRAINT "StudentProfile_contractId_fkey"
FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentHealthIntake"
ADD CONSTRAINT "StudentHealthIntake_alunoId_fkey"
FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentHealthIntake"
ADD CONSTRAINT "StudentHealthIntake_contractId_fkey"
FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentAssessmentRecord"
ADD CONSTRAINT "StudentAssessmentRecord_alunoId_fkey"
FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentAssessmentRecord"
ADD CONSTRAINT "StudentAssessmentRecord_contractId_fkey"
FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentAssessmentMeasurement"
ADD CONSTRAINT "StudentAssessmentMeasurement_assessmentRecordId_fkey"
FOREIGN KEY ("assessmentRecordId") REFERENCES "StudentAssessmentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentFinancialProfile"
ADD CONSTRAINT "StudentFinancialProfile_alunoId_fkey"
FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentFinancialProfile"
ADD CONSTRAINT "StudentFinancialProfile_contractId_fkey"
FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentExternalAccount"
ADD CONSTRAINT "StudentExternalAccount_alunoId_fkey"
FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentExternalAccount"
ADD CONSTRAINT "StudentExternalAccount_contractId_fkey"
FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentExternalActivity"
ADD CONSTRAINT "StudentExternalActivity_externalAccountId_fkey"
FOREIGN KEY ("externalAccountId") REFERENCES "StudentExternalAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentExternalActivity"
ADD CONSTRAINT "StudentExternalActivity_alunoId_fkey"
FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentExternalActivity"
ADD CONSTRAINT "StudentExternalActivity_contractId_fkey"
FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "CapacityPrescription" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "capacity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "currentVersion" INTEGER NOT NULL DEFAULT 0,
  "createdByProfessorId" TEXT NOT NULL,
  "updatedByProfessorId" TEXT NOT NULL,
  "publishesTodayWorkout" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CapacityPrescription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CapacityPrescription_capacity_check" CHECK ("capacity" IN ('resisted', 'flexibility', 'cyclic', 'balance')),
  CONSTRAINT "CapacityPrescription_status_check" CHECK ("status" IN ('planned', 'active', 'adjusting', 'suspended', 'finished')),
  CONSTRAINT "CapacityPrescription_currentVersion_check" CHECK ("currentVersion" >= 0),
  CONSTRAINT "CapacityPrescription_no_direct_workout_check" CHECK ("publishesTodayWorkout" = false)
);

CREATE TABLE "CapacityPrescriptionVersion" (
  "id" TEXT NOT NULL,
  "prescriptionId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "responsibleProfessorId" TEXT NOT NULL,
  "capacity" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "technicalJustification" TEXT NOT NULL,
  "professorSummary" TEXT NOT NULL,
  "studentMessage" TEXT,
  "methodologyVersion" TEXT,
  "parameterSetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "parameters" JSONB,
  "publishesTodayWorkout" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CapacityPrescriptionVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CapacityPrescriptionVersion_capacity_check" CHECK ("capacity" IN ('resisted', 'flexibility', 'cyclic', 'balance')),
  CONSTRAINT "CapacityPrescriptionVersion_status_check" CHECK ("status" IN ('planned', 'active', 'adjusting', 'suspended', 'finished')),
  CONSTRAINT "CapacityPrescriptionVersion_version_check" CHECK ("version" > 0),
  CONSTRAINT "CapacityPrescriptionVersion_no_direct_workout_check" CHECK ("publishesTodayWorkout" = false)
);

CREATE TABLE "CapacityPrescriptionSource" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "assessedAt" TIMESTAMP(3),
  "origin" TEXT,
  "sourceVersion" TEXT,
  "responsibleProfessorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CapacityPrescriptionSource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CapacityPrescriptionSource_type_check" CHECK ("sourceType" IN ('prontuario_goal', 'prontuario_alert', 'physical_assessment', 'anthropometry', 'adipometry', 'bioimpedance', 'ultrasound', 'ventilometry', 'flexibility_assessment', 'student_preference', 'professor_note'))
);

CREATE TABLE "CapacityPrescriptionAlertRecord" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "sourceRefId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CapacityPrescriptionAlertRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CapacityPrescriptionAlertRecord_severity_check" CHECK ("severity" IN ('info', 'warning', 'critical'))
);

CREATE TABLE "CapacityPrescriptionGoalLink" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "goalId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CapacityPrescriptionGoalLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CapacityPrescriptionParameterSet" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "capacity" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "methodologyVersion" TEXT NOT NULL,
  "parameters" JSONB NOT NULL,
  "isCurrent" BOOLEAN NOT NULL DEFAULT true,
  "createdByProfessorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CapacityPrescriptionParameterSet_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CapacityPrescriptionParameterSet_capacity_check" CHECK ("capacity" IN ('resisted', 'flexibility', 'cyclic', 'balance')),
  CONSTRAINT "CapacityPrescriptionParameterSet_version_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "CapacityPrescription_contractId_alunoId_capacity_key"
  ON "CapacityPrescription"("contractId", "alunoId", "capacity");
CREATE INDEX "CapacityPrescription_contractId_alunoId_status_idx"
  ON "CapacityPrescription"("contractId", "alunoId", "status");
CREATE INDEX "CapacityPrescription_createdByProfessorId_idx"
  ON "CapacityPrescription"("createdByProfessorId");
CREATE INDEX "CapacityPrescription_updatedByProfessorId_idx"
  ON "CapacityPrescription"("updatedByProfessorId");

CREATE UNIQUE INDEX "CapacityPrescriptionVersion_prescriptionId_version_key"
  ON "CapacityPrescriptionVersion"("prescriptionId", "version");
CREATE INDEX "CapacityPrescriptionVersion_contractId_alunoId_createdAt_idx"
  ON "CapacityPrescriptionVersion"("contractId", "alunoId", "createdAt");
CREATE INDEX "CapacityPrescriptionVersion_responsibleProfessorId_idx"
  ON "CapacityPrescriptionVersion"("responsibleProfessorId");

CREATE INDEX "CapacityPrescriptionSource_versionId_idx"
  ON "CapacityPrescriptionSource"("versionId");
CREATE INDEX "CapacityPrescriptionSource_sourceType_sourceId_idx"
  ON "CapacityPrescriptionSource"("sourceType", "sourceId");
CREATE INDEX "CapacityPrescriptionAlertRecord_versionId_idx"
  ON "CapacityPrescriptionAlertRecord"("versionId");
CREATE UNIQUE INDEX "CapacityPrescriptionGoalLink_versionId_goalId_key"
  ON "CapacityPrescriptionGoalLink"("versionId", "goalId");
CREATE INDEX "CapacityPrescriptionGoalLink_goalId_idx"
  ON "CapacityPrescriptionGoalLink"("goalId");

CREATE UNIQUE INDEX "CapacityPrescriptionParameterSet_contract_capacity_code_version_key"
  ON "CapacityPrescriptionParameterSet"("contractId", "capacity", "code", "version");
CREATE UNIQUE INDEX "CapacityPrescriptionParameterSet_current_key"
  ON "CapacityPrescriptionParameterSet"("contractId", "capacity", "code")
  WHERE "isCurrent" = true;
CREATE INDEX "CapacityPrescriptionParameterSet_contract_capacity_current_idx"
  ON "CapacityPrescriptionParameterSet"("contractId", "capacity", "isCurrent");
CREATE INDEX "CapacityPrescriptionParameterSet_createdByProfessorId_idx"
  ON "CapacityPrescriptionParameterSet"("createdByProfessorId");

ALTER TABLE "CapacityPrescription"
  ADD CONSTRAINT "CapacityPrescription_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapacityPrescription"
  ADD CONSTRAINT "CapacityPrescription_alunoId_fkey"
  FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapacityPrescription"
  ADD CONSTRAINT "CapacityPrescription_createdByProfessorId_fkey"
  FOREIGN KEY ("createdByProfessorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CapacityPrescription"
  ADD CONSTRAINT "CapacityPrescription_updatedByProfessorId_fkey"
  FOREIGN KEY ("updatedByProfessorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CapacityPrescriptionVersion"
  ADD CONSTRAINT "CapacityPrescriptionVersion_prescriptionId_fkey"
  FOREIGN KEY ("prescriptionId") REFERENCES "CapacityPrescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapacityPrescriptionVersion"
  ADD CONSTRAINT "CapacityPrescriptionVersion_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapacityPrescriptionVersion"
  ADD CONSTRAINT "CapacityPrescriptionVersion_alunoId_fkey"
  FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapacityPrescriptionVersion"
  ADD CONSTRAINT "CapacityPrescriptionVersion_responsibleProfessorId_fkey"
  FOREIGN KEY ("responsibleProfessorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CapacityPrescriptionSource"
  ADD CONSTRAINT "CapacityPrescriptionSource_versionId_fkey"
  FOREIGN KEY ("versionId") REFERENCES "CapacityPrescriptionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapacityPrescriptionAlertRecord"
  ADD CONSTRAINT "CapacityPrescriptionAlertRecord_versionId_fkey"
  FOREIGN KEY ("versionId") REFERENCES "CapacityPrescriptionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapacityPrescriptionGoalLink"
  ADD CONSTRAINT "CapacityPrescriptionGoalLink_versionId_fkey"
  FOREIGN KEY ("versionId") REFERENCES "CapacityPrescriptionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapacityPrescriptionGoalLink"
  ADD CONSTRAINT "CapacityPrescriptionGoalLink_goalId_fkey"
  FOREIGN KEY ("goalId") REFERENCES "ProntuarioGoal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CapacityPrescriptionParameterSet"
  ADD CONSTRAINT "CapacityPrescriptionParameterSet_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapacityPrescriptionParameterSet"
  ADD CONSTRAINT "CapacityPrescriptionParameterSet_createdByProfessorId_fkey"
  FOREIGN KEY ("createdByProfessorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

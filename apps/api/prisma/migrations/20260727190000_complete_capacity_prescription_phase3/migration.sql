CREATE TABLE "CapacityPlanningCycle" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "responsibleProfessorId" TEXT NOT NULL,
  "parentId" TEXT,
  "level" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "objective" TEXT,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "loadCode" TEXT,
  "volume" TEXT,
  "frequency" TEXT,
  "capacityParameters" JSONB NOT NULL DEFAULT '{}'::JSONB,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CapacityPlanningCycle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CapacityPlanningCycle_level_check" CHECK ("level" IN ('macro', 'meso', 'micro')),
  CONSTRAINT "CapacityPlanningCycle_status_check" CHECK ("status" IN ('planned', 'active', 'adjusting', 'suspended', 'finished')),
  CONSTRAINT "CapacityPlanningCycle_version_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "CapacityPlanningCycle_contract_aluno_level_code_version_key"
  ON "CapacityPlanningCycle"("contractId", "alunoId", "level", "code", "version");
CREATE INDEX "CapacityPlanningCycle_contract_aluno_level_status_idx"
  ON "CapacityPlanningCycle"("contractId", "alunoId", "level", "status");
CREATE INDEX "CapacityPlanningCycle_parentId_idx"
  ON "CapacityPlanningCycle"("parentId");

CREATE TABLE "CapacityTechnicalCatalogItem" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isCurrent" BOOLEAN NOT NULL DEFAULT true,
  "createdByProfessorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CapacityTechnicalCatalogItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CapacityTechnicalCatalogItem_category_check" CHECK ("category" IN (
    'environment', 'muscle_group', 'acronym', 'cyclic_stimulus', 'method',
    'exercise', 'microcycle_load', 'articulation', 'training_split', 'repetition_zone'
  )),
  CONSTRAINT "CapacityTechnicalCatalogItem_version_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "CapacityTechnicalCatalogItem_contract_category_code_version_key"
  ON "CapacityTechnicalCatalogItem"("contractId", "category", "code", "version");
CREATE UNIQUE INDEX "CapacityTechnicalCatalogItem_current_key"
  ON "CapacityTechnicalCatalogItem"("contractId", "category", "code")
  WHERE "isCurrent" = true;
CREATE INDEX "CapacityTechnicalCatalogItem_contract_category_current_idx"
  ON "CapacityTechnicalCatalogItem"("contractId", "category", "isCurrent");

CREATE TABLE "ProntuarioGoalCapacityClassification" (
  "goalId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "capacities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "relatesToAssessment" BOOLEAN NOT NULL DEFAULT false,
  "relatesToActionPlan" BOOLEAN NOT NULL DEFAULT false,
  "updatedByProfessorId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProntuarioGoalCapacityClassification_pkey" PRIMARY KEY ("goalId"),
  CONSTRAINT "ProntuarioGoalCapacityClassification_capacities_check" CHECK (
    "capacities" <@ ARRAY['resisted', 'flexibility', 'cyclic', 'balance']::TEXT[]
  )
);

CREATE INDEX "ProntuarioGoalCapacityClassification_contract_aluno_idx"
  ON "ProntuarioGoalCapacityClassification"("contractId", "alunoId");

ALTER TABLE "CapacityPlanningCycle"
  ADD CONSTRAINT "CapacityPlanningCycle_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapacityPlanningCycle"
  ADD CONSTRAINT "CapacityPlanningCycle_alunoId_fkey"
  FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapacityPlanningCycle"
  ADD CONSTRAINT "CapacityPlanningCycle_responsibleProfessorId_fkey"
  FOREIGN KEY ("responsibleProfessorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CapacityPlanningCycle"
  ADD CONSTRAINT "CapacityPlanningCycle_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "CapacityPlanningCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CapacityTechnicalCatalogItem"
  ADD CONSTRAINT "CapacityTechnicalCatalogItem_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapacityTechnicalCatalogItem"
  ADD CONSTRAINT "CapacityTechnicalCatalogItem_createdByProfessorId_fkey"
  FOREIGN KEY ("createdByProfessorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProntuarioGoalCapacityClassification"
  ADD CONSTRAINT "ProntuarioGoalCapacityClassification_goalId_fkey"
  FOREIGN KEY ("goalId") REFERENCES "ProntuarioGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProntuarioGoalCapacityClassification"
  ADD CONSTRAINT "ProntuarioGoalCapacityClassification_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProntuarioGoalCapacityClassification"
  ADD CONSTRAINT "ProntuarioGoalCapacityClassification_alunoId_fkey"
  FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProntuarioGoalCapacityClassification"
  ADD CONSTRAINT "ProntuarioGoalCapacityClassification_updatedByProfessorId_fkey"
  FOREIGN KEY ("updatedByProfessorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

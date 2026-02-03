-- CreateTable
CREATE TABLE "TrainingParameter" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodizationMatrix" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "totalMesocycles" INTEGER NOT NULL,
    "weeksPerMesocycle" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodizationMatrix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResistedStimulus" (
    "id" TEXT NOT NULL,
    "matrixId" TEXT NOT NULL,
    "mesocycleNumber" INTEGER NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "loadCycle" TEXT,
    "repZone" INTEGER,
    "loadPercentage" DOUBLE PRECISION,
    "seriesReference" INTEGER,
    "seriesLowerBody" INTEGER,
    "seriesUpperBody" INTEGER,
    "seriesCore" INTEGER,
    "repReserve" INTEGER,
    "assembly" TEXT,
    "method" TEXT,
    "trainingDivision" TEXT,
    "weeklyFrequency" INTEGER,
    "observations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResistedStimulus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CyclicStimulus" (
    "id" TEXT NOT NULL,
    "matrixId" TEXT NOT NULL,
    "mesocycleNumber" INTEGER NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "totalVolumeMinutes" DOUBLE PRECISION,
    "totalVolumeKm" DOUBLE PRECISION,
    "runningVolumeKm" DOUBLE PRECISION,
    "countZ1" INTEGER,
    "countZ2" INTEGER,
    "countZ3" INTEGER,
    "countZ4" INTEGER,
    "countZ5" INTEGER,
    "minutesZ1" DOUBLE PRECISION,
    "minutesZ2" DOUBLE PRECISION,
    "minutesZ3" DOUBLE PRECISION,
    "minutesZ4" DOUBLE PRECISION,
    "minutesZ5" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CyclicStimulus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionWeekly" (
    "id" TEXT NOT NULL,
    "matrixId" TEXT NOT NULL,
    "mesocycleNumber" INTEGER NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "dailyCalories" DOUBLE PRECISION,
    "carbohydratesG" DOUBLE PRECISION,
    "proteinsG" DOUBLE PRECISION,
    "lipidsG" DOUBLE PRECISION,
    "hydrationLiters" DOUBLE PRECISION,
    "supplements" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionWeekly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodizationTemplate" (
    "id" TEXT NOT NULL,
    "educatorId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "totalMesocycles" INTEGER NOT NULL,
    "weeksPerMesocycle" INTEGER NOT NULL,
    "templateData" JSONB NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodizationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingParameter_category_idx" ON "TrainingParameter"("category");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingParameter_category_code_key" ON "TrainingParameter"("category", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodizationMatrix_planId_key" ON "PeriodizationMatrix"("planId");

-- CreateIndex
CREATE INDEX "ResistedStimulus_matrixId_idx" ON "ResistedStimulus"("matrixId");

-- CreateIndex
CREATE UNIQUE INDEX "ResistedStimulus_matrixId_mesocycleNumber_weekNumber_key" ON "ResistedStimulus"("matrixId", "mesocycleNumber", "weekNumber");

-- CreateIndex
CREATE INDEX "CyclicStimulus_matrixId_idx" ON "CyclicStimulus"("matrixId");

-- CreateIndex
CREATE UNIQUE INDEX "CyclicStimulus_matrixId_mesocycleNumber_weekNumber_key" ON "CyclicStimulus"("matrixId", "mesocycleNumber", "weekNumber");

-- CreateIndex
CREATE INDEX "NutritionWeekly_matrixId_idx" ON "NutritionWeekly"("matrixId");

-- CreateIndex
CREATE UNIQUE INDEX "NutritionWeekly_matrixId_mesocycleNumber_weekNumber_key" ON "NutritionWeekly"("matrixId", "mesocycleNumber", "weekNumber");

-- CreateIndex
CREATE INDEX "PeriodizationTemplate_educatorId_idx" ON "PeriodizationTemplate"("educatorId");

-- CreateIndex
CREATE INDEX "PeriodizationTemplate_category_idx" ON "PeriodizationTemplate"("category");

-- AddForeignKey
ALTER TABLE "PeriodizationMatrix" ADD CONSTRAINT "PeriodizationMatrix_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TrainingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResistedStimulus" ADD CONSTRAINT "ResistedStimulus_matrixId_fkey" FOREIGN KEY ("matrixId") REFERENCES "PeriodizationMatrix"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CyclicStimulus" ADD CONSTRAINT "CyclicStimulus_matrixId_fkey" FOREIGN KEY ("matrixId") REFERENCES "PeriodizationMatrix"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionWeekly" ADD CONSTRAINT "NutritionWeekly_matrixId_fkey" FOREIGN KEY ("matrixId") REFERENCES "PeriodizationMatrix"("id") ON DELETE CASCADE ON UPDATE CASCADE;

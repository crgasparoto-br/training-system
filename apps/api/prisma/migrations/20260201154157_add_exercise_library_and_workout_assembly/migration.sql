-- CreateEnum
CREATE TYPE "LoadType" AS ENUM ('H', 'C', 'E', 'A', 'P', 'O');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('U', 'I', 'O');

-- CreateEnum
CREATE TYPE "CountingType" AS ENUM ('I', 'T', 'R');

-- CreateTable
CREATE TABLE "ExerciseLibrary" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "videoUrl" TEXT,
    "loadType" "LoadType",
    "movementType" "MovementType",
    "countingType" "CountingType",
    "category" TEXT,
    "muscleGroup" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentExerciseProgress" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "lastLoad" DOUBLE PRECISION,
    "maxLoad" DOUBLE PRECISION,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentExerciseProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutTemplate" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "mesocycleNumber" INTEGER NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "cyclicFrequency" INTEGER,
    "totalVolumeMin" INTEGER,
    "totalVolumeKm" DOUBLE PRECISION,
    "resistanceFrequency" INTEGER,
    "loadPercentage" DOUBLE PRECISION,
    "repZone" INTEGER,
    "repReserve" INTEGER,
    "trainingMethod" TEXT,
    "trainingDivision" TEXT,
    "studentGoal" TEXT,
    "coachGoal" TEXT,
    "observation1" TEXT,
    "observation2" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutDay" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "workoutDate" TIMESTAMP(3) NOT NULL,
    "sessionDurationMin" INTEGER,
    "stimulusDurationMin" INTEGER,
    "location" TEXT,
    "method" TEXT,
    "intensity1" TEXT,
    "intensity2" TEXT,
    "numSessions" INTEGER,
    "numSets" INTEGER,
    "sessionTime" INTEGER,
    "restTime" INTEGER,
    "vo2maxIntervalPct" DOUBLE PRECISION,
    "iextIintTime" DOUBLE PRECISION,
    "vo2maxPct" DOUBLE PRECISION,
    "targetHrMin" DOUBLE PRECISION,
    "targetHrMax" DOUBLE PRECISION,
    "targetSpeedMin" DOUBLE PRECISION,
    "targetSpeedMax" DOUBLE PRECISION,
    "detailNotes" TEXT,
    "complementNotes" TEXT,
    "generalGuidelines" TEXT,
    "psrQuestion" TEXT DEFAULT 'Hoje recuperado você está se sentindo (PSR)?',
    "psrResponse" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutExercise" (
    "id" TEXT NOT NULL,
    "workoutDayId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "exerciseOrder" INTEGER NOT NULL,
    "system" TEXT,
    "sets" INTEGER,
    "reps" INTEGER,
    "intervalSec" INTEGER,
    "cParam" INTEGER,
    "eParam" INTEGER,
    "load" DOUBLE PRECISION,
    "exerciseNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutExecution" (
    "id" TEXT NOT NULL,
    "workoutExerciseId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "executionDate" TIMESTAMP(3) NOT NULL,
    "setsCompleted" INTEGER,
    "repsCompleted" INTEGER,
    "loadUsed" DOUBLE PRECISION,
    "difficultyRating" INTEGER,
    "repsInReserve" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExerciseLibrary_name_idx" ON "ExerciseLibrary"("name");

-- CreateIndex
CREATE INDEX "ExerciseLibrary_category_idx" ON "ExerciseLibrary"("category");

-- CreateIndex
CREATE INDEX "StudentExerciseProgress_athleteId_idx" ON "StudentExerciseProgress"("athleteId");

-- CreateIndex
CREATE INDEX "StudentExerciseProgress_exerciseId_idx" ON "StudentExerciseProgress"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentExerciseProgress_athleteId_exerciseId_key" ON "StudentExerciseProgress"("athleteId", "exerciseId");

-- CreateIndex
CREATE INDEX "WorkoutTemplate_planId_idx" ON "WorkoutTemplate"("planId");

-- CreateIndex
CREATE INDEX "WorkoutTemplate_planId_mesocycleNumber_weekNumber_idx" ON "WorkoutTemplate"("planId", "mesocycleNumber", "weekNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutTemplate_planId_mesocycleNumber_weekNumber_key" ON "WorkoutTemplate"("planId", "mesocycleNumber", "weekNumber");

-- CreateIndex
CREATE INDEX "WorkoutDay_templateId_idx" ON "WorkoutDay"("templateId");

-- CreateIndex
CREATE INDEX "WorkoutDay_workoutDate_idx" ON "WorkoutDay"("workoutDate");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutDay_templateId_dayOfWeek_key" ON "WorkoutDay"("templateId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "WorkoutExercise_workoutDayId_idx" ON "WorkoutExercise"("workoutDayId");

-- CreateIndex
CREATE INDEX "WorkoutExercise_workoutDayId_section_exerciseOrder_idx" ON "WorkoutExercise"("workoutDayId", "section", "exerciseOrder");

-- CreateIndex
CREATE INDEX "WorkoutExecution_workoutExerciseId_idx" ON "WorkoutExecution"("workoutExerciseId");

-- CreateIndex
CREATE INDEX "WorkoutExecution_athleteId_idx" ON "WorkoutExecution"("athleteId");

-- CreateIndex
CREATE INDEX "WorkoutExecution_executionDate_idx" ON "WorkoutExecution"("executionDate");

-- AddForeignKey
ALTER TABLE "StudentExerciseProgress" ADD CONSTRAINT "StudentExerciseProgress_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentExerciseProgress" ADD CONSTRAINT "StudentExerciseProgress_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "ExerciseLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutTemplate" ADD CONSTRAINT "WorkoutTemplate_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TrainingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutDay" ADD CONSTRAINT "WorkoutDay_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExercise" ADD CONSTRAINT "WorkoutExercise_workoutDayId_fkey" FOREIGN KEY ("workoutDayId") REFERENCES "WorkoutDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExercise" ADD CONSTRAINT "WorkoutExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "ExerciseLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExecution" ADD CONSTRAINT "WorkoutExecution_workoutExerciseId_fkey" FOREIGN KEY ("workoutExerciseId") REFERENCES "WorkoutExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExecution" ADD CONSTRAINT "WorkoutExecution_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

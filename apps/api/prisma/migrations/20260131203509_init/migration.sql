-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('educator', 'student');

-- CreateEnum
CREATE TYPE "TrainingPhase" AS ENUM ('base', 'build', 'peak', 'recovery', 'taper');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('easy', 'moderate', 'threshold', 'vo2max', 'anaerobic', 'recovery', 'long_run', 'strength', 'cross_training');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('garmin', 'strava', 'apple_health', 'dieta_ia');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('free', 'pro', 'enterprise');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('new_athlete', 'training_completed', 'training_missed', 'payment_received', 'plan_expiring', 'new_training', 'training_reminder', 'educator_feedback', 'progress_achieved');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "type" "UserType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Educator" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Educator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Athlete" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "educatorId" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "bodyFatPercentage" DOUBLE PRECISION,
    "vo2Max" DOUBLE PRECISION NOT NULL,
    "anaerobicThreshold" DOUBLE PRECISION NOT NULL,
    "maxHeartRate" INTEGER NOT NULL,
    "restingHeartRate" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Athlete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingPlan" (
    "id" TEXT NOT NULL,
    "educatorId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Macrocycle" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phase" "TrainingPhase" NOT NULL,
    "weekStart" INTEGER NOT NULL,
    "weekEnd" INTEGER NOT NULL,
    "focusAreas" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Macrocycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mesocycle" (
    "id" TEXT NOT NULL,
    "macrocycleId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "focus" TEXT,
    "volumeTarget" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mesocycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Microcycle" (
    "id" TEXT NOT NULL,
    "mesocycleId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "sessionType" "SessionType" NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "distanceKm" DOUBLE PRECISION,
    "intensityPercentage" DOUBLE PRECISION NOT NULL,
    "paceMinPerKm" DOUBLE PRECISION,
    "heartRateZone" INTEGER,
    "instructions" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Microcycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingExecution" (
    "id" TEXT NOT NULL,
    "microcycleId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "plannedDate" TIMESTAMP(3) NOT NULL,
    "executedDate" TIMESTAMP(3),
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "durationActual" INTEGER,
    "distanceActual" DOUBLE PRECISION,
    "heartRateAvg" INTEGER,
    "heartRateMax" INTEGER,
    "pace" DOUBLE PRECISION,
    "pse" INTEGER,
    "psr" INTEGER,
    "notes" TEXT,
    "garminActivityId" TEXT,
    "stravaActivityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Macronutrients" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "carbohydratesPercentage" DOUBLE PRECISION NOT NULL,
    "proteinsPercentage" DOUBLE PRECISION NOT NULL,
    "lipidsPercentage" DOUBLE PRECISION NOT NULL,
    "dailyCalories" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Macronutrients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionPlan" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "rawResponse" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressMetric" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "weight" DOUBLE PRECISION,
    "bodyFatPercentage" DOUBLE PRECISION,
    "vo2MaxEstimated" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingLibrary" (
    "id" TEXT NOT NULL,
    "educatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sessionType" "SessionType" NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "intensityPercentage" DOUBLE PRECISION NOT NULL,
    "instructions" TEXT,
    "isTemplate" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "lastSync" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "educatorId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL,
    "status" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubId" TEXT,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "educatorId" TEXT NOT NULL,
    "stripeId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "smsSent" BOOLEAN NOT NULL DEFAULT false,
    "whatsappSent" BOOLEAN NOT NULL DEFAULT false,
    "emailError" TEXT,
    "smsError" TEXT,
    "whatsappError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailFrequency" TEXT NOT NULL,
    "smsFrequency" TEXT NOT NULL,
    "whatsappFrequency" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Educator_userId_key" ON "Educator"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Athlete_userId_key" ON "Athlete"("userId");

-- CreateIndex
CREATE INDEX "Athlete_educatorId_idx" ON "Athlete"("educatorId");

-- CreateIndex
CREATE INDEX "TrainingPlan_educatorId_idx" ON "TrainingPlan"("educatorId");

-- CreateIndex
CREATE INDEX "TrainingPlan_athleteId_idx" ON "TrainingPlan"("athleteId");

-- CreateIndex
CREATE INDEX "Macrocycle_planId_idx" ON "Macrocycle"("planId");

-- CreateIndex
CREATE INDEX "Mesocycle_macrocycleId_idx" ON "Mesocycle"("macrocycleId");

-- CreateIndex
CREATE INDEX "Microcycle_mesocycleId_idx" ON "Microcycle"("mesocycleId");

-- CreateIndex
CREATE INDEX "TrainingExecution_microcycleId_idx" ON "TrainingExecution"("microcycleId");

-- CreateIndex
CREATE INDEX "TrainingExecution_athleteId_idx" ON "TrainingExecution"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "Macronutrients_athleteId_key" ON "Macronutrients"("athleteId");

-- CreateIndex
CREATE INDEX "NutritionPlan_athleteId_idx" ON "NutritionPlan"("athleteId");

-- CreateIndex
CREATE INDEX "ProgressMetric_athleteId_idx" ON "ProgressMetric"("athleteId");

-- CreateIndex
CREATE INDEX "TrainingLibrary_educatorId_idx" ON "TrainingLibrary"("educatorId");

-- CreateIndex
CREATE INDEX "Integration_athleteId_idx" ON "Integration"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_athleteId_type_key" ON "Integration"("athleteId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_educatorId_key" ON "Subscription"("educatorId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubId_key" ON "Subscription"("stripeSubId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeId_key" ON "Payment"("stripeId");

-- CreateIndex
CREATE INDEX "Payment_educatorId_idx" ON "Payment"("educatorId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreferences_userId_key" ON "NotificationPreferences"("userId");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Educator" ADD CONSTRAINT "Educator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "Educator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPlan" ADD CONSTRAINT "TrainingPlan_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "Educator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPlan" ADD CONSTRAINT "TrainingPlan_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Macrocycle" ADD CONSTRAINT "Macrocycle_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TrainingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mesocycle" ADD CONSTRAINT "Mesocycle_macrocycleId_fkey" FOREIGN KEY ("macrocycleId") REFERENCES "Macrocycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Microcycle" ADD CONSTRAINT "Microcycle_mesocycleId_fkey" FOREIGN KEY ("mesocycleId") REFERENCES "Mesocycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingExecution" ADD CONSTRAINT "TrainingExecution_microcycleId_fkey" FOREIGN KEY ("microcycleId") REFERENCES "Microcycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingExecution" ADD CONSTRAINT "TrainingExecution_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Macronutrients" ADD CONSTRAINT "Macronutrients_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPlan" ADD CONSTRAINT "NutritionPlan_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressMetric" ADD CONSTRAINT "ProgressMetric_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingLibrary" ADD CONSTRAINT "TrainingLibrary_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "Educator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "Educator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreferences" ADD CONSTRAINT "NotificationPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

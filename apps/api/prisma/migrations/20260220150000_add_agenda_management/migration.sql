-- CreateEnum
CREATE TYPE "AthleteSchedulePlan" AS ENUM ('free', 'fixed');

-- CreateEnum
CREATE TYPE "AgendaBookingType" AS ENUM ('free', 'fixed_makeup');

-- CreateEnum
CREATE TYPE "AgendaBookingStatus" AS ENUM ('scheduled', 'completed', 'canceled', 'no_show');

-- AlterTable
ALTER TABLE "Athlete" ADD COLUMN "schedulePlan" "AthleteSchedulePlan" NOT NULL DEFAULT 'free';

-- CreateTable
CREATE TABLE "TrainingSpace" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EducatorAvailability" (
    "id" TEXT NOT NULL,
    "educatorId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EducatorAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedScheduleSlot" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "educatorId" TEXT NOT NULL,
    "spaceId" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedScheduleSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaBooking" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "educatorId" TEXT NOT NULL,
    "spaceId" TEXT,
    "fixedSlotId" TEXT,
    "bookingType" "AgendaBookingType" NOT NULL,
    "status" "AgendaBookingStatus" NOT NULL DEFAULT 'scheduled',
    "bookingDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "notes" TEXT,
    "canceledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingSpace_contractId_name_key" ON "TrainingSpace"("contractId", "name");

-- CreateIndex
CREATE INDEX "TrainingSpace_contractId_idx" ON "TrainingSpace"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "EducatorAvailability_educatorId_dayOfWeek_startTime_endTime_key" ON "EducatorAvailability"("educatorId", "dayOfWeek", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "EducatorAvailability_educatorId_dayOfWeek_idx" ON "EducatorAvailability"("educatorId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "FixedScheduleSlot_athleteId_isActive_idx" ON "FixedScheduleSlot"("athleteId", "isActive");

-- CreateIndex
CREATE INDEX "FixedScheduleSlot_educatorId_dayOfWeek_isActive_idx" ON "FixedScheduleSlot"("educatorId", "dayOfWeek", "isActive");

-- CreateIndex
CREATE INDEX "FixedScheduleSlot_spaceId_dayOfWeek_isActive_idx" ON "FixedScheduleSlot"("spaceId", "dayOfWeek", "isActive");

-- CreateIndex
CREATE INDEX "AgendaBooking_contractId_bookingDate_idx" ON "AgendaBooking"("contractId", "bookingDate");

-- CreateIndex
CREATE INDEX "AgendaBooking_athleteId_bookingDate_idx" ON "AgendaBooking"("athleteId", "bookingDate");

-- CreateIndex
CREATE INDEX "AgendaBooking_educatorId_bookingDate_idx" ON "AgendaBooking"("educatorId", "bookingDate");

-- CreateIndex
CREATE INDEX "AgendaBooking_spaceId_bookingDate_idx" ON "AgendaBooking"("spaceId", "bookingDate");

-- CreateIndex
CREATE INDEX "AgendaBooking_fixedSlotId_idx" ON "AgendaBooking"("fixedSlotId");

-- AddForeignKey
ALTER TABLE "TrainingSpace" ADD CONSTRAINT "TrainingSpace_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EducatorAvailability" ADD CONSTRAINT "EducatorAvailability_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "Educator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedScheduleSlot" ADD CONSTRAINT "FixedScheduleSlot_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedScheduleSlot" ADD CONSTRAINT "FixedScheduleSlot_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "Educator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedScheduleSlot" ADD CONSTRAINT "FixedScheduleSlot_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "TrainingSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaBooking" ADD CONSTRAINT "AgendaBooking_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaBooking" ADD CONSTRAINT "AgendaBooking_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaBooking" ADD CONSTRAINT "AgendaBooking_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "Educator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaBooking" ADD CONSTRAINT "AgendaBooking_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "TrainingSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaBooking" ADD CONSTRAINT "AgendaBooking_fixedSlotId_fkey" FOREIGN KEY ("fixedSlotId") REFERENCES "FixedScheduleSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;


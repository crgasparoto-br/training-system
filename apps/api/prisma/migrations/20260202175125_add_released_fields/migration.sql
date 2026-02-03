-- AlterTable
ALTER TABLE "WorkoutTemplate" ADD COLUMN     "released" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "releasedAt" TIMESTAMP(3);

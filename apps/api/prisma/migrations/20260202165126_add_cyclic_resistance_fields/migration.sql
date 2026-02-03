/*
  Warnings:

  - The `intensity1` column on the `WorkoutDay` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `intensity2` column on the `WorkoutDay` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "WorkoutDay" ADD COLUMN     "cyclicTimeMin" INTEGER,
ADD COLUMN     "paceMax" DOUBLE PRECISION,
ADD COLUMN     "paceMin" DOUBLE PRECISION,
ADD COLUMN     "resistanceTimeMin" INTEGER,
DROP COLUMN "intensity1",
ADD COLUMN     "intensity1" DOUBLE PRECISION,
DROP COLUMN "intensity2",
ADD COLUMN     "intensity2" DOUBLE PRECISION;

-- CreateEnum
CREATE TYPE "WorkoutDayStatus" AS ENUM ('planned', 'in_progress', 'completed');

-- AlterTable
ALTER TABLE "WorkoutDay" ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "pseResponse" INTEGER,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "status" "WorkoutDayStatus" NOT NULL DEFAULT 'planned';

-- AlterTable
ALTER TABLE "WorkoutExecution" ADD COLUMN     "setNumber" INTEGER;

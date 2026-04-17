BEGIN;

ALTER TYPE "UserType" RENAME VALUE 'educator' TO 'professor';
ALTER TYPE "UserType" RENAME VALUE 'student' TO 'aluno';

ALTER TYPE "EducatorRole" RENAME TO "ProfessorRole";
ALTER TYPE "ProfessorRole" RENAME VALUE 'educator' TO 'professor';

ALTER TYPE "AthleteSchedulePlan" RENAME TO "AlunoSchedulePlan";

ALTER TABLE "Educator" RENAME TO "Professor";
ALTER TABLE "Athlete" RENAME TO "Aluno";
ALTER TABLE "EducatorAvailability" RENAME TO "ProfessorAvailability";
ALTER TABLE "StudentExerciseProgress" RENAME TO "AlunoExerciseProgress";

ALTER TABLE "ContractDataCloneLog" RENAME COLUMN "educatorId" TO "professorId";
ALTER TABLE "Aluno" RENAME COLUMN "educatorId" TO "professorId";
ALTER TABLE "ProfessorAvailability" RENAME COLUMN "educatorId" TO "professorId";
ALTER TABLE "FixedScheduleSlot" RENAME COLUMN "athleteId" TO "alunoId";
ALTER TABLE "FixedScheduleSlot" RENAME COLUMN "educatorId" TO "professorId";
ALTER TABLE "AgendaBooking" RENAME COLUMN "athleteId" TO "alunoId";
ALTER TABLE "AgendaBooking" RENAME COLUMN "educatorId" TO "professorId";
ALTER TABLE "Assessment" RENAME COLUMN "athleteId" TO "alunoId";
ALTER TABLE "AssessmentAuditLog" RENAME COLUMN "educatorId" TO "professorId";
ALTER TABLE "TrainingPlan" RENAME COLUMN "educatorId" TO "professorId";
ALTER TABLE "TrainingPlan" RENAME COLUMN "athleteId" TO "alunoId";
ALTER TABLE "TrainingExecution" RENAME COLUMN "athleteId" TO "alunoId";
ALTER TABLE "Macronutrients" RENAME COLUMN "athleteId" TO "alunoId";
ALTER TABLE "NutritionPlan" RENAME COLUMN "athleteId" TO "alunoId";
ALTER TABLE "ProgressMetric" RENAME COLUMN "athleteId" TO "alunoId";
ALTER TABLE "TrainingLibrary" RENAME COLUMN "educatorId" TO "professorId";
ALTER TABLE "Integration" RENAME COLUMN "athleteId" TO "alunoId";
ALTER TABLE "Subscription" RENAME COLUMN "educatorId" TO "professorId";
ALTER TABLE "Payment" RENAME COLUMN "educatorId" TO "professorId";
ALTER TABLE "PeriodizationTemplate" RENAME COLUMN "educatorId" TO "professorId";
ALTER TABLE "AlunoExerciseProgress" RENAME COLUMN "athleteId" TO "alunoId";
ALTER TABLE "WorkoutExecution" RENAME COLUMN "athleteId" TO "alunoId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'WorkoutTemplate'
      AND column_name = 'athleteGoal'
  ) THEN
    ALTER TABLE "WorkoutTemplate" RENAME COLUMN "athleteGoal" TO "alunoGoal";
  END IF;
END $$;

COMMIT;

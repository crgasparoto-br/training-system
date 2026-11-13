-- Issue #404. Somente trilha de substituicao: nunca altera objetos liberados.
CREATE TYPE "WorkoutSubstitutionKind" AS ENUM ('exercise', 'session');
CREATE TYPE "WorkoutSubstitutionContext" AS ENUM ('planning', 'review', 'execution');
CREATE TYPE "WorkoutSubstitutionStatus" AS ENUM ('approved', 'pending_review', 'rejected');

CREATE TABLE "WorkoutSubstitution" (
  "id" TEXT NOT NULL,
  "workoutDayId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "originReleaseId" TEXT NOT NULL,
  "kind" "WorkoutSubstitutionKind" NOT NULL,
  "context" "WorkoutSubstitutionContext" NOT NULL,
  "status" "WorkoutSubstitutionStatus" NOT NULL,
  "originalUnitId" TEXT NOT NULL,
  "replacementUnitId" TEXT NOT NULL,
  "originalVersion" TEXT NOT NULL,
  "replacementVersion" TEXT NOT NULL,
  "originalSnapshot" JSONB NOT NULL,
  "replacementSnapshot" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkoutSubstitution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkoutSubstitution_reason_required" CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "WorkoutSubstitution_distinct_units" CHECK ("originalUnitId" <> "replacementUnitId"),
  CONSTRAINT "WorkoutSubstitution_actor_required" CHECK (length(btrim("actorUserId")) > 0),
  CONSTRAINT "WorkoutSubstitution_review_coherent" CHECK (
    ("status" = 'pending_review' AND "reviewedByUserId" IS NULL AND "reviewedAt" IS NULL)
    OR
    ("status" IN ('approved', 'rejected') AND "reviewedByUserId" IS NOT NULL AND "reviewedAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "WorkoutSubstitution_day_operation_key"
  ON "WorkoutSubstitution"("workoutDayId", "operationKey");
CREATE INDEX "WorkoutSubstitution_contract_aluno_day_created_idx"
  ON "WorkoutSubstitution"("contractId", "alunoId", "workoutDayId", "createdAt");
CREATE INDEX "WorkoutSubstitution_day_kind_origin_status_idx"
  ON "WorkoutSubstitution"("workoutDayId", "kind", "originalUnitId", "status");

ALTER TABLE "WorkoutSubstitution"
  ADD CONSTRAINT "WorkoutSubstitution_workoutDayId_fkey"
  FOREIGN KEY ("workoutDayId") REFERENCES "WorkoutDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkoutSubstitution"
  ADD CONSTRAINT "WorkoutSubstitution_alunoId_fkey"
  FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkoutSubstitution"
  ADD CONSTRAINT "WorkoutSubstitution_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Historico nao pode ser reescrito depois da revisao; somente a decisao pendente.
CREATE OR REPLACE FUNCTION guard_workout_substitution_history()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'WorkoutSubstitution is append only' USING ERRCODE = '23514';
  END IF;
  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."workoutDayId" IS DISTINCT FROM NEW."workoutDayId"
    OR OLD."alunoId" IS DISTINCT FROM NEW."alunoId"
    OR OLD."contractId" IS DISTINCT FROM NEW."contractId"
    OR OLD."originReleaseId" IS DISTINCT FROM NEW."originReleaseId"
    OR OLD."kind" IS DISTINCT FROM NEW."kind"
    OR OLD."context" IS DISTINCT FROM NEW."context"
    OR OLD."originalUnitId" IS DISTINCT FROM NEW."originalUnitId"
    OR OLD."replacementUnitId" IS DISTINCT FROM NEW."replacementUnitId"
    OR OLD."originalVersion" IS DISTINCT FROM NEW."originalVersion"
    OR OLD."replacementVersion" IS DISTINCT FROM NEW."replacementVersion"
    OR OLD."originalSnapshot" IS DISTINCT FROM NEW."originalSnapshot"
    OR OLD."replacementSnapshot" IS DISTINCT FROM NEW."replacementSnapshot"
    OR OLD."reason" IS DISTINCT FROM NEW."reason"
    OR OLD."actorUserId" IS DISTINCT FROM NEW."actorUserId"
    OR OLD."operationKey" IS DISTINCT FROM NEW."operationKey"
    OR OLD."requestFingerprint" IS DISTINCT FROM NEW."requestFingerprint"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
    OR OLD."status" <> 'pending_review'
    OR NEW."status" NOT IN ('approved', 'rejected')
    OR NEW."version" <> OLD."version" + 1
    OR NEW."reviewedByUserId" IS NULL OR NEW."reviewedAt" IS NULL
  THEN
    RAISE EXCEPTION 'WorkoutSubstitution history is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER workout_substitution_no_delete
BEFORE DELETE ON "WorkoutSubstitution"
FOR EACH ROW EXECUTE FUNCTION guard_workout_substitution_history();
CREATE TRIGGER workout_substitution_review_only
BEFORE UPDATE ON "WorkoutSubstitution"
FOR EACH ROW EXECUTE FUNCTION guard_workout_substitution_history();


-- #404: only future release captures can prove an exact catalog revision.
-- Never backfill legacy release JSON from today's mutable catalog.
-- Retain all #394-019 media provenance fields and catalog snapshot rights.
CREATE OR REPLACE FUNCTION "issue400_capture_released_exercise_catalog"() RETURNS TRIGGER AS $$
BEGIN
  IF OLD."released" = FALSE AND NEW."released" = TRUE THEN
    INSERT INTO "WorkoutReleasedExerciseSnapshot" ("workoutExerciseId", "catalog")
    SELECT e."id", jsonb_build_object(
        'name', library."name", 'version', library."version",
        'videoUrl', library."videoUrl", 'category', library."category",
        'muscleGroup', library."muscleGroup", 'loadType', library."loadType",
        'movementType', library."movementType", 'countingType', library."countingType",
        'notes', library."notes", 'mediaOrigin', library."mediaOrigin",
        'mediaLicense', library."mediaLicense",
        'legacyGrandfathered', library."legacyGrandfathered",
        'capacity', library."capacity", 'movementPattern', library."movementPattern",
        'equipment', library."equipment", 'difficulty', library."difficulty",
        'restrictions', library."restrictions"
      )
      FROM "WorkoutExercise" e
      JOIN "WorkoutDay" d ON d."id" = e."workoutDayId"
      JOIN "ExerciseLibrary" library ON library."id" = e."exerciseId"
    WHERE d."templateId" = OLD."id"
    ON CONFLICT ("workoutExerciseId") DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

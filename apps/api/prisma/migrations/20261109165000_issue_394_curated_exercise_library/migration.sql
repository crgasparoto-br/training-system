-- Issue #394: exercise catalog curation, tenant versioning and immutable snapshots.
-- Legacy catalog entries are grandfathered without inventing a professional sign-off.
CREATE TYPE "ExerciseCurationStatus" AS ENUM ('draft', 'in_review', 'approved', 'inactive');

ALTER TABLE "ExerciseLibrary"
  ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "capacity" TEXT,
  ADD COLUMN "equipment" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "primaryMuscleGroups" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "secondaryMuscleGroups" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "movementPattern" TEXT,
  ADD COLUMN "joints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "laterality" TEXT,
  ADD COLUMN "difficulty" TEXT,
  ADD COLUMN "instructions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "commonErrors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "regressions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "progressions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "alternatives" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "restrictions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "alerts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "mediaOrigin" TEXT,
  ADD COLUMN "mediaLicense" TEXT,
  ADD COLUMN "mediaAuthor" TEXT,
  ADD COLUMN "curationStatus" "ExerciseCurationStatus" NOT NULL DEFAULT 'approved',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "reviewedByUserId" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "lastModifiedByUserId" TEXT,
  ADD COLUMN "lastCurationAction" TEXT,
  ADD COLUMN "legacyGrandfathered" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE "ExerciseLibrary" ADD CONSTRAINT "ExerciseLibrary_version_check" CHECK ("version" > 0);
CREATE INDEX "ExerciseLibrary_contractId_curationStatus_idx"
 ON "ExerciseLibrary" ("contractId", "curationStatus");

CREATE TABLE "ExerciseLibraryRevision" (
  "id" TEXT NOT NULL,
  "exerciseId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExerciseLibraryRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExerciseLibraryRevision_exerciseId_fkey"
    FOREIGN KEY ("exerciseId") REFERENCES "ExerciseLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExerciseLibraryRevision_exerciseId_version_key"
  ON "ExerciseLibraryRevision" ("exerciseId", "version");
CREATE INDEX "ExerciseLibraryRevision_contractId_exerciseId_version_idx"
  ON "ExerciseLibraryRevision" ("contractId", "exerciseId", "version");

INSERT INTO "ExerciseLibraryRevision"
 ("id", "exerciseId", "contractId", "version", "actorUserId", "action", "snapshot", "createdAt")
SELECT e."id" || ':1', e."id", e."contractId", 1, NULL, 'legacy_baseline', to_jsonb(e), CURRENT_TIMESTAMP
FROM "ExerciseLibrary" e;

-- Every write path (API, import, bootstrap, clone) must leave an immutable revision.
CREATE FUNCTION issue394_exercise_revision_before_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."version" <= OLD."version" THEN
      NEW."version" := OLD."version" + 1;
    ELSIF NEW."version" <> OLD."version" + 1 THEN
      RAISE EXCEPTION 'Exercise version must increase by one' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER issue394_exercise_before_write
BEFORE INSERT OR UPDATE ON "ExerciseLibrary"
FOR EACH ROW EXECUTE FUNCTION issue394_exercise_revision_before_write();

CREATE FUNCTION issue394_exercise_revision_after_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "ExerciseLibraryRevision"
   ("id", "exerciseId", "contractId", "version", "actorUserId", "action", "snapshot", "createdAt")
  VALUES (
    NEW."id" || ':' || NEW."version"::text,
    NEW."id", NEW."contractId", NEW."version", NEW."lastModifiedByUserId",
    COALESCE(NEW."lastCurationAction", CASE WHEN TG_OP = 'INSERT' THEN 'bootstrap' ELSE 'system_update' END),
    to_jsonb(NEW), CURRENT_TIMESTAMP
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER issue394_exercise_after_write
AFTER INSERT OR UPDATE ON "ExerciseLibrary"
FOR EACH ROW EXECUTE FUNCTION issue394_exercise_revision_after_write();

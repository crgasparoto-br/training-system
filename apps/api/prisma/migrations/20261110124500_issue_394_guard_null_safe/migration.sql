-- Issue #394 / A-394-011: CHECK accepts UNKNOWN as well as TRUE. Preserve
-- historical records but reject newly approved non-legacy rows with NULL
-- capacity or NULL review action, including writes that bypass the API.
-- This is a new migration: never rewrite the checksum of the applied guard.
ALTER TABLE "ExerciseLibrary"
  DROP CONSTRAINT "ExerciseLibrary_approved_curated_guard";

ALTER TABLE "ExerciseLibrary"
  ADD CONSTRAINT "ExerciseLibrary_approved_curated_guard"
  CHECK (
    "curationStatus" <> 'approved' OR "legacyGrandfathered" = TRUE OR (
      coalesce(btrim("name"), '') <> ''
      AND coalesce(btrim("category"), '') <> ''
      AND coalesce("capacity" IN ('resisted', 'flexibility', 'cyclic', 'balance'), FALSE)
      AND coalesce(cardinality("instructions"), 0) > 0
      AND "reviewedByUserId" IS NOT NULL
      AND "reviewedAt" IS NOT NULL
      AND "lastCurationAction" IS NOT DISTINCT FROM 'approve'
      AND (coalesce(btrim("videoUrl"), '') = '' OR (
        coalesce(btrim("mediaOrigin"), '') <> ''
        AND coalesce(btrim("mediaLicense"), '') <> ''
      ))
    )
  ) NOT VALID;

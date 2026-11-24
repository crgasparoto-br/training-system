-- Issue #579: declared own media does not need a third-party usage license.
-- Preserve the #570 system-catalog exception and professional approval gates.
-- This is incremental; do not rewrite previously applied migrations.
ALTER TABLE "ExerciseLibrary" DROP CONSTRAINT "ExerciseLibrary_approved_curated_guard";

ALTER TABLE "ExerciseLibrary"
  ADD CONSTRAINT "ExerciseLibrary_approved_curated_guard"
  CHECK (
    "curationStatus" <> 'approved' OR "legacyGrandfathered" = TRUE OR (
      "systemDefault" = TRUE
      AND COALESCE(BTRIM("name"), '') <> ''
      AND "lastCurationAction" IN (
        'system_defaults_install', 'system_defaults_approval', 'system_defaults_repair'
      )
    ) OR (
      COALESCE(BTRIM("name"), '') <> ''
      AND COALESCE(BTRIM("category"), '') <> ''
      AND COALESCE("capacity" IN ('resisted','flexibility','cyclic','balance'), FALSE)
      AND COALESCE(CARDINALITY("instructions"), 0) > 0
      AND "reviewedByUserId" IS NOT NULL AND "reviewedAt" IS NOT NULL
      AND "lastCurationAction" IS NOT DISTINCT FROM 'approve'
      AND (COALESCE(BTRIM("videoUrl"), '') = '' OR (
        COALESCE(BTRIM("mediaOrigin"), '') <> ''
        AND (
          BTRIM("mediaOrigin") = 'Própria'
          OR COALESCE(BTRIM("mediaLicense"), '') <> ''
        )
      ))
    )
  ) NOT VALID;

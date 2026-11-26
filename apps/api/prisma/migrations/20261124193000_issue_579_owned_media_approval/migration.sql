-- Issue #579: declared own media does not need a third-party usage license.
-- Preserve the #570 system-catalog exception and professional approval gates.
-- This is incremental; do not rewrite previously applied migrations.
-- Match JS trim for blank media fields, but compare the raw origin exactly.
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
      AND (COALESCE(BTRIM("videoUrl", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '') = '' OR (
        COALESCE(BTRIM("mediaOrigin", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '') <> ''
        AND (
          ("mediaOrigin" COLLATE "C") = 'Própria'
          OR COALESCE(BTRIM("mediaLicense", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '') <> ''
        )
      ))
    )
  ) NOT VALID;

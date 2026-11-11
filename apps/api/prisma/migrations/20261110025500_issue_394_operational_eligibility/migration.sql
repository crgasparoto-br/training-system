-- Remediation A-394-007/A-394-008: the original migration keeps historical
-- status, identifiers, links and media untouched. Legacy approval is NOT an
-- authorization for new operational use until explicit review clears the flag.
-- Protect approved, non-legacy rows even against non-HTTP writes.
ALTER TABLE "ExerciseLibrary" ADD CONSTRAINT "ExerciseLibrary_approved_curated_guard"
CHECK (
  "curationStatus" <> 'approved' OR "legacyGrandfathered" = TRUE OR (
    coalesce(btrim("name"), '') <> ''
    AND coalesce(btrim("category"), '') <> ''
    AND "capacity" IN ('resisted', 'flexibility', 'cyclic', 'balance')
    AND cardinality("instructions") > 0
    AND "reviewedByUserId" IS NOT NULL
    AND "reviewedAt" IS NOT NULL
    AND "lastCurationAction" = 'approve'
    AND (coalesce(btrim("videoUrl"), '') = '' OR (
      coalesce(btrim("mediaOrigin"), '') <> ''
      AND coalesce(btrim("mediaLicense"), '') <> ''
    ))
  )
) NOT VALID;

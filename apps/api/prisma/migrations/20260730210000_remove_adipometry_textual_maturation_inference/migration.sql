BEGIN;

-- Compatibility cleanup for development/test databases that applied an older
-- revision of migration 20260730204000 while Issue #246 was still under review.
-- Clinical text remains descriptive; only an explicit structured
-- `population.maturationRule` may satisfy the approval gate.
DROP TRIGGER IF EXISTS "AdipometryProtocol_00_canonicalize_maturation_rule"
  ON "AdipometryProtocol";

DROP FUNCTION IF EXISTS "canonicalizeAdipometryLegacyMaturationRule"();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'AdipometryProtocol_00_canonicalize_maturation_rule'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_TEXTUAL_MATURATION_TRIGGER_STILL_INSTALLED';
  END IF;

  IF TO_REGPROCEDURE('"canonicalizeAdipometryLegacyMaturationRule"()') IS NOT NULL THEN
    RAISE EXCEPTION 'ADIPOMETRY_TEXTUAL_MATURATION_FUNCTION_STILL_INSTALLED';
  END IF;
END $$;

COMMIT;

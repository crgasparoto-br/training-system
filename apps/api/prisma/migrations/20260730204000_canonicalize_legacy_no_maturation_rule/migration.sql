BEGIN;

-- Backward compatibility for existing structural fixtures and legacy approved
-- definitions that explicitly declared maturation as not required. Required
-- maturation never receives an implicit rule. The persisted snapshot is always
-- structured before the approval constraint is evaluated.
CREATE OR REPLACE FUNCTION "canonicalizeAdipometryLegacyMaturationRule"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" = 'APPROVED'
     AND NOT (NEW."definitionSnapshot" #> '{population}' ? 'maturationRule')
     AND COALESCE(NEW."definitionSnapshot" #>> '{population,maturationCriteria}', '')
         ~* '^\s*(not required|not applicable|n/a|nao exigid|nao aplic)' THEN
    NEW."definitionSnapshot" := JSONB_SET(
      NEW."definitionSnapshot",
      '{population,maturationRule}',
      '{"mode":"NOT_REQUIRED"}'::JSONB,
      TRUE
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "AdipometryProtocol_00_canonicalize_maturation_rule" ON "AdipometryProtocol";
CREATE TRIGGER "AdipometryProtocol_00_canonicalize_maturation_rule"
BEFORE INSERT OR UPDATE OF "status", "definitionSnapshot" ON "AdipometryProtocol"
FOR EACH ROW
EXECUTE FUNCTION "canonicalizeAdipometryLegacyMaturationRule"();

UPDATE "AdipometryProtocol"
SET "definitionSnapshot" = JSONB_SET(
  "definitionSnapshot",
  '{population,maturationRule}',
  '{"mode":"NOT_REQUIRED"}'::JSONB,
  TRUE
)
WHERE "status" = 'APPROVED'
  AND NOT ("definitionSnapshot" #> '{population}' ? 'maturationRule')
  AND COALESCE("definitionSnapshot" #>> '{population,maturationCriteria}', '')
      ~* '^\s*(not required|not applicable|n/a|nao exigid|nao aplic)';

COMMIT;

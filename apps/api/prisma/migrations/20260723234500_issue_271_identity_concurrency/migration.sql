-- Issue #271 audit fix: administrative changes to canonical identity must
-- invalidate stale public pre-registration forms before they can overwrite data.
-- Public student saves already increment StudentOnboardingProcess.version in the
-- application transaction, so this trigger is restricted to non-student sources.
CREATE OR REPLACE FUNCTION bump_pre_registration_version_on_identity_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."identificationData" IS DISTINCT FROM OLD."identificationData"
     AND COALESCE(NEW."sourceType"::text, '') <> 'student' THEN
    UPDATE "StudentOnboardingProcess"
    SET "version" = "version" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "alunoId" = NEW."alunoId"
      AND "contractId" = NEW."contractId"
      AND "completedAt" IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "StudentProfile_bump_pre_registration_version" ON "StudentProfile";

CREATE TRIGGER "StudentProfile_bump_pre_registration_version"
AFTER UPDATE OF "identificationData" ON "StudentProfile"
FOR EACH ROW
EXECUTE FUNCTION bump_pre_registration_version_on_identity_change();
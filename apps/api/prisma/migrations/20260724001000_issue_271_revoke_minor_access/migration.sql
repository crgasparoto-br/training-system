-- Issue #271: revoking the guardian relationship must revoke access to the
-- in-progress minor process, including a previous self-claim by the minor.
-- The invite can be claimed again only after a valid guardian relationship is
-- restored, which re-runs all backend eligibility checks.
CREATE OR REPLACE FUNCTION bump_pre_registration_version_on_guardian_authorization_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status"
     OR NEW."guardianUserId" IS DISTINCT FROM OLD."guardianUserId"
     OR NEW."contractId" IS DISTINCT FROM OLD."contractId" THEN
    UPDATE "StudentOnboardingProcess"
    SET "version" = "version" + 1,
        "claimedByUserId" = CASE
          WHEN NEW."status" <> 'ACTIVE' THEN NULL
          WHEN NEW."guardianUserId" IS DISTINCT FROM OLD."guardianUserId"
               AND "claimRole" = 'GUARDIAN' THEN NULL
          ELSE "claimedByUserId"
        END,
        "claimedAt" = CASE
          WHEN NEW."status" <> 'ACTIVE' THEN NULL
          WHEN NEW."guardianUserId" IS DISTINCT FROM OLD."guardianUserId"
               AND "claimRole" = 'GUARDIAN' THEN NULL
          ELSE "claimedAt"
        END,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "alunoId" = NEW."alunoId"
      AND "contractId" = NEW."contractId"
      AND "completedAt" IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
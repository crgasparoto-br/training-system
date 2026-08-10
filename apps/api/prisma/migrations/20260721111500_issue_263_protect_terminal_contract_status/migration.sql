-- Issue #263: terminal and rejected collaborator documents are immutable in
-- lifecycle fields. Administrative retries cannot reclassify the document,
-- rewrite cancellation evidence or reopen a public token.

CREATE OR REPLACE FUNCTION protect_generated_contract_terminal_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  lifecycle_changed BOOLEAN;
  rejected BOOLEAN;
BEGIN
  IF OLD."partyType" <> 'COLLABORATOR'::"ContractPartyType" THEN
    RETURN NEW;
  END IF;

  lifecycle_changed :=
    NEW."status" IS DISTINCT FROM OLD."status"
    OR NEW."cancelledAt" IS DISTINCT FROM OLD."cancelledAt"
    OR NEW."publicTokenHash" IS DISTINCT FROM OLD."publicTokenHash"
    OR NEW."publicTokenExpiresAt" IS DISTINCT FROM OLD."publicTokenExpiresAt";

  IF NOT lifecycle_changed THEN
    RETURN NEW;
  END IF;

  IF OLD."status"::text IN ('SIGNED', 'CANCELLED', 'EXPIRED') THEN
    RAISE EXCEPTION 'Terminal collaborator contract lifecycle cannot be changed from status %', OLD."status";
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM "ContractAuditLog" log
    WHERE log."contractId" = OLD."id"
      AND log."action" = 'UPDATED'::"ContractAuditAction"
      AND log."details" ->> 'kind' = 'STUDENT_REJECTION'
  ) INTO rejected;

  IF rejected THEN
    RAISE EXCEPTION 'Rejected collaborator contract lifecycle cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "GeneratedContract_protect_terminal_status" ON "GeneratedContract";
CREATE TRIGGER "GeneratedContract_protect_terminal_status"
BEFORE UPDATE OF "status", "cancelledAt", "publicTokenHash", "publicTokenExpiresAt"
ON "GeneratedContract"
FOR EACH ROW EXECUTE FUNCTION protect_generated_contract_terminal_status();

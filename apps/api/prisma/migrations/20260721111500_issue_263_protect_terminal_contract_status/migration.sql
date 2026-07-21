-- Issue #263: signed, cancelled and expired documents are terminal.
-- Administrative retries may repeat the same status, but cannot reclassify
-- a terminal document or fabricate a new lifecycle after completion.

CREATE OR REPLACE FUNCTION protect_generated_contract_terminal_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status"::text IN ('SIGNED', 'CANCELLED', 'EXPIRED')
     AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'Terminal contract status cannot be changed from % to %', OLD."status", NEW."status";
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "GeneratedContract_protect_terminal_status" ON "GeneratedContract";
CREATE TRIGGER "GeneratedContract_protect_terminal_status"
BEFORE UPDATE OF "status" ON "GeneratedContract"
FOR EACH ROW EXECUTE FUNCTION protect_generated_contract_terminal_status();

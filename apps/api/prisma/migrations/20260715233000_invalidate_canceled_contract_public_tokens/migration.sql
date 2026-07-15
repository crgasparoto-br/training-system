-- Keep document and public-token state consistent when any writer cancels a StudentContract.
CREATE OR REPLACE FUNCTION cancel_unsigned_generated_contract_from_student_contract()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status" = 'canceled' THEN
    UPDATE "GeneratedContract"
    SET "status" = 'CANCELLED',
        "cancelledAt" = COALESCE("cancelledAt", NEW."canceledAt", CURRENT_TIMESTAMP),
        "publicTokenHash" = NULL,
        "publicTokenExpiresAt" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = NEW."contractId"
      AND "status" IN ('DRAFT', 'GENERATED', 'SENT', 'VIEWED', 'CANCELLED')
      AND (
        "status" IS DISTINCT FROM 'CANCELLED'
        OR "publicTokenHash" IS NOT NULL
        OR "publicTokenExpiresAt" IS NOT NULL
      );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "StudentContract_cancel_unsigned_document_insert" ON "StudentContract";
DROP TRIGGER IF EXISTS "StudentContract_cancel_unsigned_document_update" ON "StudentContract";

CREATE TRIGGER "StudentContract_cancel_unsigned_document_insert"
AFTER INSERT
ON "StudentContract"
FOR EACH ROW
EXECUTE FUNCTION cancel_unsigned_generated_contract_from_student_contract();

CREATE TRIGGER "StudentContract_cancel_unsigned_document_update"
AFTER UPDATE OF "status", "canceledAt"
ON "StudentContract"
FOR EACH ROW
WHEN (NEW."status" = 'canceled')
EXECUTE FUNCTION cancel_unsigned_generated_contract_from_student_contract();
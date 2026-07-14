-- Contract.serviceId is the authoritative financial service for StudentContract
-- whenever the generated contract has an explicit service association.
CREATE OR REPLACE FUNCTION enforce_student_contract_service_authority()
RETURNS TRIGGER AS $$
DECLARE
  authoritative_service_id TEXT;
BEGIN
  SELECT "serviceId"
    INTO authoritative_service_id
  FROM "Contract"
  WHERE "id" = NEW."contractId";

  IF authoritative_service_id IS NOT NULL THEN
    NEW."serviceId" := authoritative_service_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "StudentContract_enforce_contract_service" ON "StudentContract";
CREATE TRIGGER "StudentContract_enforce_contract_service"
BEFORE INSERT OR UPDATE OF "contractId", "serviceId"
ON "StudentContract"
FOR EACH ROW
EXECUTE FUNCTION enforce_student_contract_service_authority();

CREATE OR REPLACE FUNCTION propagate_contract_service_to_student_contract()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."serviceId" IS NOT NULL AND NEW."serviceId" IS DISTINCT FROM OLD."serviceId" THEN
    UPDATE "StudentContract"
    SET "serviceId" = NEW."serviceId",
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "contractId" = NEW."id"
      AND "serviceId" IS DISTINCT FROM NEW."serviceId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Contract_propagate_service_to_student_contract" ON "Contract";
CREATE TRIGGER "Contract_propagate_service_to_student_contract"
AFTER UPDATE OF "serviceId"
ON "Contract"
FOR EACH ROW
EXECUTE FUNCTION propagate_contract_service_to_student_contract();

-- Repair legacy links that were persisted with the interest service instead of
-- the service associated with the generated contract.
UPDATE "StudentContract" AS student_contract
SET "serviceId" = contract."serviceId",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Contract" AS contract
WHERE student_contract."contractId" = contract."id"
  AND contract."serviceId" IS NOT NULL
  AND student_contract."serviceId" IS DISTINCT FROM contract."serviceId";

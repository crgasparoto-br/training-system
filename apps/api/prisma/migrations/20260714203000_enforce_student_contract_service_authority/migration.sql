-- GeneratedContract.serviceId is the authoritative financial service for StudentContract
-- whenever the generated contract has an explicit service association.
CREATE OR REPLACE FUNCTION enforce_student_contract_service_authority()
RETURNS TRIGGER AS $$
DECLARE
  authoritative_service_id TEXT;
BEGIN
  SELECT "serviceId"
    INTO authoritative_service_id
  FROM "GeneratedContract"
  WHERE "id" = NEW."contractId";

  IF authoritative_service_id IS NOT NULL THEN
    NEW."serviceId" := authoritative_service_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "StudentContract_enforce_contract_service" ON "StudentContract";
DROP TRIGGER IF EXISTS "StudentContract_enforce_contract_service_insert" ON "StudentContract";
DROP TRIGGER IF EXISTS "StudentContract_enforce_contract_service_update" ON "StudentContract";
CREATE TRIGGER "StudentContract_enforce_contract_service_insert"
BEFORE INSERT
ON "StudentContract"
FOR EACH ROW
EXECUTE FUNCTION enforce_student_contract_service_authority();
CREATE TRIGGER "StudentContract_enforce_contract_service_update"
BEFORE UPDATE OF "contractId", "serviceId"
ON "StudentContract"
FOR EACH ROW
EXECUTE FUNCTION enforce_student_contract_service_authority();

CREATE OR REPLACE FUNCTION with_financial_current_service(
  existing_responses JSONB,
  service_name TEXT
)
RETURNS JSONB AS $$
DECLARE
  normalized_responses JSONB;
  normalized_financial JSONB;
BEGIN
  normalized_responses := CASE
    WHEN jsonb_typeof(COALESCE(existing_responses, '{}'::jsonb)) = 'object'
      THEN COALESCE(existing_responses, '{}'::jsonb)
    ELSE '{}'::jsonb
  END;
  normalized_financial := CASE
    WHEN jsonb_typeof(normalized_responses -> 'financial') = 'object'
      THEN normalized_responses -> 'financial'
    ELSE '{}'::jsonb
  END;

  RETURN jsonb_set(
    normalized_responses,
    '{financial}',
    jsonb_set(normalized_financial, '{currentService}', to_jsonb(service_name), true),
    true
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION sync_active_student_contract_financial_service()
RETURNS TRIGGER AS $$
DECLARE
  authoritative_service_name TEXT;
BEGIN
  IF NEW."serviceId" IS NOT NULL AND (
    NEW."status" = 'active'
    OR (
      NEW."status" IN ('draft', 'pending_signature')
      AND NOT EXISTS (
        SELECT 1
        FROM "StudentContract" AS active_link
        WHERE active_link."alunoId" = NEW."alunoId"
          AND active_link."status" = 'active'
          AND active_link."id" <> NEW."id"
      )
    )
  ) THEN
    SELECT "name"
      INTO authoritative_service_name
    FROM "ServiceOption"
    WHERE "id" = NEW."serviceId";

    IF authoritative_service_name IS NOT NULL THEN
      UPDATE "AlunoIntakeForm"
      SET "formResponses" = with_financial_current_service(
            "formResponses"::jsonb,
            authoritative_service_name
          ),
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "alunoId" = NEW."alunoId"
        AND COALESCE("formResponses"::jsonb #>> '{financial,currentService}', '')
            IS DISTINCT FROM authoritative_service_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "StudentContract_sync_financial_service" ON "StudentContract";
DROP TRIGGER IF EXISTS "StudentContract_sync_financial_service_insert" ON "StudentContract";
DROP TRIGGER IF EXISTS "StudentContract_sync_financial_service_update" ON "StudentContract";
CREATE TRIGGER "StudentContract_sync_financial_service_insert"
AFTER INSERT
ON "StudentContract"
FOR EACH ROW
EXECUTE FUNCTION sync_active_student_contract_financial_service();
CREATE TRIGGER "StudentContract_sync_financial_service_update"
AFTER UPDATE OF "contractId", "serviceId", "status"
ON "StudentContract"
FOR EACH ROW
EXECUTE FUNCTION sync_active_student_contract_financial_service();

CREATE OR REPLACE FUNCTION propagate_generated_contract_service_to_student_contract()
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

DROP TRIGGER IF EXISTS "Contract_propagate_service_to_student_contract" ON "GeneratedContract";
DROP TRIGGER IF EXISTS "GeneratedContract_propagate_service_to_student_contract" ON "GeneratedContract";
CREATE TRIGGER "GeneratedContract_propagate_service_to_student_contract"
AFTER UPDATE OF "serviceId"
ON "GeneratedContract"
FOR EACH ROW
EXECUTE FUNCTION propagate_generated_contract_service_to_student_contract();

-- Repair legacy links that were persisted with the interest service instead of
-- the service associated with the generated contract.
UPDATE "StudentContract" AS student_contract
SET "serviceId" = generated_contract."serviceId",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "GeneratedContract" AS generated_contract
WHERE student_contract."contractId" = generated_contract."id"
  AND generated_contract."serviceId" IS NOT NULL
  AND student_contract."serviceId" IS DISTINCT FROM generated_contract."serviceId";

-- Repair the denormalized financial form value for the active link as well.
UPDATE "AlunoIntakeForm" AS intake
SET "formResponses" = with_financial_current_service(
      intake."formResponses"::jsonb,
      service."name"
    ),
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Aluno" AS aluno
JOIN "StudentContract" AS student_contract
  ON student_contract."id" = aluno."currentStudentContractId"
JOIN "GeneratedContract" AS generated_contract
  ON generated_contract."id" = student_contract."contractId"
JOIN "ServiceOption" AS service
  ON service."id" = generated_contract."serviceId"
WHERE intake."alunoId" = aluno."id"
  AND student_contract."status" = 'active'
  AND COALESCE(intake."formResponses"::jsonb #>> '{financial,currentService}', '')
      IS DISTINCT FROM service."name";
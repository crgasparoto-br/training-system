-- Enforce the financial service authority without trusting serviceId supplied by clients.
-- GeneratedContract.serviceId wins; when it is null, the persisted Aluno.serviceId is the fallback.
CREATE OR REPLACE FUNCTION enforce_student_contract_service_authority()
RETURNS TRIGGER AS $$
DECLARE
  authoritative_service_id TEXT;
BEGIN
  SELECT COALESCE(generated_contract."serviceId", aluno."serviceId")
    INTO authoritative_service_id
  FROM "GeneratedContract" AS generated_contract
  JOIN "Aluno" AS aluno ON aluno."id" = NEW."alunoId"
  WHERE generated_contract."id" = NEW."contractId";

  NEW."serviceId" := authoritative_service_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "StudentContract_enforce_contract_service_insert" ON "StudentContract";
DROP TRIGGER IF EXISTS "StudentContract_enforce_contract_service_update" ON "StudentContract";
CREATE TRIGGER "StudentContract_enforce_contract_service_insert"
BEFORE INSERT
ON "StudentContract"
FOR EACH ROW
EXECUTE FUNCTION enforce_student_contract_service_authority();
CREATE TRIGGER "StudentContract_enforce_contract_service_update"
BEFORE UPDATE OF "contractId", "alunoId", "serviceId"
ON "StudentContract"
FOR EACH ROW
EXECUTE FUNCTION enforce_student_contract_service_authority();

-- Synchronize the denormalized read model, including the explicit "no current service" state.
CREATE OR REPLACE FUNCTION sync_active_student_contract_financial_service()
RETURNS TRIGGER AS $$
DECLARE
  authoritative_service_name TEXT := '';
  controls_current_service BOOLEAN;
BEGIN
  controls_current_service := NEW."status" = 'active'
    OR (
      NEW."status" IN ('draft', 'pending_signature')
      AND NOT EXISTS (
        SELECT 1
        FROM "StudentContract" AS active_link
        WHERE active_link."alunoId" = NEW."alunoId"
          AND active_link."status" = 'active'
          AND active_link."id" <> NEW."id"
      )
    );

  IF controls_current_service THEN
    IF NEW."serviceId" IS NOT NULL THEN
      SELECT "name"
        INTO authoritative_service_name
      FROM "ServiceOption"
      WHERE "id" = NEW."serviceId";
    END IF;

    authoritative_service_name := COALESCE(authoritative_service_name, '');

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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- When the generated contract service changes (including removal), refresh every linked service.
CREATE OR REPLACE FUNCTION propagate_generated_contract_service_to_student_contract()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."serviceId" IS DISTINCT FROM OLD."serviceId" THEN
    UPDATE "StudentContract" AS student_contract
    SET "serviceId" = COALESCE(NEW."serviceId", aluno."serviceId"),
        "updatedAt" = CURRENT_TIMESTAMP
    FROM "Aluno" AS aluno
    WHERE student_contract."contractId" = NEW."id"
      AND aluno."id" = student_contract."alunoId"
      AND student_contract."serviceId"
          IS DISTINCT FROM COALESCE(NEW."serviceId", aluno."serviceId");
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "GeneratedContract_propagate_service_to_student_contract" ON "GeneratedContract";
CREATE TRIGGER "GeneratedContract_propagate_service_to_student_contract"
AFTER UPDATE OF "serviceId"
ON "GeneratedContract"
FOR EACH ROW
EXECUTE FUNCTION propagate_generated_contract_service_to_student_contract();

-- A contract without its own service follows the persisted student interest service.
CREATE OR REPLACE FUNCTION propagate_aluno_interest_service_to_student_contract()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."serviceId" IS DISTINCT FROM OLD."serviceId" THEN
    UPDATE "StudentContract" AS student_contract
    SET "serviceId" = NEW."serviceId",
        "updatedAt" = CURRENT_TIMESTAMP
    FROM "GeneratedContract" AS generated_contract
    WHERE student_contract."alunoId" = NEW."id"
      AND generated_contract."id" = student_contract."contractId"
      AND generated_contract."serviceId" IS NULL
      AND student_contract."serviceId" IS DISTINCT FROM NEW."serviceId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Aluno_propagate_interest_service_to_student_contract" ON "Aluno";
CREATE TRIGGER "Aluno_propagate_interest_service_to_student_contract"
AFTER UPDATE OF "serviceId"
ON "Aluno"
FOR EACH ROW
EXECUTE FUNCTION propagate_aluno_interest_service_to_student_contract();

-- Idempotent repair used by the migration and by the PostgreSQL integration test.
CREATE OR REPLACE FUNCTION repair_student_contract_service_authority_data()
RETURNS VOID AS $$
BEGIN
  UPDATE "StudentContract" AS student_contract
  SET "serviceId" = COALESCE(generated_contract."serviceId", aluno."serviceId"),
      "updatedAt" = CURRENT_TIMESTAMP
  FROM "GeneratedContract" AS generated_contract,
       "Aluno" AS aluno
  WHERE student_contract."contractId" = generated_contract."id"
    AND student_contract."alunoId" = aluno."id"
    AND student_contract."serviceId"
        IS DISTINCT FROM COALESCE(generated_contract."serviceId", aluno."serviceId");

  UPDATE "AlunoIntakeForm" AS intake
  SET "formResponses" = with_financial_current_service(
        intake."formResponses"::jsonb,
        COALESCE(service."name", '')
      ),
      "updatedAt" = CURRENT_TIMESTAMP
  FROM "Aluno" AS aluno
  JOIN "StudentContract" AS student_contract
    ON student_contract."id" = aluno."currentStudentContractId"
  LEFT JOIN "ServiceOption" AS service
    ON service."id" = student_contract."serviceId"
  WHERE intake."alunoId" = aluno."id"
    AND student_contract."status" = 'active'
    AND COALESCE(intake."formResponses"::jsonb #>> '{financial,currentService}', '')
        IS DISTINCT FROM COALESCE(service."name", '');
END;
$$ LANGUAGE plpgsql;

SELECT repair_student_contract_service_authority_data();

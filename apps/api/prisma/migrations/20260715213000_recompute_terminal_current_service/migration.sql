-- Recompute the denormalized current service from the effective contract set.
-- This also clears stale values when the last active/prepared contract becomes terminal.
CREATE OR REPLACE FUNCTION resolve_student_financial_current_service_name(
  target_aluno_id TEXT
)
RETURNS TEXT AS $$
DECLARE
  resolved_service_name TEXT;
BEGIN
  SELECT COALESCE(service."name", '')
    INTO resolved_service_name
  FROM "StudentContract" AS student_contract
  JOIN "Aluno" AS aluno
    ON aluno."id" = student_contract."alunoId"
  LEFT JOIN "ServiceOption" AS service
    ON service."id" = student_contract."serviceId"
  WHERE student_contract."alunoId" = target_aluno_id
    AND student_contract."status" = 'active'
  ORDER BY
    CASE
      WHEN aluno."currentStudentContractId" = student_contract."id" THEN 0
      ELSE 1
    END,
    student_contract."updatedAt" DESC,
    student_contract."createdAt" DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN COALESCE(resolved_service_name, '');
  END IF;

  SELECT COALESCE(service."name", '')
    INTO resolved_service_name
  FROM "StudentContract" AS student_contract
  LEFT JOIN "ServiceOption" AS service
    ON service."id" = student_contract."serviceId"
  WHERE student_contract."alunoId" = target_aluno_id
    AND student_contract."status" IN ('draft', 'pending_signature')
  ORDER BY
    student_contract."updatedAt" DESC,
    student_contract."createdAt" DESC
  LIMIT 1;

  RETURN COALESCE(resolved_service_name, '');
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION refresh_student_financial_current_service(
  target_aluno_id TEXT
)
RETURNS VOID AS $$
DECLARE
  authoritative_service_name TEXT;
BEGIN
  authoritative_service_name := resolve_student_financial_current_service_name(
    target_aluno_id
  );

  UPDATE "AlunoIntakeForm"
  SET "formResponses" = with_financial_current_service(
        "formResponses"::jsonb,
        authoritative_service_name
      ),
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "alunoId" = target_aluno_id
    AND COALESCE("formResponses"::jsonb #>> '{financial,currentService}', '')
        IS DISTINCT FROM authoritative_service_name;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_active_student_contract_financial_service()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_student_financial_current_service(OLD."alunoId");
    RETURN OLD;
  END IF;

  PERFORM refresh_student_financial_current_service(NEW."alunoId");

  IF TG_OP = 'UPDATE' AND OLD."alunoId" IS DISTINCT FROM NEW."alunoId" THEN
    PERFORM refresh_student_financial_current_service(OLD."alunoId");
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "StudentContract_sync_financial_service_insert" ON "StudentContract";
DROP TRIGGER IF EXISTS "StudentContract_sync_financial_service_update" ON "StudentContract";
DROP TRIGGER IF EXISTS "StudentContract_sync_financial_service_delete" ON "StudentContract";

CREATE TRIGGER "StudentContract_sync_financial_service_insert"
AFTER INSERT
ON "StudentContract"
FOR EACH ROW
EXECUTE FUNCTION sync_active_student_contract_financial_service();

CREATE TRIGGER "StudentContract_sync_financial_service_update"
AFTER UPDATE OF "contractId", "alunoId", "serviceId", "status"
ON "StudentContract"
FOR EACH ROW
EXECUTE FUNCTION sync_active_student_contract_financial_service();

CREATE TRIGGER "StudentContract_sync_financial_service_delete"
AFTER DELETE
ON "StudentContract"
FOR EACH ROW
EXECUTE FUNCTION sync_active_student_contract_financial_service();

-- Repair stale read-model values left by terminal transitions that predate this migration.
UPDATE "AlunoIntakeForm" AS intake
SET "formResponses" = with_financial_current_service(
      intake."formResponses"::jsonb,
      resolve_student_financial_current_service_name(intake."alunoId")
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE COALESCE(intake."formResponses"::jsonb #>> '{financial,currentService}', '')
      IS DISTINCT FROM resolve_student_financial_current_service_name(intake."alunoId");

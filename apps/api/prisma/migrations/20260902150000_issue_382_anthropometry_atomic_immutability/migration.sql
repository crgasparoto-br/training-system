-- Issue #382 audit remediation: make completed Anthropometry records immutable at
-- the persistence boundary and serialize ordinary mutations with completion.
--
-- Ordinary writes and completion both acquire FOR UPDATE on the lifecycle row. This
-- closes the TOCTOU window where an API pre-check could observe DRAFT and write after
-- another transaction committed COMPLETED. Audited correction is the only supported
-- bypass and enables a transaction-local PostgreSQL setting after authorization checks.

CREATE OR REPLACE FUNCTION guard_anthropometry_assessment_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  lifecycle_status TEXT;
BEGIN
  IF current_setting('app.anthropometry_correction', true) = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT "status"
    INTO lifecycle_status
  FROM "AnthropometryAssessmentLifecycle"
  WHERE "assessmentId" = NEW."id"
    AND "contractId" = NEW."contractId"
  FOR UPDATE;

  IF lifecycle_status IS NULL THEN
    RAISE EXCEPTION 'Estado da avaliação antropométrica não encontrado.'
      USING ERRCODE = 'P0001';
  END IF;

  IF lifecycle_status = 'COMPLETED' THEN
    RAISE EXCEPTION 'A avaliação antropométrica concluída é imutável. Use o fluxo de correção auditada.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS anthropometry_assessment_immutable_update
  ON "AnthropometryAssessment";
CREATE TRIGGER anthropometry_assessment_immutable_update
BEFORE UPDATE ON "AnthropometryAssessment"
FOR EACH ROW
EXECUTE FUNCTION guard_anthropometry_assessment_update();

CREATE OR REPLACE FUNCTION guard_anthropometry_assessment_child_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  assessment_id TEXT;
  lifecycle_status TEXT;
BEGIN
  IF current_setting('app.anthropometry_correction', true) = 'true' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  assessment_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD."assessmentId"
    ELSE NEW."assessmentId"
  END;

  -- Keep parent/cascade deletion behavior intact. A direct child delete still sees
  -- the parent and is guarded; a referential cascade after parent deletion does not.
  IF TG_OP = 'DELETE' THEN
    PERFORM 1
    FROM "AnthropometryAssessment"
    WHERE "id" = assessment_id;
    IF NOT FOUND THEN
      RETURN OLD;
    END IF;
  END IF;

  SELECT "status"
    INTO lifecycle_status
  FROM "AnthropometryAssessmentLifecycle"
  WHERE "assessmentId" = assessment_id
  FOR UPDATE;

  IF lifecycle_status IS NULL THEN
    RAISE EXCEPTION 'Estado da avaliação antropométrica não encontrado.'
      USING ERRCODE = 'P0001';
  END IF;

  IF lifecycle_status = 'COMPLETED' THEN
    RAISE EXCEPTION 'A avaliação antropométrica concluída é imutável. Use o fluxo de correção auditada.'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS anthropometry_value_immutable_mutation
  ON "AnthropometryAssessmentValue";
CREATE TRIGGER anthropometry_value_immutable_mutation
BEFORE INSERT OR UPDATE OR DELETE ON "AnthropometryAssessmentValue"
FOR EACH ROW
EXECUTE FUNCTION guard_anthropometry_assessment_child_mutation();

DROP TRIGGER IF EXISTS anthropometry_observation_immutable_mutation
  ON "AnthropometryObservation";
CREATE TRIGGER anthropometry_observation_immutable_mutation
BEFORE INSERT OR UPDATE OR DELETE ON "AnthropometryObservation"
FOR EACH ROW
EXECUTE FUNCTION guard_anthropometry_assessment_child_mutation();

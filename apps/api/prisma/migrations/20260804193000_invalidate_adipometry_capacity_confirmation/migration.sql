CREATE OR REPLACE FUNCTION "invalidateAdipometryCapacityWarningConfirmation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF
    NEW."assessmentDate" IS DISTINCT FROM OLD."assessmentDate"
    OR NEW."weightKg" IS DISTINCT FROM OLD."weightKg"
    OR NEW."tricepsMm" IS DISTINCT FROM OLD."tricepsMm"
    OR NEW."subscapularMm" IS DISTINCT FROM OLD."subscapularMm"
    OR NEW."suprailiacMm" IS DISTINCT FROM OLD."suprailiacMm"
    OR NEW."abdominalMm" IS DISTINCT FROM OLD."abdominalMm"
    OR NEW."thighMm" IS DISTINCT FROM OLD."thighMm"
    OR NEW."protocolId" IS DISTINCT FROM OLD."protocolId"
    OR NEW."protocolCode" IS DISTINCT FROM OLD."protocolCode"
    OR NEW."protocolVersion" IS DISTINCT FROM OLD."protocolVersion"
    OR NEW."protocolSex" IS DISTINCT FROM OLD."protocolSex"
    OR NEW."protocolSexSource" IS DISTINCT FROM OLD."protocolSexSource"
    OR NEW."protocolSexOverrideReason" IS DISTINCT FROM OLD."protocolSexOverrideReason"
    OR NEW."anthropometryAssessmentId" IS DISTINCT FROM OLD."anthropometryAssessmentId"
    OR NEW."notes" IS DISTINCT FROM OLD."notes"
  THEN
    NEW."skinfoldCapacityWarningConfirmedByUserId" := NULL;
    NEW."skinfoldCapacityWarningConfirmedAt" := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('"AdipometryAssessment"') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS "AdipometryAssessmentInvalidateCapacityWarningConfirmation" ON "AdipometryAssessment"';
    EXECUTE 'CREATE TRIGGER "AdipometryAssessmentInvalidateCapacityWarningConfirmation" BEFORE UPDATE ON "AdipometryAssessment" FOR EACH ROW EXECUTE FUNCTION "invalidateAdipometryCapacityWarningConfirmation"()';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "assertAdipometryResponsibleProfessorAvailable"(
  p_contract_id TEXT,
  p_professor_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  responsible_role TEXT;
  responsible_function_id TEXT;
BEGIN
  SELECT
    LOWER(professor."role"::text),
    professor."collaboratorFunctionId"
  INTO responsible_role, responsible_function_id
  FROM "Professor" professor
  JOIN "User" app_user ON app_user.id = professor."userId"
  JOIN "CollaboratorFunctionOption" collaborator_function
    ON collaborator_function.id = professor."collaboratorFunctionId"
  WHERE professor.id = p_professor_id
    AND professor."contractId" = p_contract_id
    AND app_user."isActive" = TRUE
    AND collaborator_function."isActive" = TRUE
    AND LOWER(TRIM(COALESCE(professor."currentStatus", 'active'))) NOT IN (
      'inactive', 'inativo', 'dismissed', 'desligado', 'terminated', 'encerrado'
    )
    AND (
      professor."dismissalDate" IS NULL
      OR professor."dismissalDate" > CURRENT_TIMESTAMP
    )
  FOR SHARE OF professor, app_user, collaborator_function;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBLE_NOT_AVAILABLE' USING ERRCODE = 'P0001';
  END IF;

  IF responsible_role <> 'master' THEN
    PERFORM 1
    FROM "AccessPermission" screen_permission
    WHERE screen_permission."collaboratorFunctionId" = responsible_function_id
      AND screen_permission."screenKey" = 'physicalAssessment.protocol'
      AND screen_permission."blockKey" = ''
      AND screen_permission."canView" = TRUE
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBLE_NOT_AVAILABLE' USING ERRCODE = 'P0001';
    END IF;

    PERFORM 1
    FROM "AccessPermission" manage_permission
    WHERE manage_permission."collaboratorFunctionId" = responsible_function_id
      AND manage_permission."screenKey" = 'physicalAssessment.protocol'
      AND manage_permission."blockKey" = 'physicalAssessment.adpt.actions.manage'
      AND manage_permission."canView" = TRUE
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBLE_NOT_AVAILABLE' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION "validateAdipometryResponsibleProfessor"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM "assertAdipometryResponsibleProfessorAvailable"(
    NEW."contractId",
    NEW."professorId"
  );
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('"AdipometryAssessment"') IS NOT NULL
    AND to_regclass('"Professor"') IS NOT NULL
    AND to_regclass('"User"') IS NOT NULL
    AND to_regclass('"CollaboratorFunctionOption"') IS NOT NULL
    AND to_regclass('"AccessPermission"') IS NOT NULL
  THEN
    EXECUTE 'DROP TRIGGER IF EXISTS "AdipometryAssessmentValidateResponsibleProfessor" ON "AdipometryAssessment"';
    EXECUTE 'CREATE TRIGGER "AdipometryAssessmentValidateResponsibleProfessor" BEFORE INSERT OR UPDATE ON "AdipometryAssessment" FOR EACH ROW EXECUTE FUNCTION "validateAdipometryResponsibleProfessor"()';
  END IF;
END;
$$;

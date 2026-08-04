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

CREATE OR REPLACE FUNCTION "validateAdipometryResponsibleProfessor"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "Professor" professor
    JOIN "User" app_user ON app_user.id = professor."userId"
    JOIN "CollaboratorFunctionOption" collaborator_function
      ON collaborator_function.id = professor."collaboratorFunctionId"
    WHERE professor.id = NEW."professorId"
      AND professor."contractId" = NEW."contractId"
      AND app_user."isActive" = TRUE
      AND collaborator_function."isActive" = TRUE
      AND LOWER(TRIM(COALESCE(professor."currentStatus", 'active'))) NOT IN (
        'inactive', 'inativo', 'dismissed', 'desligado', 'terminated', 'encerrado'
      )
      AND (
        professor."dismissalDate" IS NULL
        OR professor."dismissalDate" > CURRENT_TIMESTAMP
      )
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBLE_NOT_AVAILABLE' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('"AdipometryAssessment"') IS NOT NULL
    AND to_regclass('"Professor"') IS NOT NULL
    AND to_regclass('"User"') IS NOT NULL
    AND to_regclass('"CollaboratorFunctionOption"') IS NOT NULL
  THEN
    EXECUTE 'DROP TRIGGER IF EXISTS "AdipometryAssessmentValidateResponsibleProfessor" ON "AdipometryAssessment"';
    EXECUTE 'CREATE TRIGGER "AdipometryAssessmentValidateResponsibleProfessor" BEFORE INSERT OR UPDATE OF "professorId", "contractId" ON "AdipometryAssessment" FOR EACH ROW EXECUTE FUNCTION "validateAdipometryResponsibleProfessor"()';
  END IF;
END;
$$;

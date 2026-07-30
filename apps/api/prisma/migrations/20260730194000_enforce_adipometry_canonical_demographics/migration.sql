BEGIN;

-- Issue #246 audit remediation: completed ADPT assessments must derive age,
-- sex and maturation from canonical student records. Caller-provided snapshot
-- demographics are ignored and replaced inside the same transaction.
CREATE OR REPLACE FUNCTION "resolveAdipometryCanonicalProfile"(
  p_contract_id TEXT,
  p_aluno_id TEXT,
  p_assessment_date TIMESTAMP(3)
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
STRICT
AS $$
DECLARE
  v_user_id TEXT;
  v_aluno_birth_date TIMESTAMP(3);
  v_aluno_updated_at TIMESTAMP(3);
  v_student_profile_id TEXT;
  v_student_identification JSONB;
  v_student_profile_updated_at TIMESTAMP(3);
  v_legacy_profile_id TEXT;
  v_legacy_birth_date TIMESTAMP(3);
  v_legacy_gender TEXT;
  v_legacy_profile_updated_at TIMESTAMP(3);
  v_birth_date DATE;
  v_birth_date_text TEXT;
  v_birth_date_source JSONB;
  v_sex_raw TEXT;
  v_sex TEXT;
  v_sex_source JSONB;
  v_maturation TEXT;
  v_maturation_source JSONB := NULL;
  v_age INTEGER;
BEGIN
  SELECT aluno."userId", aluno."birthDate", aluno."updatedAt"
    INTO v_user_id, v_aluno_birth_date, v_aluno_updated_at
  FROM "Aluno" aluno
  WHERE aluno."id" = p_aluno_id
    AND aluno."contractId" = p_contract_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ADIPOMETRY_STUDENT_NOT_FOUND_IN_CONTRACT' USING ERRCODE = '23503';
  END IF;

  SELECT profile."id", profile."identificationData", profile."updatedAt"
    INTO v_student_profile_id, v_student_identification, v_student_profile_updated_at
  FROM "StudentProfile" profile
  WHERE profile."alunoId" = p_aluno_id
    AND profile."contractId" = p_contract_id
  FOR SHARE;

  IF v_user_id IS NOT NULL THEN
    SELECT profile."id", profile."birthDate", profile."gender"::TEXT, profile."updatedAt"
      INTO v_legacy_profile_id, v_legacy_birth_date, v_legacy_gender, v_legacy_profile_updated_at
    FROM "Profile" profile
    WHERE profile."userId" = v_user_id
    FOR SHARE;
  END IF;

  IF v_student_identification IS NOT NULL
     AND JSONB_TYPEOF(v_student_identification) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'ADIPOMETRY_STUDENT_PROFILE_IDENTIFICATION_INVALID' USING ERRCODE = '22023';
  END IF;

  IF v_student_identification ? 'birthDate'
     AND JSONB_TYPEOF(v_student_identification -> 'birthDate') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'ADIPOMETRY_BIRTH_DATE_INVALID' USING ERRCODE = '22007';
  END IF;

  v_birth_date_text := NULLIF(BTRIM(v_student_identification ->> 'birthDate'), '');
  IF v_birth_date_text IS NOT NULL THEN
    BEGIN
      IF v_birth_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}($|T)' THEN
        RAISE EXCEPTION 'ADIPOMETRY_BIRTH_DATE_INVALID' USING ERRCODE = '22007';
      END IF;
      v_birth_date := LEFT(v_birth_date_text, 10)::DATE;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'ADIPOMETRY_BIRTH_DATE_INVALID' USING ERRCODE = '22007';
    END;
    v_birth_date_source := JSONB_BUILD_OBJECT(
      'kind', 'STUDENT_PROFILE',
      'recordId', v_student_profile_id,
      'updatedAt', v_student_profile_updated_at
    );
  ELSIF v_aluno_birth_date IS NOT NULL THEN
    v_birth_date := v_aluno_birth_date::DATE;
    v_birth_date_source := JSONB_BUILD_OBJECT(
      'kind', 'ALUNO_PROJECTION',
      'recordId', p_aluno_id,
      'updatedAt', v_aluno_updated_at
    );
  ELSIF v_legacy_birth_date IS NOT NULL THEN
    v_birth_date := v_legacy_birth_date::DATE;
    v_birth_date_source := JSONB_BUILD_OBJECT(
      'kind', 'LEGACY_PROFILE',
      'recordId', v_legacy_profile_id,
      'updatedAt', v_legacy_profile_updated_at
    );
  ELSE
    RAISE EXCEPTION 'ADIPOMETRY_BIRTH_DATE_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF p_assessment_date::DATE < v_birth_date THEN
    RAISE EXCEPTION 'ADIPOMETRY_BIRTH_DATE_AFTER_ASSESSMENT' USING ERRCODE = '23514';
  END IF;

  v_age := DATE_PART('year', AGE(p_assessment_date::DATE, v_birth_date))::INTEGER;

  IF v_student_identification ? 'gender'
     AND JSONB_TYPEOF(v_student_identification -> 'gender') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'ADIPOMETRY_SEX_INVALID' USING ERRCODE = '22023';
  END IF;

  v_sex_raw := NULLIF(BTRIM(v_student_identification ->> 'gender'), '');
  IF v_sex_raw IS NOT NULL THEN
    v_sex_source := JSONB_BUILD_OBJECT(
      'kind', 'STUDENT_PROFILE',
      'recordId', v_student_profile_id,
      'updatedAt', v_student_profile_updated_at
    );
  ELSIF NULLIF(BTRIM(v_legacy_gender), '') IS NOT NULL THEN
    v_sex_raw := v_legacy_gender;
    v_sex_source := JSONB_BUILD_OBJECT(
      'kind', 'LEGACY_PROFILE',
      'recordId', v_legacy_profile_id,
      'updatedAt', v_legacy_profile_updated_at
    );
  ELSE
    RAISE EXCEPTION 'ADIPOMETRY_SEX_REQUIRED' USING ERRCODE = '23514';
  END IF;

  v_sex := UPPER(v_sex_raw);

  IF v_student_identification ? 'maturation'
     AND JSONB_TYPEOF(v_student_identification -> 'maturation') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'ADIPOMETRY_MATURATION_INVALID' USING ERRCODE = '22023';
  END IF;

  v_maturation := NULLIF(BTRIM(v_student_identification ->> 'maturation'), '');
  IF v_maturation IS NOT NULL THEN
    v_maturation_source := JSONB_BUILD_OBJECT(
      'kind', 'STUDENT_PROFILE',
      'recordId', v_student_profile_id,
      'updatedAt', v_student_profile_updated_at
    );
  END IF;

  RETURN JSONB_BUILD_OBJECT(
    'ageAtAssessment', v_age,
    'profileCriteria', JSONB_BUILD_OBJECT(
      'sex', v_sex,
      'maturation', v_maturation,
      'birthDate', TO_CHAR(v_birth_date, 'YYYY-MM-DD'),
      'sources', JSONB_BUILD_OBJECT(
        'birthDate', v_birth_date_source,
        'sex', v_sex_source,
        'maturation', v_maturation_source
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION "canonicalizeAdipometryDemographics"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_canonical_profile JSONB;
BEGIN
  IF NEW."status" <> 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  -- Reciprocal correction linking is the only normal update to an already
  -- completed row. Its historical snapshot must remain unchanged.
  IF TG_OP = 'UPDATE' AND OLD."status" = 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  v_canonical_profile := "resolveAdipometryCanonicalProfile"(
    NEW."contractId",
    NEW."alunoId",
    NEW."assessmentDate"
  );

  -- The following canonicalization trigger consumes these two fields and then
  -- rebuilds the complete snapshot. Any demographic values supplied by the
  -- caller are therefore replaced before calculation and persistence.
  NEW."calculationSnapshot" := v_canonical_profile;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "AdipometryAssessment_00_canonical_demographics" ON "AdipometryAssessment";
CREATE TRIGGER "AdipometryAssessment_00_canonical_demographics"
BEFORE INSERT OR UPDATE ON "AdipometryAssessment"
FOR EACH ROW
EXECUTE FUNCTION "canonicalizeAdipometryDemographics"();

COMMIT;

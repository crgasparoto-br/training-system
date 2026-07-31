BEGIN;

-- Protocol approval is a clinical gate, not only an administrative status.
ALTER TABLE "AdipometryProtocol"
  DROP CONSTRAINT "AdipometryProtocol_approval_check";
ALTER TABLE "AdipometryProtocol"
  ADD CONSTRAINT "AdipometryProtocol_approval_check" CHECK (
    "status" <> 'APPROVED'
    OR (
      "approvedAt" IS NOT NULL
      AND "approvedByUserId" IS NOT NULL
      AND NULLIF(BTRIM("reference"), '') IS NOT NULL
      AND JSONB_TYPEOF("definitionSnapshot") = 'object'
      AND "definitionSnapshot" ?& ARRAY[
        'population',
        'requiredSkinfolds',
        'inputUnits',
        'outputUnits',
        'equations',
        'limits',
        'precision',
        'rounding',
        'missingDataBehavior',
        'testVectors'
      ]
      AND JSONB_TYPEOF("definitionSnapshot" -> 'population') = 'object'
      AND "definitionSnapshot" -> 'population' <> '{}'::JSONB
      AND JSONB_TYPEOF("definitionSnapshot" -> 'requiredSkinfolds') = 'array'
      AND JSONB_ARRAY_LENGTH("definitionSnapshot" -> 'requiredSkinfolds') > 0
      AND JSONB_TYPEOF("definitionSnapshot" -> 'inputUnits') = 'object'
      AND "definitionSnapshot" -> 'inputUnits' <> '{}'::JSONB
      AND JSONB_TYPEOF("definitionSnapshot" -> 'outputUnits') = 'object'
      AND "definitionSnapshot" -> 'outputUnits' <> '{}'::JSONB
      AND CASE JSONB_TYPEOF("definitionSnapshot" -> 'equations')
        WHEN 'array' THEN JSONB_ARRAY_LENGTH("definitionSnapshot" -> 'equations') > 0
        WHEN 'object' THEN "definitionSnapshot" -> 'equations' <> '{}'::JSONB
        ELSE FALSE
      END
      AND JSONB_TYPEOF("definitionSnapshot" -> 'limits') = 'object'
      AND "definitionSnapshot" -> 'limits' <> '{}'::JSONB
      AND JSONB_TYPEOF("definitionSnapshot" -> 'precision') = 'object'
      AND "definitionSnapshot" -> 'precision' <> '{}'::JSONB
      AND JSONB_TYPEOF("definitionSnapshot" -> 'rounding') = 'object'
      AND "definitionSnapshot" -> 'rounding' <> '{}'::JSONB
      AND JSONB_TYPEOF("definitionSnapshot" -> 'missingDataBehavior') = 'string'
      AND NULLIF(BTRIM("definitionSnapshot" ->> 'missingDataBehavior'), '') IS NOT NULL
      AND JSONB_TYPEOF("definitionSnapshot" -> 'testVectors') = 'array'
      AND JSONB_ARRAY_LENGTH("definitionSnapshot" -> 'testVectors') > 0
    )
  );

ALTER TABLE "AdipometryProtocol"
  ADD CONSTRAINT "AdipometryProtocol_id_code_version_key"
  UNIQUE ("id", "code", "version");

ALTER TABLE "AdipometryProtocol"
  ADD CONSTRAINT "AdipometryProtocol_identity_check" CHECK (
    NULLIF(BTRIM("code"), '') IS NOT NULL
    AND "version" > 0
    AND NULLIF(BTRIM("name"), '') IS NOT NULL
  );

CREATE OR REPLACE FUNCTION "protectApprovedAdipometryProtocol"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'APPROVED' THEN
    RAISE EXCEPTION 'Approved adipometry protocols are immutable; create a new version instead'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AdipometryProtocol_approved_immutable"
BEFORE UPDATE OR DELETE ON "AdipometryProtocol"
FOR EACH ROW
EXECUTE FUNCTION "protectApprovedAdipometryProtocol"();

-- The visual width is a minimum. PostgreSQL lpad truncates when the requested
-- width is shorter than the source, so the width must grow with the sequence.
CREATE OR REPLACE FUNCTION "formatAdipometryCode"(p_sequence INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
BEGIN
  IF p_sequence <= 0 THEN
    RAISE EXCEPTION 'Adipometry sequence must be a positive integer'
      USING ERRCODE = '22003';
  END IF;

  RETURN 'ADPT-' || LPAD(
    p_sequence::TEXT,
    GREATEST(3, LENGTH(p_sequence::TEXT)),
    '0'
  );
END;
$$;

CREATE OR REPLACE FUNCTION "createAdipometryDraft"(
  p_id TEXT,
  p_contract_id TEXT,
  p_aluno_id TEXT,
  p_professor_id TEXT,
  p_assessment_date TIMESTAMP(3),
  p_created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
) RETURNS TABLE("assessmentId" TEXT, "sequenceNumber" INTEGER, "code" TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_sequence INTEGER;
  v_code TEXT;
BEGIN
  INSERT INTO "AdipometrySequence" ("contractId", "alunoId", "lastValue", "updatedAt")
  VALUES (p_contract_id, p_aluno_id, 1, p_created_at)
  ON CONFLICT ("contractId", "alunoId")
  DO UPDATE SET
    "lastValue" = "AdipometrySequence"."lastValue" + 1,
    "updatedAt" = EXCLUDED."updatedAt"
  RETURNING "lastValue" INTO v_sequence;

  v_code := "formatAdipometryCode"(v_sequence);

  INSERT INTO "AdipometryAssessment" (
    "id", "contractId", "alunoId", "professorId", "sequenceNumber", "code",
    "assessmentDate", "status", "createdAt", "updatedAt"
  ) VALUES (
    p_id, p_contract_id, p_aluno_id, p_professor_id, v_sequence, v_code,
    p_assessment_date, 'DRAFT', p_created_at, p_created_at
  );

  RETURN QUERY SELECT p_id, v_sequence, v_code;
END;
$$;

ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_code_matches_sequence_check" CHECK (
    "code" = "formatAdipometryCode"("sequenceNumber")
  );
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_weight_positive_check"
  CHECK ("weightKg" IS NULL OR "weightKg" > 0);
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_skinfolds_positive_check" CHECK (
    ("tricepsMm" IS NULL OR "tricepsMm" > 0)
    AND ("subscapularMm" IS NULL OR "subscapularMm" > 0)
    AND ("suprailiacMm" IS NULL OR "suprailiacMm" > 0)
    AND ("abdominalMm" IS NULL OR "abdominalMm" > 0)
    AND ("thighMm" IS NULL OR "thighMm" > 0)
  );
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_body_fat_range_check" CHECK (
    "bodyFatPercentage" IS NULL
    OR ("bodyFatPercentage" >= 0 AND "bodyFatPercentage" <= 100)
  );
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_protocol_fields_check" CHECK (
    ("protocolId" IS NULL AND "protocolCode" IS NULL AND "protocolVersion" IS NULL)
    OR
    ("protocolId" IS NOT NULL AND NULLIF(BTRIM("protocolCode"), '') IS NOT NULL AND "protocolVersion" IS NOT NULL)
  );

ALTER TABLE "AdipometryAssessment"
  DROP CONSTRAINT "AdipometryAssessment_completion_check";
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_completion_check" CHECK (
    (
      "status" = 'DRAFT'
      AND "completedAt" IS NULL
      AND "skinfoldTotalMm" IS NULL
      AND "bodyFatPercentage" IS NULL
      AND "fatMassKg" IS NULL
      AND "leanMassKg" IS NULL
      AND "calculationSnapshot" IS NULL
    )
    OR
    (
      "status" = 'COMPLETED'
      AND "completedAt" IS NOT NULL
      AND "protocolId" IS NOT NULL
      AND "protocolCode" IS NOT NULL
      AND "protocolVersion" IS NOT NULL
      AND "weightKg" IS NOT NULL
      AND "tricepsMm" IS NOT NULL
      AND "subscapularMm" IS NOT NULL
      AND "suprailiacMm" IS NOT NULL
      AND "abdominalMm" IS NOT NULL
      AND "thighMm" IS NOT NULL
      AND "skinfoldTotalMm" IS NOT NULL
      AND "bodyFatPercentage" IS NOT NULL
      AND "fatMassKg" IS NOT NULL
      AND "leanMassKg" IS NOT NULL
      AND ABS(
        "skinfoldTotalMm"
        - ("tricepsMm" + "subscapularMm" + "suprailiacMm" + "abdominalMm" + "thighMm")
      ) <= 0.0001
      AND ABS(("fatMassKg" + "leanMassKg") - "weightKg") <= 0.02
      AND "calculationSnapshot" IS NOT NULL
      AND JSONB_TYPEOF("calculationSnapshot") = 'object'
      AND "calculationSnapshot" ?& ARRAY[
        'protocol',
        'assessmentDate',
        'ageAtAssessment',
        'profileCriteria',
        'inputs',
        'rules',
        'results',
        'implementationVersion',
        'calculatedAt'
      ]
      AND JSONB_TYPEOF("calculationSnapshot" -> 'protocol') = 'object'
      AND ("calculationSnapshot" -> 'protocol') ?& ARRAY['code', 'version']
      AND JSONB_TYPEOF("calculationSnapshot" #> '{protocol,code}') = 'string'
      AND JSONB_TYPEOF("calculationSnapshot" #> '{protocol,version}') = 'number'
      AND "calculationSnapshot" #>> '{protocol,code}' = "protocolCode"
      AND ("calculationSnapshot" #>> '{protocol,version}')::INTEGER = "protocolVersion"
      AND JSONB_TYPEOF("calculationSnapshot" -> 'assessmentDate') = 'string'
      AND "calculationSnapshot" ->> 'assessmentDate' = TO_CHAR("assessmentDate", 'YYYY-MM-DD')
      AND JSONB_TYPEOF("calculationSnapshot" -> 'ageAtAssessment') IN ('number', 'null')
      AND JSONB_TYPEOF("calculationSnapshot" -> 'profileCriteria') = 'object'
      AND JSONB_TYPEOF("calculationSnapshot" -> 'inputs') = 'object'
      AND ("calculationSnapshot" -> 'inputs') ?& ARRAY[
        'weightKg', 'tricepsMm', 'subscapularMm', 'suprailiacMm', 'abdominalMm', 'thighMm'
      ]
      AND JSONB_TYPEOF("calculationSnapshot" #> '{inputs,weightKg}') = 'number'
      AND JSONB_TYPEOF("calculationSnapshot" #> '{inputs,tricepsMm}') = 'number'
      AND JSONB_TYPEOF("calculationSnapshot" #> '{inputs,subscapularMm}') = 'number'
      AND JSONB_TYPEOF("calculationSnapshot" #> '{inputs,suprailiacMm}') = 'number'
      AND JSONB_TYPEOF("calculationSnapshot" #> '{inputs,abdominalMm}') = 'number'
      AND JSONB_TYPEOF("calculationSnapshot" #> '{inputs,thighMm}') = 'number'
      AND JSONB_TYPEOF("calculationSnapshot" -> 'rules') = 'object'
      AND ("calculationSnapshot" -> 'rules') ?& ARRAY['equations', 'limits', 'precision', 'rounding']
      AND JSONB_TYPEOF("calculationSnapshot" #> '{rules,equations}') = 'array'
      AND JSONB_ARRAY_LENGTH("calculationSnapshot" #> '{rules,equations}') > 0
      AND JSONB_TYPEOF("calculationSnapshot" #> '{rules,limits}') = 'object'
      AND JSONB_TYPEOF("calculationSnapshot" #> '{rules,precision}') = 'object'
      AND JSONB_TYPEOF("calculationSnapshot" #> '{rules,rounding}') = 'object'
      AND JSONB_TYPEOF("calculationSnapshot" -> 'results') = 'object'
      AND ("calculationSnapshot" -> 'results') ?& ARRAY[
        'skinfoldTotalMm', 'bodyFatPercentage', 'fatMassKg', 'leanMassKg'
      ]
      AND JSONB_TYPEOF("calculationSnapshot" #> '{results,skinfoldTotalMm}') = 'number'
      AND JSONB_TYPEOF("calculationSnapshot" #> '{results,bodyFatPercentage}') = 'number'
      AND JSONB_TYPEOF("calculationSnapshot" #> '{results,fatMassKg}') = 'number'
      AND JSONB_TYPEOF("calculationSnapshot" #> '{results,leanMassKg}') = 'number'
      AND JSONB_TYPEOF("calculationSnapshot" -> 'implementationVersion') = 'string'
      AND NULLIF(BTRIM("calculationSnapshot" ->> 'implementationVersion'), '') IS NOT NULL
      AND JSONB_TYPEOF("calculationSnapshot" -> 'calculatedAt') = 'string'
      AND NULLIF(BTRIM("calculationSnapshot" ->> 'calculatedAt'), '') IS NOT NULL
      AND ("calculationSnapshot" #>> '{inputs,weightKg}')::DECIMAL = "weightKg"
      AND ("calculationSnapshot" #>> '{inputs,tricepsMm}')::DECIMAL = "tricepsMm"
      AND ("calculationSnapshot" #>> '{inputs,subscapularMm}')::DECIMAL = "subscapularMm"
      AND ("calculationSnapshot" #>> '{inputs,suprailiacMm}')::DECIMAL = "suprailiacMm"
      AND ("calculationSnapshot" #>> '{inputs,abdominalMm}')::DECIMAL = "abdominalMm"
      AND ("calculationSnapshot" #>> '{inputs,thighMm}')::DECIMAL = "thighMm"
      AND ("calculationSnapshot" #>> '{results,skinfoldTotalMm}')::DECIMAL = "skinfoldTotalMm"
      AND ("calculationSnapshot" #>> '{results,bodyFatPercentage}')::DECIMAL = "bodyFatPercentage"
      AND ("calculationSnapshot" #>> '{results,fatMassKg}')::DECIMAL = "fatMassKg"
      AND ("calculationSnapshot" #>> '{results,leanMassKg}')::DECIMAL = "leanMassKg"
    )
  );

ALTER TABLE "AdipometryAssessment"
  DROP CONSTRAINT "AdipometryAssessment_correction_check";
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_correction_check" CHECK (
    (
      "correctsAssessmentId" IS NULL
      AND "correctionReason" IS NULL
      AND "correctionAuthorUserId" IS NULL
    )
    OR
    (
      "correctsAssessmentId" IS NOT NULL
      AND "status" = 'COMPLETED'
      AND NULLIF(BTRIM("correctionReason"), '') IS NOT NULL
      AND "correctionAuthorUserId" IS NOT NULL
    )
  );

-- Make tenant ownership part of every relationship that can otherwise combine
-- valid identifiers from different contracts or students.
ALTER TABLE "Aluno"
  ADD CONSTRAINT "Aluno_id_contractId_key" UNIQUE ("id", "contractId");
ALTER TABLE "Professor"
  ADD CONSTRAINT "Professor_id_contractId_key" UNIQUE ("id", "contractId");
ALTER TABLE "AnthropometryAssessment"
  ADD CONSTRAINT "AnthropometryAssessment_id_contractId_alunoId_key"
  UNIQUE ("id", "contractId", "alunoId");
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_id_contractId_alunoId_key"
  UNIQUE ("id", "contractId", "alunoId");

ALTER TABLE "AdipometrySequence"
  DROP CONSTRAINT "AdipometrySequence_alunoId_fkey";
ALTER TABLE "AdipometrySequence"
  ADD CONSTRAINT "AdipometrySequence_alunoId_contractId_fkey"
  FOREIGN KEY ("alunoId", "contractId")
  REFERENCES "Aluno"("id", "contractId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdipometryAssessment"
  DROP CONSTRAINT "AdipometryAssessment_alunoId_fkey";
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_alunoId_contractId_fkey"
  FOREIGN KEY ("alunoId", "contractId")
  REFERENCES "Aluno"("id", "contractId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdipometryAssessment"
  DROP CONSTRAINT "AdipometryAssessment_professorId_fkey";
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_professorId_contractId_fkey"
  FOREIGN KEY ("professorId", "contractId")
  REFERENCES "Professor"("id", "contractId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdipometryAssessment"
  DROP CONSTRAINT "AdipometryAssessment_protocolId_fkey";
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_protocol_identity_fkey"
  FOREIGN KEY ("protocolId", "protocolCode", "protocolVersion")
  REFERENCES "AdipometryProtocol"("id", "code", "version")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdipometryAssessment"
  DROP CONSTRAINT "AdipometryAssessment_anthropometryAssessmentId_contractId_fkey";
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_anthropometry_contract_aluno_fkey"
  FOREIGN KEY ("anthropometryAssessmentId", "contractId", "alunoId")
  REFERENCES "AnthropometryAssessment"("id", "contractId", "alunoId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdipometryAssessment"
  DROP CONSTRAINT "AdipometryAssessment_correctsAssessmentId_contractId_fkey";
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_corrects_contract_aluno_fkey"
  FOREIGN KEY ("correctsAssessmentId", "contractId", "alunoId")
  REFERENCES "AdipometryAssessment"("id", "contractId", "alunoId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdipometryAssessment"
  DROP CONSTRAINT "AdipometryAssessment_correctedByAssessmentId_contractId_fkey";
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_corrected_by_contract_aluno_fkey"
  FOREIGN KEY ("correctedByAssessmentId", "contractId", "alunoId")
  REFERENCES "AdipometryAssessment"("id", "contractId", "alunoId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdipometryAuditEvent"
  DROP CONSTRAINT "AdipometryAuditEvent_assessmentId_fkey";
ALTER TABLE "AdipometryAuditEvent"
  ADD CONSTRAINT "AdipometryAuditEvent_assessmentId_contractId_fkey"
  FOREIGN KEY ("assessmentId", "contractId")
  REFERENCES "AdipometryAssessment"("id", "contractId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdipometryAuditEvent"
  ADD CONSTRAINT "AdipometryAuditEvent_action_check" CHECK (
    "action" IN (
      'DRAFT_CREATED',
      'DRAFT_UPDATED',
      'COMPLETED',
      'CORRECTION_CREATED',
      'CORRECTION_LINKED'
    )
  );
ALTER TABLE "AdipometryAuditEvent"
  ADD CONSTRAINT "AdipometryAuditEvent_reason_check" CHECK (
    "action" NOT IN ('CORRECTION_CREATED', 'CORRECTION_LINKED')
    OR NULLIF(BTRIM("reason"), '') IS NOT NULL
  );

CREATE OR REPLACE FUNCTION "validateAdipometryAssessmentState"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_original "AdipometryAssessment"%ROWTYPE;
BEGIN
  IF NEW."status" = 'COMPLETED' AND NOT EXISTS (
    SELECT 1
    FROM "AdipometryProtocol" p
    WHERE p."id" = NEW."protocolId"
      AND p."code" = NEW."protocolCode"
      AND p."version" = NEW."protocolVersion"
      AND p."status" = 'APPROVED'
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_NOT_APPROVED'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."correctsAssessmentId" = NEW."id"
     OR NEW."correctedByAssessmentId" = NEW."id" THEN
    RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_SELF_REFERENCE'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' AND NEW."correctedByAssessmentId" IS NOT NULL THEN
    RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_LINK_IS_MANAGED'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."correctsAssessmentId" IS NOT NULL THEN
    SELECT * INTO v_original
    FROM "AdipometryAssessment"
    WHERE "id" = NEW."correctsAssessmentId"
    FOR UPDATE;

    IF NOT FOUND
       OR v_original."contractId" <> NEW."contractId"
       OR v_original."alunoId" <> NEW."alunoId"
       OR v_original."status" <> 'COMPLETED'
       OR v_original."correctedByAssessmentId" IS NOT NULL
    THEN
      RAISE EXCEPTION 'ADIPOMETRY_INVALID_CORRECTION_TARGET'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM "Professor" professor
      WHERE professor."userId" = NEW."correctionAuthorUserId"
        AND professor."contractId" = NEW."contractId"
    ) THEN
      RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_AUTHOR_CROSS_TENANT'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD."status" = 'COMPLETED'
     AND OLD."correctedByAssessmentId" IS NULL
     AND NEW."correctedByAssessmentId" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM "AdipometryAssessment" correction
       WHERE correction."id" = NEW."correctedByAssessmentId"
         AND correction."correctsAssessmentId" = OLD."id"
         AND correction."contractId" = OLD."contractId"
         AND correction."alunoId" = OLD."alunoId"
         AND correction."status" = 'COMPLETED'
     )
  THEN
    RAISE EXCEPTION 'ADIPOMETRY_INVALID_CORRECTION_LINK'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AdipometryAssessment_state_guard"
BEFORE INSERT OR UPDATE ON "AdipometryAssessment"
FOR EACH ROW
EXECUTE FUNCTION "validateAdipometryAssessmentState"();

CREATE OR REPLACE FUNCTION "validateAdipometryAuditEvent"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "Professor" professor
    WHERE professor."userId" = NEW."actorUserId"
      AND professor."contractId" = NEW."contractId"
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_AUDIT_ACTOR_CROSS_TENANT'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AdipometryAuditEvent_actor_guard"
BEFORE INSERT OR UPDATE ON "AdipometryAuditEvent"
FOR EACH ROW
EXECUTE FUNCTION "validateAdipometryAuditEvent"();

CREATE OR REPLACE FUNCTION "linkAdipometryCorrection"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF NEW."correctsAssessmentId" IS NULL
     OR (
       TG_OP = 'UPDATE'
       AND OLD."correctsAssessmentId" IS NOT DISTINCT FROM NEW."correctsAssessmentId"
     )
  THEN
    RETURN NEW;
  END IF;

  UPDATE "AdipometryAssessment"
  SET
    "correctedByAssessmentId" = NEW."id",
    "updatedAt" = GREATEST("updatedAt", NEW."createdAt")
  WHERE "id" = NEW."correctsAssessmentId"
    AND "contractId" = NEW."contractId"
    AND "alunoId" = NEW."alunoId"
    AND "status" = 'COMPLETED'
    AND "correctedByAssessmentId" IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_LINK_CONFLICT'
      USING ERRCODE = '40001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AdipometryAssessment_correction_link_after_write"
AFTER INSERT OR UPDATE ON "AdipometryAssessment"
FOR EACH ROW
EXECUTE FUNCTION "linkAdipometryCorrection"();

CREATE OR REPLACE FUNCTION "recordAdipometryAuditEvent"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor_user_id TEXT;
  v_action TEXT;
  v_reason TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."correctsAssessmentId" IS NOT NULL THEN
      v_action := 'CORRECTION_CREATED';
      v_actor_user_id := NEW."correctionAuthorUserId";
      v_reason := NEW."correctionReason";
    ELSIF NEW."status" = 'COMPLETED' THEN
      v_action := 'COMPLETED';
    ELSE
      v_action := 'DRAFT_CREATED';
    END IF;
  ELSIF OLD."correctsAssessmentId" IS NULL
        AND NEW."correctsAssessmentId" IS NOT NULL THEN
    v_action := 'CORRECTION_CREATED';
    v_actor_user_id := NEW."correctionAuthorUserId";
    v_reason := NEW."correctionReason";
  ELSIF OLD."status" = 'DRAFT' AND NEW."status" = 'COMPLETED' THEN
    v_action := 'COMPLETED';
  ELSIF OLD."status" = 'DRAFT' AND NEW."status" = 'DRAFT' THEN
    v_action := 'DRAFT_UPDATED';
  ELSIF OLD."status" = 'COMPLETED'
        AND OLD."correctedByAssessmentId" IS NULL
        AND NEW."correctedByAssessmentId" IS NOT NULL THEN
    v_action := 'CORRECTION_LINKED';
    SELECT correction."correctionAuthorUserId", correction."correctionReason"
      INTO v_actor_user_id, v_reason
    FROM "AdipometryAssessment" correction
    WHERE correction."id" = NEW."correctedByAssessmentId";
  ELSE
    RETURN NEW;
  END IF;

  IF v_actor_user_id IS NULL THEN
    SELECT professor."userId" INTO v_actor_user_id
    FROM "Professor" professor
    WHERE professor."id" = NEW."professorId";
  END IF;

  INSERT INTO "AdipometryAuditEvent" (
    "id",
    "contractId",
    "assessmentId",
    "actorUserId",
    "action",
    "reason",
    "beforeSnapshot",
    "afterSnapshot",
    "createdAt"
  ) VALUES (
    md5(
      random()::TEXT
      || clock_timestamp()::TEXT
      || NEW."id"
      || v_action
    ),
    NEW."contractId",
    NEW."id",
    v_actor_user_id,
    v_action,
    v_reason,
    CASE WHEN TG_OP = 'UPDATE' THEN TO_JSONB(OLD) ELSE NULL END,
    TO_JSONB(NEW),
    CURRENT_TIMESTAMP
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AdipometryAssessment_audit_after_insert"
AFTER INSERT ON "AdipometryAssessment"
FOR EACH ROW
EXECUTE FUNCTION "recordAdipometryAuditEvent"();

CREATE TRIGGER "AdipometryAssessment_audit_after_update"
AFTER UPDATE ON "AdipometryAssessment"
FOR EACH ROW
EXECUTE FUNCTION "recordAdipometryAuditEvent"();

CREATE OR REPLACE FUNCTION "protectAdipometryAuditEvent"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Adipometry audit events are append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "AdipometryAuditEvent_append_only"
BEFORE UPDATE OR DELETE ON "AdipometryAuditEvent"
FOR EACH ROW
EXECUTE FUNCTION "protectAdipometryAuditEvent"();

COMMIT;

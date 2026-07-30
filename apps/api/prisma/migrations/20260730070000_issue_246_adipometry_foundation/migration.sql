CREATE TYPE "AdipometryAssessmentStatus" AS ENUM ('DRAFT', 'COMPLETED');
CREATE TYPE "AdipometryProtocolStatus" AS ENUM ('DRAFT', 'APPROVED', 'DISABLED');
CREATE TYPE "AdipometryAuditAction" AS ENUM (
  'DRAFT_CREATED',
  'DRAFT_UPDATED',
  'COMPLETED',
  'CORRECTION_CREATED',
  'CORRECTION_VIEWED'
);

CREATE TABLE "AdipometryProtocolVersion" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "status" "AdipometryProtocolStatus" NOT NULL DEFAULT 'DRAFT',
  "reference" TEXT,
  "populationCriteria" JSONB,
  "requiredSkinfolds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "inputUnits" JSONB,
  "outputUnits" JSONB,
  "equations" JSONB,
  "limits" JSONB,
  "precisionRules" JSONB,
  "missingDataBehavior" TEXT NOT NULL,
  "testVectors" JSONB,
  "approvedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  "disabledReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdipometryProtocolVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdipometryProtocolVersion_approval_check" CHECK (
    "status" <> 'APPROVED'
    OR (
      NULLIF(BTRIM("reference"), '') IS NOT NULL
      AND "populationCriteria" IS NOT NULL
      AND CARDINALITY("requiredSkinfolds") > 0
      AND "inputUnits" IS NOT NULL
      AND "outputUnits" IS NOT NULL
      AND "equations" IS NOT NULL
      AND "limits" IS NOT NULL
      AND "precisionRules" IS NOT NULL
      AND NULLIF(BTRIM("missingDataBehavior"), '') IS NOT NULL
      AND "testVectors" IS NOT NULL
      AND JSONB_TYPEOF("testVectors") = 'array'
      AND JSONB_ARRAY_LENGTH("testVectors") > 0
      AND "approvedAt" IS NOT NULL
      AND NULLIF(BTRIM("approvedBy"), '') IS NOT NULL
    )
  ),
  CONSTRAINT "AdipometryProtocolVersion_disabled_reason_check" CHECK (
    "status" <> 'DISABLED' OR NULLIF(BTRIM("disabledReason"), '') IS NOT NULL
  )
);

CREATE TABLE "AdipometrySequence" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "lastValue" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdipometrySequence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdipometrySequence_lastValue_check" CHECK ("lastValue" >= 0)
);

CREATE TABLE "AdipometryAssessment" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "professorId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "sequenceNumber" INTEGER NOT NULL,
  "assessmentDate" TIMESTAMP(3) NOT NULL,
  "status" "AdipometryAssessmentStatus" NOT NULL DEFAULT 'DRAFT',
  "weightKg" DECIMAL(6,3),
  "tricepsMm" DECIMAL(6,2),
  "subscapularMm" DECIMAL(6,2),
  "suprailiacMm" DECIMAL(6,2),
  "abdominalMm" DECIMAL(6,2),
  "thighMm" DECIMAL(6,2),
  "sumSkinfoldsMm" DECIMAL(7,2),
  "bodyFatPercentage" DECIMAL(5,2),
  "fatMassKg" DECIMAL(7,3),
  "leanMassKg" DECIMAL(7,3),
  "protocolCode" TEXT,
  "protocolVersion" TEXT,
  "calculationSnapshot" JSONB,
  "supportAnthropometryId" TEXT,
  "notes" TEXT,
  "correctionOfId" TEXT,
  "correctionReason" TEXT,
  "correctedByProfessorId" TEXT,
  "correctedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdipometryAssessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdipometryAssessment_sequenceNumber_check" CHECK ("sequenceNumber" > 0),
  CONSTRAINT "AdipometryAssessment_code_check" CHECK (
    "code" = 'ADPT-' || LPAD("sequenceNumber"::TEXT, GREATEST(3, LENGTH("sequenceNumber"::TEXT)), '0')
  ),
  CONSTRAINT "AdipometryAssessment_weight_check" CHECK ("weightKg" IS NULL OR "weightKg" > 0),
  CONSTRAINT "AdipometryAssessment_triceps_check" CHECK ("tricepsMm" IS NULL OR "tricepsMm" > 0),
  CONSTRAINT "AdipometryAssessment_subscapular_check" CHECK ("subscapularMm" IS NULL OR "subscapularMm" > 0),
  CONSTRAINT "AdipometryAssessment_suprailiac_check" CHECK ("suprailiacMm" IS NULL OR "suprailiacMm" > 0),
  CONSTRAINT "AdipometryAssessment_abdominal_check" CHECK ("abdominalMm" IS NULL OR "abdominalMm" > 0),
  CONSTRAINT "AdipometryAssessment_thigh_check" CHECK ("thighMm" IS NULL OR "thighMm" > 0),
  CONSTRAINT "AdipometryAssessment_bodyFatPercentage_check" CHECK (
    "bodyFatPercentage" IS NULL OR ("bodyFatPercentage" >= 0 AND "bodyFatPercentage" <= 100)
  ),
  CONSTRAINT "AdipometryAssessment_protocol_pair_check" CHECK (
    ("protocolCode" IS NULL AND "protocolVersion" IS NULL)
    OR (NULLIF(BTRIM("protocolCode"), '') IS NOT NULL AND NULLIF(BTRIM("protocolVersion"), '') IS NOT NULL)
  ),
  CONSTRAINT "AdipometryAssessment_completion_check" CHECK (
    (
      "status" = 'DRAFT'
      AND "sumSkinfoldsMm" IS NULL
      AND "bodyFatPercentage" IS NULL
      AND "fatMassKg" IS NULL
      AND "leanMassKg" IS NULL
      AND "calculationSnapshot" IS NULL
    )
    OR
    (
      "status" = 'COMPLETED'
      AND "weightKg" IS NOT NULL
      AND "tricepsMm" IS NOT NULL
      AND "subscapularMm" IS NOT NULL
      AND "suprailiacMm" IS NOT NULL
      AND "abdominalMm" IS NOT NULL
      AND "thighMm" IS NOT NULL
      AND "sumSkinfoldsMm" IS NOT NULL
      AND "bodyFatPercentage" IS NOT NULL
      AND "fatMassKg" IS NOT NULL
      AND "leanMassKg" IS NOT NULL
      AND "protocolCode" IS NOT NULL
      AND "protocolVersion" IS NOT NULL
      AND "calculationSnapshot" IS NOT NULL
      AND JSONB_TYPEOF("calculationSnapshot") = 'object'
      AND "calculationSnapshot" ?& ARRAY[
        'schemaVersion', 'protocol', 'assessmentDate', 'ageAtAssessment',
        'profileCriteria', 'inputs', 'rules', 'intermediateValues', 'results'
      ]
      AND JSONB_TYPEOF("calculationSnapshot" -> 'schemaVersion') = 'number'
      AND ("calculationSnapshot" ->> 'schemaVersion')::INTEGER = 1
      AND JSONB_TYPEOF("calculationSnapshot" -> 'protocol') = 'object'
      AND ("calculationSnapshot" -> 'protocol') ?& ARRAY['code', 'version']
      AND JSONB_TYPEOF("calculationSnapshot" #> '{protocol,code}') = 'string'
      AND JSONB_TYPEOF("calculationSnapshot" #> '{protocol,version}') = 'string'
      AND "calculationSnapshot" #>> '{protocol,code}' = "protocolCode"
      AND "calculationSnapshot" #>> '{protocol,version}' = "protocolVersion"
      AND JSONB_TYPEOF("calculationSnapshot" -> 'assessmentDate') = 'string'
      AND "calculationSnapshot" ->> 'assessmentDate' = TO_CHAR("assessmentDate", 'YYYY-MM-DD')
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
      AND ("calculationSnapshot" #>> '{inputs,weightKg}')::DECIMAL = "weightKg"
      AND ("calculationSnapshot" #>> '{inputs,tricepsMm}')::DECIMAL = "tricepsMm"
      AND ("calculationSnapshot" #>> '{inputs,subscapularMm}')::DECIMAL = "subscapularMm"
      AND ("calculationSnapshot" #>> '{inputs,suprailiacMm}')::DECIMAL = "suprailiacMm"
      AND ("calculationSnapshot" #>> '{inputs,abdominalMm}')::DECIMAL = "abdominalMm"
      AND ("calculationSnapshot" #>> '{inputs,thighMm}')::DECIMAL = "thighMm"
      AND JSONB_TYPEOF("calculationSnapshot" -> 'rules') = 'object'
      AND ("calculationSnapshot" -> 'rules') ?& ARRAY['equations', 'limits', 'precision', 'rounding']
      AND JSONB_TYPEOF("calculationSnapshot" #> '{rules,equations}') = 'array'
      AND JSONB_TYPEOF("calculationSnapshot" #> '{rules,limits}') = 'object'
      AND JSONB_TYPEOF("calculationSnapshot" #> '{rules,precision}') = 'object'
      AND JSONB_TYPEOF("calculationSnapshot" #> '{rules,rounding}') = 'object'
      AND JSONB_TYPEOF("calculationSnapshot" -> 'intermediateValues') = 'object'
      AND JSONB_TYPEOF("calculationSnapshot" -> 'results') = 'object'
      AND ("calculationSnapshot" -> 'results') ?& ARRAY[
        'sumSkinfoldsMm', 'bodyFatPercentage', 'fatMassKg', 'leanMassKg'
      ]
      AND JSONB_TYPEOF("calculationSnapshot" #> '{results,sumSkinfoldsMm}') = 'number'
      AND JSONB_TYPEOF("calculationSnapshot" #> '{results,bodyFatPercentage}') = 'number'
      AND JSONB_TYPEOF("calculationSnapshot" #> '{results,fatMassKg}') = 'number'
      AND JSONB_TYPEOF("calculationSnapshot" #> '{results,leanMassKg}') = 'number'
      AND ("calculationSnapshot" #>> '{results,sumSkinfoldsMm}')::DECIMAL = "sumSkinfoldsMm"
      AND ("calculationSnapshot" #>> '{results,bodyFatPercentage}')::DECIMAL = "bodyFatPercentage"
      AND ("calculationSnapshot" #>> '{results,fatMassKg}')::DECIMAL = "fatMassKg"
      AND ("calculationSnapshot" #>> '{results,leanMassKg}')::DECIMAL = "leanMassKg"
      AND "sumSkinfoldsMm" = "tricepsMm" + "subscapularMm" + "suprailiacMm" + "abdominalMm" + "thighMm"
      AND ABS(("fatMassKg" + "leanMassKg") - "weightKg") <= 0.02
    )
  ),
  CONSTRAINT "AdipometryAssessment_correction_check" CHECK (
    (
      "correctionOfId" IS NULL
      AND "correctionReason" IS NULL
      AND "correctedByProfessorId" IS NULL
      AND "correctedAt" IS NULL
    )
    OR
    (
      "correctionOfId" IS NOT NULL
      AND "status" = 'COMPLETED'
      AND NULLIF(BTRIM("correctionReason"), '') IS NOT NULL
      AND "correctedByProfessorId" IS NOT NULL
      AND "correctedAt" IS NOT NULL
    )
  )
);

CREATE TABLE "AdipometryAuditLog" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "actorProfessorId" TEXT NOT NULL,
  "action" "AdipometryAuditAction" NOT NULL,
  "reason" TEXT,
  "beforeSnapshot" JSONB,
  "afterSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdipometryAuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdipometryAuditLog_correction_reason_check" CHECK (
    "action" <> 'CORRECTION_CREATED' OR NULLIF(BTRIM("reason"), '') IS NOT NULL
  )
);

CREATE UNIQUE INDEX "AdipometryProtocolVersion_code_version_key"
  ON "AdipometryProtocolVersion"("code", "version");
CREATE INDEX "AdipometryProtocolVersion_status_code_idx"
  ON "AdipometryProtocolVersion"("status", "code");

CREATE UNIQUE INDEX "AdipometrySequence_contractId_alunoId_key"
  ON "AdipometrySequence"("contractId", "alunoId");
CREATE INDEX "AdipometrySequence_alunoId_idx"
  ON "AdipometrySequence"("alunoId");

CREATE UNIQUE INDEX "AdipometryAssessment_contractId_alunoId_code_key"
  ON "AdipometryAssessment"("contractId", "alunoId", "code");
CREATE UNIQUE INDEX "AdipometryAssessment_contractId_alunoId_sequenceNumber_key"
  ON "AdipometryAssessment"("contractId", "alunoId", "sequenceNumber");
CREATE UNIQUE INDEX "AdipometryAssessment_correctionOfId_key"
  ON "AdipometryAssessment"("correctionOfId");
CREATE INDEX "AdipometryAssessment_contractId_alunoId_assessmentDate_idx"
  ON "AdipometryAssessment"("contractId", "alunoId", "assessmentDate");
CREATE INDEX "AdipometryAssessment_contractId_alunoId_status_assessmentDate_idx"
  ON "AdipometryAssessment"("contractId", "alunoId", "status", "assessmentDate");
CREATE INDEX "AdipometryAssessment_professorId_idx"
  ON "AdipometryAssessment"("professorId");
CREATE INDEX "AdipometryAssessment_protocolCode_protocolVersion_idx"
  ON "AdipometryAssessment"("protocolCode", "protocolVersion");
CREATE INDEX "AdipometryAssessment_supportAnthropometryId_idx"
  ON "AdipometryAssessment"("supportAnthropometryId");
CREATE INDEX "AdipometryAssessment_correctedByProfessorId_idx"
  ON "AdipometryAssessment"("correctedByProfessorId");

CREATE INDEX "AdipometryAuditLog_contractId_assessmentId_createdAt_idx"
  ON "AdipometryAuditLog"("contractId", "assessmentId", "createdAt");
CREATE INDEX "AdipometryAuditLog_actorProfessorId_createdAt_idx"
  ON "AdipometryAuditLog"("actorProfessorId", "createdAt");

ALTER TABLE "AdipometrySequence"
  ADD CONSTRAINT "AdipometrySequence_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdipometrySequence"
  ADD CONSTRAINT "AdipometrySequence_alunoId_fkey"
  FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_alunoId_fkey"
  FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_professorId_fkey"
  FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_protocolCode_protocolVersion_fkey"
  FOREIGN KEY ("protocolCode", "protocolVersion") REFERENCES "AdipometryProtocolVersion"("code", "version") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_supportAnthropometryId_fkey"
  FOREIGN KEY ("supportAnthropometryId") REFERENCES "AnthropometryAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_correctionOfId_fkey"
  FOREIGN KEY ("correctionOfId") REFERENCES "AdipometryAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_correctedByProfessorId_fkey"
  FOREIGN KEY ("correctedByProfessorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdipometryAuditLog"
  ADD CONSTRAINT "AdipometryAuditLog_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdipometryAuditLog"
  ADD CONSTRAINT "AdipometryAuditLog_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "AdipometryAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdipometryAuditLog"
  ADD CONSTRAINT "AdipometryAuditLog_actorProfessorId_fkey"
  FOREIGN KEY ("actorProfessorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "AdipometryProtocolVersion" (
  "id", "code", "name", "version", "status", "missingDataBehavior", "disabledReason", "createdAt", "updatedAt"
) VALUES
  (
    'adpt-protocol-guedes-adult-0-1-draft',
    'GUEDES-ADULT',
    'Guedes para adultos',
    '0.1-draft',
    'DRAFT',
    'Permitir rascunho e bloquear cálculo conclusivo e finalização até aprovação clínica.',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'adpt-protocol-slaughter-0-1-disabled',
    'SLAUGHTER',
    'Slaughter',
    '0.1-disabled',
    'DISABLED',
    'Não oferecer o protocolo e bloquear chamadas diretas.',
    'Variantes, critérios, equações, mapeamento de dobras e vetores incompletos.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

CREATE OR REPLACE FUNCTION reserve_adipometry_code(p_contract_id TEXT, p_aluno_id TEXT)
RETURNS TABLE("sequenceNumber" INTEGER, "code" TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_sequence INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "Aluno"
    WHERE "id" = p_aluno_id AND "contractId" = p_contract_id
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_TENANT_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO "AdipometrySequence" (
    "id", "contractId", "alunoId", "lastValue", "createdAt", "updatedAt"
  )
  VALUES (
    md5(random()::TEXT || clock_timestamp()::TEXT || p_contract_id || p_aluno_id),
    p_contract_id,
    p_aluno_id,
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("contractId", "alunoId")
  DO UPDATE SET
    "lastValue" = "AdipometrySequence"."lastValue" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
  RETURNING "lastValue" INTO v_sequence;

  RETURN QUERY
  SELECT
    v_sequence,
    'ADPT-' || LPAD(v_sequence::TEXT, GREATEST(3, LENGTH(v_sequence::TEXT)), '0');
END;
$$;

CREATE OR REPLACE FUNCTION validate_adipometry_tenant_links()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_original "AdipometryAssessment"%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Aluno"
    WHERE "id" = NEW."alunoId" AND "contractId" = NEW."contractId"
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_ALUNO_CROSS_TENANT'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "Professor"
    WHERE "id" = NEW."professorId" AND "contractId" = NEW."contractId"
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROFESSOR_CROSS_TENANT'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."correctedByProfessorId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Professor"
    WHERE "id" = NEW."correctedByProfessorId" AND "contractId" = NEW."contractId"
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_CORRECTOR_CROSS_TENANT'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."supportAnthropometryId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "AnthropometryAssessment"
    WHERE "id" = NEW."supportAnthropometryId"
      AND "contractId" = NEW."contractId"
      AND "alunoId" = NEW."alunoId"
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_ANTHROPOMETRY_REFERENCE_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."status" = 'COMPLETED' AND NOT EXISTS (
    SELECT 1 FROM "AdipometryProtocolVersion"
    WHERE "code" = NEW."protocolCode"
      AND "version" = NEW."protocolVersion"
      AND "status" = 'APPROVED'
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_NOT_APPROVED'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."correctionOfId" IS NOT NULL THEN
    SELECT * INTO v_original
    FROM "AdipometryAssessment"
    WHERE "id" = NEW."correctionOfId";

    IF NOT FOUND
      OR v_original."contractId" <> NEW."contractId"
      OR v_original."alunoId" <> NEW."alunoId"
      OR v_original."status" <> 'COMPLETED'
    THEN
      RAISE EXCEPTION 'ADIPOMETRY_INVALID_CORRECTION_TARGET'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_adipometry_sequence_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Aluno"
    WHERE "id" = NEW."alunoId" AND "contractId" = NEW."contractId"
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_SEQUENCE_CROSS_TENANT'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_adipometry_audit_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AdipometryAssessment"
    WHERE "id" = NEW."assessmentId" AND "contractId" = NEW."contractId"
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_AUDIT_ASSESSMENT_CROSS_TENANT'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "Professor"
    WHERE "id" = NEW."actorProfessorId" AND "contractId" = NEW."contractId"
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_AUDIT_ACTOR_CROSS_TENANT'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_approved_adipometry_protocol_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'APPROVED' THEN
    RAISE EXCEPTION 'ADIPOMETRY_APPROVED_PROTOCOL_IMMUTABLE'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_completed_adipometry_assessment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'COMPLETED' THEN
    RAISE EXCEPTION 'ADIPOMETRY_COMPLETED_IMMUTABLE'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AdipometryProtocolVersion_approved_guard"
BEFORE UPDATE OR DELETE ON "AdipometryProtocolVersion"
FOR EACH ROW EXECUTE FUNCTION protect_approved_adipometry_protocol_version();

CREATE TRIGGER "AdipometryAssessment_tenant_guard"
BEFORE INSERT OR UPDATE ON "AdipometryAssessment"
FOR EACH ROW EXECUTE FUNCTION validate_adipometry_tenant_links();

CREATE TRIGGER "AdipometrySequence_tenant_guard"
BEFORE INSERT OR UPDATE ON "AdipometrySequence"
FOR EACH ROW EXECUTE FUNCTION validate_adipometry_sequence_tenant();

CREATE TRIGGER "AdipometryAuditLog_tenant_guard"
BEFORE INSERT OR UPDATE ON "AdipometryAuditLog"
FOR EACH ROW EXECUTE FUNCTION validate_adipometry_audit_tenant();

CREATE TRIGGER "AdipometryAssessment_completed_update_guard"
BEFORE UPDATE ON "AdipometryAssessment"
FOR EACH ROW EXECUTE FUNCTION protect_completed_adipometry_assessment();

CREATE TRIGGER "AdipometryAssessment_completed_delete_guard"
BEFORE DELETE ON "AdipometryAssessment"
FOR EACH ROW EXECUTE FUNCTION protect_completed_adipometry_assessment();

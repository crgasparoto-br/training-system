BEGIN;

-- Issue #246: complete the canonical revision lifecycle without changing the
-- validated calculation pipeline. `status` remains the technical write state
-- (DRAFT/COMPLETED); `revisionStatus` is the business lifecycle authority.
ALTER TABLE "AdipometryAssessment"
  ADD COLUMN "revisionStatus" TEXT,
  ADD COLUMN "rootAssessmentId" TEXT,
  ADD COLUMN "revisionNumber" INTEGER,
  ADD COLUMN "previousRevisionId" TEXT,
  ADD COLUMN "correctionCategory" TEXT,
  ADD COLUMN "correctionStartedAt" TIMESTAMP(3),
  ADD COLUMN "correctionCancelledAt" TIMESTAMP(3),
  ADD COLUMN "correctionCancelledByUserId" TEXT,
  ADD COLUMN "correctionCancellationReason" TEXT,
  ADD COLUMN "protocolChangeConfirmedByUserId" TEXT,
  ADD COLUMN "protocolChangeConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidedByUserId" TEXT,
  ADD COLUMN "voidReason" TEXT,
  ADD COLUMN "beforeSnapshot" JSONB,
  ADD COLUMN "afterSnapshot" JSONB,
  ADD COLUMN "changedFields" JSONB;

ALTER TABLE "AdipometryAssessment" DISABLE TRIGGER USER;

CREATE OR REPLACE FUNCTION "adipometryChangedFields"(
  p_before JSONB,
  p_after JSONB
) RETURNS JSONB
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT COALESCE(JSONB_AGG(field ORDER BY field), '[]'::JSONB)
  FROM (
    SELECT key AS field
    FROM JSONB_OBJECT_KEYS(
      COALESCE(p_before, '{}'::JSONB) || COALESCE(p_after, '{}'::JSONB)
    ) key
    WHERE key = ANY(ARRAY[
      'assessmentDate', 'weightKg', 'tricepsMm', 'subscapularMm',
      'suprailiacMm', 'abdominalMm', 'thighMm', 'protocolId',
      'protocolCode', 'protocolVersion', 'protocolSex', 'profileSexSnapshot',
      'protocolSexSource', 'protocolSexOverrideReason',
      'anthropometryAssessmentId', 'notes', 'skinfoldTotalMm',
      'bodyFatPercentage', 'fatMassKg', 'leanMassKg'
    ])
      AND COALESCE(p_before -> key, 'null'::JSONB)
          IS DISTINCT FROM COALESCE(p_after -> key, 'null'::JSONB)
  ) changed;
$$;

WITH RECURSIVE revision_chain AS (
  SELECT
    assessment.id,
    assessment.id AS root_id,
    1 AS revision_number
  FROM "AdipometryAssessment" assessment
  WHERE assessment."correctsAssessmentId" IS NULL

  UNION ALL

  SELECT
    child.id,
    parent.root_id,
    parent.revision_number + 1
  FROM "AdipometryAssessment" child
  JOIN revision_chain parent
    ON child."correctsAssessmentId" = parent.id
)
UPDATE "AdipometryAssessment" assessment
SET
  "rootAssessmentId" = chain.root_id,
  "revisionNumber" = chain.revision_number,
  "previousRevisionId" = assessment."correctsAssessmentId",
  "revisionStatus" = CASE
    WHEN assessment.status = 'DRAFT' THEN 'DRAFT'
    WHEN assessment."correctedByAssessmentId" IS NOT NULL THEN 'SUPERSEDED'
    ELSE 'FINALIZED'
  END,
  "correctionCategory" = CASE
    WHEN assessment."correctsAssessmentId" IS NOT NULL
      THEN 'MEASUREMENT_OR_TRANSCRIPTION_ERROR'
    ELSE NULL
  END,
  "correctionStartedAt" = CASE
    WHEN assessment."correctsAssessmentId" IS NOT NULL
      THEN assessment."createdAt"
    ELSE NULL
  END,
  "beforeSnapshot" = CASE
    WHEN assessment."correctsAssessmentId" IS NOT NULL THEN (
      SELECT TO_JSONB(parent)
      FROM "AdipometryAssessment" parent
      WHERE parent.id = assessment."correctsAssessmentId"
    )
    ELSE NULL
  END,
  "afterSnapshot" = CASE
    WHEN assessment."correctsAssessmentId" IS NOT NULL
         AND assessment.status = 'COMPLETED'
      THEN TO_JSONB(assessment)
    ELSE NULL
  END
FROM revision_chain chain
WHERE chain.id = assessment.id;

UPDATE "AdipometryAssessment" assessment
SET "changedFields" = "adipometryChangedFields"(
  assessment."beforeSnapshot",
  assessment."afterSnapshot"
)
WHERE assessment."beforeSnapshot" IS NOT NULL
  AND assessment."afterSnapshot" IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "AdipometryAssessment"
    WHERE "rootAssessmentId" IS NULL OR "revisionNumber" IS NULL OR "revisionStatus" IS NULL
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_REVISION_BACKFILL_INCOMPLETE';
  END IF;
END;
$$;

ALTER TABLE "AdipometryAssessment"
  ALTER COLUMN "revisionStatus" SET NOT NULL,
  ALTER COLUMN "revisionStatus" SET DEFAULT 'DRAFT',
  ALTER COLUMN "rootAssessmentId" SET NOT NULL,
  ALTER COLUMN "revisionNumber" SET NOT NULL,
  ALTER COLUMN "revisionNumber" SET DEFAULT 1;

DROP INDEX IF EXISTS "AdipometryAssessment_contractId_alunoId_sequenceNumber_key";
DROP INDEX IF EXISTS "AdipometryAssessment_contractId_alunoId_code_key";
DROP INDEX IF EXISTS "AdipometryAssessment_correctsAssessmentId_key";
DROP INDEX IF EXISTS "AdptAssess_corrects_contract_aluno_key";

CREATE UNIQUE INDEX "AdipometryAssessment_contractId_alunoId_sequenceNumber_key"
  ON "AdipometryAssessment"("contractId", "alunoId", "sequenceNumber")
  WHERE "revisionNumber" = 1;
CREATE UNIQUE INDEX "AdipometryAssessment_contractId_alunoId_code_key"
  ON "AdipometryAssessment"("contractId", "alunoId", "code")
  WHERE "revisionNumber" = 1;
CREATE INDEX "AdipometryAssessment_contractId_alunoId_sequenceNumber_idx"
  ON "AdipometryAssessment"("contractId", "alunoId", "sequenceNumber");
CREATE INDEX "AdipometryAssessment_contractId_alunoId_code_idx"
  ON "AdipometryAssessment"("contractId", "alunoId", "code");
CREATE INDEX "AdptAssess_corrects_contract_aluno_idx"
  ON "AdipometryAssessment"("correctsAssessmentId", "contractId", "alunoId");
CREATE UNIQUE INDEX "AdipometryAssessment_root_revision_key"
  ON "AdipometryAssessment"("rootAssessmentId", "revisionNumber");
CREATE UNIQUE INDEX "AdipometryAssessment_one_open_correction_key"
  ON "AdipometryAssessment"("rootAssessmentId")
  WHERE "revisionStatus" = 'DRAFT' AND "revisionNumber" > 1;
CREATE UNIQUE INDEX "AdipometryAssessment_one_finalized_successor_key"
  ON "AdipometryAssessment"("previousRevisionId")
  WHERE "revisionStatus" = 'FINALIZED';
CREATE INDEX "AdipometryAssessment_revision_history_idx"
  ON "AdipometryAssessment"(
    "contractId", "alunoId", "rootAssessmentId", "revisionNumber" DESC
  );
CREATE INDEX "AdipometryAssessment_revision_status_idx"
  ON "AdipometryAssessment"("contractId", "revisionStatus", "assessmentDate" DESC);

ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_root_contract_aluno_fkey"
  FOREIGN KEY ("rootAssessmentId", "contractId", "alunoId")
  REFERENCES "AdipometryAssessment"("id", "contractId", "alunoId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_previous_contract_aluno_fkey"
  FOREIGN KEY ("previousRevisionId", "contractId", "alunoId")
  REFERENCES "AdipometryAssessment"("id", "contractId", "alunoId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_correctionCancelledByUserId_fkey"
  FOREIGN KEY ("correctionCancelledByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_protocolChangeConfirmedByUserId_fkey"
  FOREIGN KEY ("protocolChangeConfirmedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_voidedByUserId_fkey"
  FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_revision_status_check" CHECK (
    "revisionStatus" IN ('DRAFT', 'FINALIZED', 'SUPERSEDED', 'CANCELLED', 'VOIDED')
  ),
  ADD CONSTRAINT "AdipometryAssessment_revision_number_check" CHECK (
    "revisionNumber" > 0
  ),
  ADD CONSTRAINT "AdipometryAssessment_revision_identity_check" CHECK (
    (
      "revisionNumber" = 1
      AND "rootAssessmentId" = id
      AND "previousRevisionId" IS NULL
      AND "correctsAssessmentId" IS NULL
    )
    OR
    (
      "revisionNumber" > 1
      AND "rootAssessmentId" <> id
      AND "previousRevisionId" IS NOT NULL
      AND "correctsAssessmentId" = "previousRevisionId"
    )
  ),
  ADD CONSTRAINT "AdipometryAssessment_revision_operational_status_check" CHECK (
    ("revisionStatus" IN ('DRAFT', 'CANCELLED') AND status = 'DRAFT')
    OR
    ("revisionStatus" IN ('FINALIZED', 'SUPERSEDED', 'VOIDED') AND status = 'COMPLETED')
  ),
  ADD CONSTRAINT "AdipometryAssessment_correction_category_check" CHECK (
    "correctionCategory" IS NULL OR "correctionCategory" IN (
      'MEASUREMENT_OR_TRANSCRIPTION_ERROR',
      'PROTOCOL_SELECTION_ERROR',
      'DEMOGRAPHIC_CONFIRMATION_ERROR',
      'OTHER'
    )
  ),
  ADD CONSTRAINT "AdipometryAssessment_correction_cancellation_check" CHECK (
    (
      "revisionStatus" <> 'CANCELLED'
      AND "correctionCancelledAt" IS NULL
      AND "correctionCancelledByUserId" IS NULL
      AND "correctionCancellationReason" IS NULL
    )
    OR
    (
      "revisionStatus" = 'CANCELLED'
      AND "revisionNumber" > 1
      AND "correctionCancelledAt" IS NOT NULL
      AND "correctionCancelledByUserId" IS NOT NULL
      AND NULLIF(BTRIM("correctionCancellationReason"), '') IS NOT NULL
    )
  ),
  ADD CONSTRAINT "AdipometryAssessment_void_check" CHECK (
    (
      "revisionStatus" <> 'VOIDED'
      AND "voidedAt" IS NULL
      AND "voidedByUserId" IS NULL
      AND "voidReason" IS NULL
    )
    OR
    (
      "revisionStatus" = 'VOIDED'
      AND "voidedAt" IS NOT NULL
      AND "voidedByUserId" IS NOT NULL
      AND NULLIF(BTRIM("voidReason"), '') IS NOT NULL
      AND "correctedByAssessmentId" IS NULL
    )
  ),
  ADD CONSTRAINT "AdipometryAssessment_protocol_change_confirmation_check" CHECK (
    (
      "protocolChangeConfirmedByUserId" IS NULL
      AND "protocolChangeConfirmedAt" IS NULL
    )
    OR
    (
      "protocolChangeConfirmedByUserId" IS NOT NULL
      AND "protocolChangeConfirmedAt" IS NOT NULL
      AND "correctionCategory" = 'PROTOCOL_SELECTION_ERROR'
      AND "revisionNumber" > 1
    )
  ),
  ADD CONSTRAINT "AdipometryAssessment_current_revision_check" CHECK (
    ("revisionStatus" = 'SUPERSEDED' AND "correctedByAssessmentId" IS NOT NULL)
    OR
    ("revisionStatus" <> 'SUPERSEDED' AND "correctedByAssessmentId" IS NULL)
  );

ALTER TABLE "AdipometryAssessment"
  DROP CONSTRAINT "AdipometryAssessment_correction_check";
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_correction_check" CHECK (
    (
      "revisionNumber" = 1
      AND "correctionReason" IS NULL
      AND "correctionAuthorUserId" IS NULL
      AND "correctionCategory" IS NULL
      AND "correctionStartedAt" IS NULL
      AND "beforeSnapshot" IS NULL
      AND "afterSnapshot" IS NULL
      AND "changedFields" IS NULL
    )
    OR
    (
      "revisionNumber" > 1
      AND NULLIF(BTRIM("correctionReason"), '') IS NOT NULL
      AND "correctionAuthorUserId" IS NOT NULL
      AND "correctionCategory" IS NOT NULL
      AND "correctionStartedAt" IS NOT NULL
      AND JSONB_TYPEOF("beforeSnapshot") = 'object'
      AND (
        "revisionStatus" IN ('DRAFT', 'CANCELLED')
        OR (
          "revisionStatus" IN ('FINALIZED', 'SUPERSEDED', 'VOIDED')
          AND JSONB_TYPEOF("afterSnapshot") = 'object'
          AND JSONB_TYPEOF("changedFields") = 'array'
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION "allocateAdipometryAssessmentIdentity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_sequence INTEGER;
  v_parent "AdipometryAssessment"%ROWTYPE;
  v_next_revision INTEGER;
BEGIN
  IF NEW."correctsAssessmentId" IS NOT NULL OR NEW."previousRevisionId" IS NOT NULL THEN
    SELECT * INTO v_parent
    FROM "AdipometryAssessment"
    WHERE id = COALESCE(NEW."previousRevisionId", NEW."correctsAssessmentId")
    FOR UPDATE;

    IF NOT FOUND
       OR v_parent."contractId" <> NEW."contractId"
       OR v_parent."alunoId" <> NEW."alunoId"
       OR v_parent."revisionStatus" <> 'FINALIZED'
       OR v_parent."correctedByAssessmentId" IS NOT NULL THEN
      RAISE EXCEPTION 'ADIPOMETRY_INVALID_CORRECTION_TARGET' USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(MAX(assessment."revisionNumber"), 1) + 1
      INTO v_next_revision
    FROM "AdipometryAssessment" assessment
    WHERE assessment."rootAssessmentId" = v_parent."rootAssessmentId";

    NEW."sequenceNumber" := v_parent."sequenceNumber";
    NEW.code := v_parent.code;
    NEW."rootAssessmentId" := v_parent."rootAssessmentId";
    NEW."revisionNumber" := v_next_revision;
    NEW."previousRevisionId" := v_parent.id;
    NEW."correctsAssessmentId" := v_parent.id;
    NEW."revisionStatus" := CASE
      WHEN NEW.status = 'COMPLETED' THEN 'FINALIZED'
      ELSE 'DRAFT'
    END;
    RETURN NEW;
  END IF;

  INSERT INTO "AdipometrySequence" ("contractId", "alunoId", "lastValue", "updatedAt")
  VALUES (NEW."contractId", NEW."alunoId", 1, COALESCE(NEW."createdAt", CURRENT_TIMESTAMP))
  ON CONFLICT ("contractId", "alunoId")
  DO UPDATE SET
    "lastValue" = "AdipometrySequence"."lastValue" + 1,
    "updatedAt" = EXCLUDED."updatedAt"
  RETURNING "lastValue" INTO v_sequence;

  NEW."sequenceNumber" := v_sequence;
  NEW.code := "formatAdipometryCode"(v_sequence);
  NEW."rootAssessmentId" := NEW.id;
  NEW."revisionNumber" := 1;
  NEW."previousRevisionId" := NULL;
  NEW."revisionStatus" := CASE
    WHEN NEW.status = 'COMPLETED' THEN 'FINALIZED'
    ELSE 'DRAFT'
  END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "protectCompletedAdipometryAssessment"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_clinical_before JSONB;
  v_clinical_after JSONB;
BEGIN
  IF OLD.status <> 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  v_clinical_before := TO_JSONB(OLD) - ARRAY[
    'revisionStatus', 'correctedByAssessmentId', 'updatedAt',
    'voidedAt', 'voidedByUserId', 'voidReason'
  ];
  v_clinical_after := TO_JSONB(NEW) - ARRAY[
    'revisionStatus', 'correctedByAssessmentId', 'updatedAt',
    'voidedAt', 'voidedByUserId', 'voidReason'
  ];

  IF v_clinical_after IS DISTINCT FROM v_clinical_before THEN
    RAISE EXCEPTION 'Completed adipometry assessments are immutable; create an audited correction instead'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."revisionStatus" = 'FINALIZED'
     AND NEW."revisionStatus" = 'SUPERSEDED'
     AND OLD."correctedByAssessmentId" IS NULL
     AND NEW."correctedByAssessmentId" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF OLD."revisionStatus" = 'FINALIZED'
     AND NEW."revisionStatus" = 'VOIDED'
     AND OLD."correctedByAssessmentId" IS NULL
     AND NEW."correctedByAssessmentId" IS NULL
     AND NEW."voidedAt" IS NOT NULL
     AND NEW."voidedByUserId" IS NOT NULL
     AND NULLIF(BTRIM(NEW."voidReason"), '') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Completed adipometry assessments are immutable; create an audited correction instead'
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION "preventCompletedAdipometryDeletion"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."revisionStatus" <> 'DRAFT' OR OLD."revisionNumber" > 1 THEN
    RAISE EXCEPTION 'Historical adipometry revisions cannot be physically deleted'
      USING ERRCODE = '55000';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION "validateAdipometryAssessmentState"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_previous "AdipometryAssessment"%ROWTYPE;
  v_actor_user_id TEXT;
  v_before JSONB;
  v_after JSONB;
  v_protocol_changed BOOLEAN;
  v_is_editable_correction BOOLEAN;
  v_is_completion_transition BOOLEAN;
BEGIN
  v_actor_user_id := "requireAdipometryActorUserId"(NEW."contractId", NEW."professorId");
  v_is_editable_correction := NEW."revisionNumber" > 1 AND (
    TG_OP = 'INSERT'
    OR (TG_OP = 'UPDATE' AND OLD.status = 'DRAFT')
  );
  v_is_completion_transition := NEW.status = 'COMPLETED' AND (
    TG_OP = 'INSERT'
    OR (TG_OP = 'UPDATE' AND OLD.status = 'DRAFT')
  );

  IF NEW.status = 'COMPLETED' AND NOT EXISTS (
    SELECT 1
    FROM "AdipometryProtocolApproval" approval
    JOIN "AdipometryProtocol" protocol
      ON protocol.id = approval."protocolId"
     AND protocol.code = approval."protocolCode"
     AND protocol.version = approval."protocolVersion"
    WHERE approval."contractId" = NEW."contractId"
      AND approval."protocolId" = NEW."protocolId"
      AND approval."protocolCode" = NEW."protocolCode"
      AND approval."protocolVersion" = NEW."protocolVersion"
      AND protocol.status <> 'DISABLED'
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_NOT_APPROVED_FOR_CONTRACT' USING ERRCODE = '23514';
  END IF;

  IF NEW."rootAssessmentId" = NEW.id AND NEW."revisionNumber" <> 1 THEN
    RAISE EXCEPTION 'ADIPOMETRY_REVISION_ROOT_INVALID' USING ERRCODE = '23514';
  END IF;

  IF v_is_editable_correction THEN
    SELECT * INTO v_previous
    FROM "AdipometryAssessment"
    WHERE id = NEW."previousRevisionId"
    FOR UPDATE;

    IF NOT FOUND
       OR v_previous."contractId" <> NEW."contractId"
       OR v_previous."alunoId" <> NEW."alunoId"
       OR v_previous."rootAssessmentId" <> NEW."rootAssessmentId"
       OR v_previous."revisionStatus" <> 'FINALIZED'
       OR v_previous."correctedByAssessmentId" IS NOT NULL THEN
      RAISE EXCEPTION 'ADIPOMETRY_INVALID_CORRECTION_TARGET' USING ERRCODE = '23514';
    END IF;

    IF NEW."correctionAuthorUserId" IS DISTINCT FROM v_actor_user_id THEN
      RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_ACTOR_MISMATCH' USING ERRCODE = '42501';
    END IF;

    IF NULLIF(BTRIM(NEW."correctionReason"), '') IS NULL
       OR NEW."correctionCategory" IS NULL
       OR NEW."correctionStartedAt" IS NULL THEN
      RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_METADATA_REQUIRED' USING ERRCODE = '23514';
    END IF;

    IF NEW."beforeSnapshot" IS NULL THEN
      NEW."beforeSnapshot" := TO_JSONB(v_previous);
    END IF;

    v_protocol_changed :=
      NEW."protocolId" IS DISTINCT FROM v_previous."protocolId"
      OR NEW."protocolCode" IS DISTINCT FROM v_previous."protocolCode"
      OR NEW."protocolVersion" IS DISTINCT FROM v_previous."protocolVersion";

    IF v_is_completion_transition THEN
      IF v_protocol_changed AND (
        NEW."correctionCategory" <> 'PROTOCOL_SELECTION_ERROR'
        OR NEW."protocolChangeConfirmedByUserId" IS DISTINCT FROM v_actor_user_id
        OR NEW."protocolChangeConfirmedAt" IS NULL
      ) THEN
        RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_CHANGE_REQUIRES_EXPLICIT_CONFIRMATION'
          USING ERRCODE = '23514';
      END IF;

      IF NOT v_protocol_changed AND NEW."protocolChangeConfirmedByUserId" IS NOT NULL THEN
        RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_CHANGE_CONFIRMATION_WITHOUT_CHANGE'
          USING ERRCODE = '23514';
      END IF;

      NEW."revisionStatus" := 'FINALIZED';
      v_before := NEW."beforeSnapshot";
      v_after := TO_JSONB(NEW) - ARRAY['beforeSnapshot', 'afterSnapshot', 'changedFields'];
      NEW."afterSnapshot" := v_after;
      NEW."changedFields" := "adipometryChangedFields"(v_before, v_after);
      IF JSONB_ARRAY_LENGTH(NEW."changedFields") = 0 THEN
        RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_NO_CHANGES' USING ERRCODE = '23514';
      END IF;
    ELSIF NEW."revisionStatus" NOT IN ('DRAFT', 'CANCELLED') THEN
      RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_STATE_INVALID' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."revisionNumber" = 1 AND v_is_completion_transition THEN
    NEW."revisionStatus" := 'FINALIZED';
  ELSIF TG_OP = 'INSERT' AND NEW."revisionNumber" = 1 AND NEW.status = 'DRAFT' THEN
    NEW."revisionStatus" := 'DRAFT';
  END IF;

  IF TG_OP = 'INSERT' AND NEW."correctedByAssessmentId" IS NOT NULL THEN
    RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_LINK_IS_MANAGED' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."revisionStatus" IN ('CANCELLED', 'SUPERSEDED', 'VOIDED') THEN
    RAISE EXCEPTION 'ADIPOMETRY_TERMINAL_REVISION_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD."correctedByAssessmentId" IS DISTINCT FROM NEW."correctedByAssessmentId"
     AND NOT (
       OLD."revisionStatus" = 'FINALIZED'
       AND NEW."revisionStatus" = 'SUPERSEDED'
       AND OLD."correctedByAssessmentId" IS NULL
       AND NEW."correctedByAssessmentId" IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_LINK_IS_MANAGED' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "linkAdipometryCorrection"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF NEW."revisionNumber" <= 1
     OR NEW.status <> 'COMPLETED'
     OR NEW."revisionStatus" <> 'FINALIZED'
     OR (
       TG_OP = 'UPDATE'
       AND OLD.status = 'COMPLETED'
       AND OLD."revisionStatus" = 'FINALIZED'
     ) THEN
    RETURN NEW;
  END IF;

  UPDATE "AdipometryAssessment"
  SET
    "correctedByAssessmentId" = NEW.id,
    "revisionStatus" = 'SUPERSEDED',
    "updatedAt" = GREATEST("updatedAt", NEW."completedAt", CURRENT_TIMESTAMP)
  WHERE id = NEW."previousRevisionId"
    AND "contractId" = NEW."contractId"
    AND "alunoId" = NEW."alunoId"
    AND status = 'COMPLETED'
    AND "revisionStatus" = 'FINALIZED'
    AND "correctedByAssessmentId" IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_LINK_CONFLICT' USING ERRCODE = '40001';
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE "AdipometryAuditEvent"
  DROP CONSTRAINT "AdipometryAuditEvent_action_check";
ALTER TABLE "AdipometryAuditEvent"
  ADD CONSTRAINT "AdipometryAuditEvent_action_check" CHECK (
    action IN (
      'DRAFT_CREATED', 'DRAFT_UPDATED', 'COMPLETED',
      'CORRECTION_CREATED', 'CORRECTION_LINKED',
      'CORRECTION_DRAFT_CREATED', 'CORRECTION_DRAFT_UPDATED',
      'CORRECTION_FINALIZED', 'CORRECTION_CANCELLED',
      'REVISION_SUPERSEDED', 'PROTOCOL_CHANGE_CONFIRMED', 'VOIDED'
    )
  );
ALTER TABLE "AdipometryAuditEvent"
  DROP CONSTRAINT "AdipometryAuditEvent_reason_check";
ALTER TABLE "AdipometryAuditEvent"
  ADD CONSTRAINT "AdipometryAuditEvent_reason_check" CHECK (
    action NOT IN (
      'CORRECTION_CREATED', 'CORRECTION_LINKED',
      'CORRECTION_DRAFT_CREATED', 'CORRECTION_FINALIZED',
      'CORRECTION_CANCELLED', 'REVISION_SUPERSEDED', 'VOIDED'
    )
    OR NULLIF(BTRIM(reason), '') IS NOT NULL
  );

CREATE OR REPLACE FUNCTION "validateAdipometryAuditEvent"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_table_owner TEXT;
BEGIN
  SELECT PG_GET_USERBYID(class.relowner)
    INTO v_table_owner
  FROM pg_class class
  WHERE class.oid = 'public."AdipometryAuditEvent"'::REGCLASS;

  IF CURRENT_USER IS DISTINCT FROM v_table_owner THEN
    RAISE EXCEPTION 'ADIPOMETRY_AUDIT_INSERT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "Professor" professor
    JOIN "User" actor ON actor.id = professor."userId"
    WHERE professor."userId" = NEW."actorUserId"
      AND professor."contractId" = NEW."contractId"
      AND actor."isActive" = TRUE
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_AUDIT_ACTOR_CROSS_TENANT_OR_INACTIVE'
      USING ERRCODE = '23514';
  END IF;

  IF JSONB_TYPEOF(NEW."afterSnapshot") IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'ADIPOMETRY_AUDIT_EVENT_INVALID' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "recordAdipometryAuditEvent"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_user_id TEXT;
  v_action TEXT;
  v_reason TEXT;
BEGIN
  v_actor_user_id := "requireAdipometryActorUserId"(NEW."contractId", NEW."professorId");

  IF TG_OP = 'INSERT' THEN
    IF NEW."revisionNumber" > 1 AND NEW.status = 'DRAFT' THEN
      v_action := 'CORRECTION_DRAFT_CREATED';
      v_reason := NEW."correctionReason";
    ELSIF NEW."revisionNumber" > 1 AND NEW.status = 'COMPLETED' THEN
      v_action := 'CORRECTION_FINALIZED';
      v_reason := NEW."correctionReason";
    ELSIF NEW.status = 'COMPLETED' THEN
      v_action := 'COMPLETED';
    ELSE
      v_action := 'DRAFT_CREATED';
    END IF;
  ELSIF OLD."revisionStatus" = 'DRAFT' AND NEW."revisionStatus" = 'CANCELLED' THEN
    v_action := 'CORRECTION_CANCELLED';
    v_reason := NEW."correctionCancellationReason";
  ELSIF OLD.status = 'DRAFT' AND NEW.status = 'COMPLETED' AND NEW."revisionNumber" > 1 THEN
    v_action := 'CORRECTION_FINALIZED';
    v_reason := NEW."correctionReason";
  ELSIF OLD.status = 'DRAFT' AND NEW.status = 'COMPLETED' THEN
    v_action := 'COMPLETED';
  ELSIF OLD."revisionStatus" = 'FINALIZED' AND NEW."revisionStatus" = 'SUPERSEDED' THEN
    v_action := 'REVISION_SUPERSEDED';
    SELECT correction."correctionReason" INTO v_reason
    FROM "AdipometryAssessment" correction
    WHERE correction.id = NEW."correctedByAssessmentId";
  ELSIF OLD."revisionStatus" = 'FINALIZED' AND NEW."revisionStatus" = 'VOIDED' THEN
    v_action := 'VOIDED';
    v_reason := NEW."voidReason";
  ELSIF OLD."protocolChangeConfirmedAt" IS NULL
        AND NEW."protocolChangeConfirmedAt" IS NOT NULL THEN
    v_action := 'PROTOCOL_CHANGE_CONFIRMED';
  ELSIF OLD.status = 'DRAFT' AND NEW.status = 'DRAFT' AND NEW."revisionNumber" > 1 THEN
    v_action := 'CORRECTION_DRAFT_UPDATED';
    v_reason := NEW."correctionReason";
  ELSIF OLD.status = 'DRAFT' AND NEW.status = 'DRAFT' THEN
    v_action := 'DRAFT_UPDATED';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO "AdipometryAuditEvent" (
    id, "contractId", "assessmentId", "actorUserId", action, reason,
    "beforeSnapshot", "afterSnapshot", "createdAt"
  ) VALUES (
    MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT || NEW.id || v_action),
    NEW."contractId", NEW.id, v_actor_user_id, v_action, v_reason,
    CASE WHEN TG_OP = 'UPDATE' THEN TO_JSONB(OLD) ELSE NULL END,
    TO_JSONB(NEW), CURRENT_TIMESTAMP
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "startAdipometryCorrection"(
  p_id TEXT,
  p_current_assessment_id TEXT,
  p_category TEXT,
  p_reason TEXT,
  p_actor_user_id TEXT,
  p_started_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
) RETURNS TABLE(
  "assessmentId" TEXT,
  "rootAssessmentId" TEXT,
  "revisionNumber" INTEGER,
  "code" TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_current "AdipometryAssessment"%ROWTYPE;
  v_result "AdipometryAssessment"%ROWTYPE;
BEGIN
  IF p_category NOT IN (
    'MEASUREMENT_OR_TRANSCRIPTION_ERROR',
    'PROTOCOL_SELECTION_ERROR',
    'DEMOGRAPHIC_CONFIRMATION_ERROR',
    'OTHER'
  ) OR NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_METADATA_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_current
  FROM "AdipometryAssessment"
  WHERE id = p_current_assessment_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_current."revisionStatus" <> 'FINALIZED'
     OR v_current."correctedByAssessmentId" IS NOT NULL THEN
    RAISE EXCEPTION 'ADIPOMETRY_INVALID_CORRECTION_TARGET' USING ERRCODE = '23514';
  END IF;

  PERFORM SET_CONFIG('app.adipometry_actor_user_id', p_actor_user_id, TRUE);
  PERFORM "requireAdipometryActorUserId"(v_current."contractId", v_current."professorId");

  IF EXISTS (
    SELECT 1 FROM "AdipometryAssessment" correction
    WHERE correction."rootAssessmentId" = v_current."rootAssessmentId"
      AND correction."revisionStatus" = 'DRAFT'
      AND correction."revisionNumber" > 1
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_ALREADY_OPEN' USING ERRCODE = '23505';
  END IF;

  INSERT INTO "AdipometryAssessment" (
    id, "contractId", "alunoId", "professorId", "sequenceNumber", code,
    "assessmentDate", status, "weightKg", "tricepsMm", "subscapularMm",
    "suprailiacMm", "abdominalMm", "thighMm", "protocolId",
    "protocolCode", "protocolVersion", "anthropometryAssessmentId", notes,
    "protocolSex", "profileSexSnapshot", "protocolSexSource",
    "protocolSexConfirmedByUserId", "protocolSexConfirmedAt",
    "protocolSexOverrideReason", "skinfoldCapacityWarningConfirmedByUserId",
    "skinfoldCapacityWarningConfirmedAt", "correctsAssessmentId",
    "correctionReason", "correctionAuthorUserId", "correctionCategory",
    "correctionStartedAt", "beforeSnapshot", "createdAt", "updatedAt"
  ) VALUES (
    p_id, v_current."contractId", v_current."alunoId", v_current."professorId",
    v_current."sequenceNumber", v_current.code, v_current."assessmentDate", 'DRAFT',
    v_current."weightKg", v_current."tricepsMm", v_current."subscapularMm",
    v_current."suprailiacMm", v_current."abdominalMm", v_current."thighMm",
    v_current."protocolId", v_current."protocolCode", v_current."protocolVersion",
    v_current."anthropometryAssessmentId", v_current.notes, v_current."protocolSex",
    v_current."profileSexSnapshot", v_current."protocolSexSource",
    v_current."protocolSexConfirmedByUserId", v_current."protocolSexConfirmedAt",
    v_current."protocolSexOverrideReason",
    v_current."skinfoldCapacityWarningConfirmedByUserId",
    v_current."skinfoldCapacityWarningConfirmedAt", v_current.id,
    p_reason, p_actor_user_id, p_category, p_started_at,
    TO_JSONB(v_current), p_started_at, p_started_at
  ) RETURNING * INTO v_result;

  RETURN QUERY SELECT v_result.id, v_result."rootAssessmentId", v_result."revisionNumber", v_result.code;
END;
$$;

CREATE OR REPLACE FUNCTION "cancelAdipometryCorrection"(
  p_assessment_id TEXT,
  p_reason TEXT,
  p_actor_user_id TEXT,
  p_cancelled_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_revision "AdipometryAssessment"%ROWTYPE;
BEGIN
  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_CANCELLATION_REASON_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_revision
  FROM "AdipometryAssessment"
  WHERE id = p_assessment_id
  FOR UPDATE;

  IF NOT FOUND OR v_revision."revisionNumber" <= 1 OR v_revision."revisionStatus" <> 'DRAFT' THEN
    RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_NOT_CANCELLABLE' USING ERRCODE = '23514';
  END IF;

  PERFORM SET_CONFIG('app.adipometry_actor_user_id', p_actor_user_id, TRUE);
  PERFORM "requireAdipometryActorUserId"(v_revision."contractId", v_revision."professorId");

  UPDATE "AdipometryAssessment"
  SET "revisionStatus" = 'CANCELLED',
      "correctionCancelledAt" = p_cancelled_at,
      "correctionCancelledByUserId" = p_actor_user_id,
      "correctionCancellationReason" = p_reason,
      "updatedAt" = p_cancelled_at
  WHERE id = p_assessment_id;
END;
$$;

CREATE OR REPLACE FUNCTION "confirmAdipometryCorrectionProtocolChange"(
  p_assessment_id TEXT,
  p_actor_user_id TEXT,
  p_confirmed_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_revision "AdipometryAssessment"%ROWTYPE;
BEGIN
  SELECT * INTO v_revision
  FROM "AdipometryAssessment"
  WHERE id = p_assessment_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_revision."revisionStatus" <> 'DRAFT'
     OR v_revision."revisionNumber" <= 1
     OR v_revision."correctionCategory" <> 'PROTOCOL_SELECTION_ERROR' THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_CHANGE_CONFIRMATION_NOT_ALLOWED' USING ERRCODE = '23514';
  END IF;

  PERFORM SET_CONFIG('app.adipometry_actor_user_id', p_actor_user_id, TRUE);
  PERFORM "requireAdipometryActorUserId"(v_revision."contractId", v_revision."professorId");

  UPDATE "AdipometryAssessment"
  SET "protocolChangeConfirmedByUserId" = p_actor_user_id,
      "protocolChangeConfirmedAt" = p_confirmed_at,
      "updatedAt" = p_confirmed_at
  WHERE id = p_assessment_id;
END;
$$;

CREATE OR REPLACE FUNCTION "voidAdipometryAssessment"(
  p_assessment_id TEXT,
  p_reason TEXT,
  p_actor_user_id TEXT,
  p_voided_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_revision "AdipometryAssessment"%ROWTYPE;
BEGIN
  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'ADIPOMETRY_VOID_REASON_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_revision
  FROM "AdipometryAssessment"
  WHERE id = p_assessment_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_revision."revisionStatus" <> 'FINALIZED'
     OR v_revision."correctedByAssessmentId" IS NOT NULL THEN
    RAISE EXCEPTION 'ADIPOMETRY_ASSESSMENT_NOT_VOIDABLE' USING ERRCODE = '23514';
  END IF;

  PERFORM SET_CONFIG('app.adipometry_actor_user_id', p_actor_user_id, TRUE);
  PERFORM "requireAdipometryActorUserId"(v_revision."contractId", v_revision."professorId");

  UPDATE "AdipometryAssessment"
  SET "revisionStatus" = 'VOIDED',
      "voidedAt" = p_voided_at,
      "voidedByUserId" = p_actor_user_id,
      "voidReason" = p_reason,
      "updatedAt" = p_voided_at
  WHERE id = p_assessment_id;
END;
$$;

-- Re-assert full vector validation. The prior governance migration returned
-- before iterating the vectors, so a structurally valid definition with forged
-- expected results could otherwise be approved directly at the persistence boundary.
CREATE OR REPLACE FUNCTION "isValidAdipometryContractProtocolDefinition"(p_definition JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
STRICT
AS $validator$
DECLARE
  v_all_skinfolds CONSTANT JSONB := '["tricepsMm","subscapularMm","suprailiacMm","abdominalMm","thighMm"]'::JSONB;
  v_male_skinfolds CONSTANT JSONB := '["tricepsMm","suprailiacMm","abdominalMm"]'::JSONB;
  v_female_skinfolds CONSTANT JSONB := '["subscapularMm","suprailiacMm","thighMm"]'::JSONB;
  v_allowed_variables TEXT[] := ARRAY[
    'weightKg','tricepsMm','subscapularMm','suprailiacMm','abdominalMm','thighMm',
    'skinfoldTotalMm','ageAtAssessment'
  ];
  v_expected_outputs CONSTANT TEXT[] := ARRAY['bodyFatPercentage','fatMassKg','leanMassKg'];
  v_equation JSONB;
  v_vector JSONB;
  v_field TEXT;
  v_limit JSONB;
  v_actual JSONB;
  v_expected NUMERIC;
  v_tolerance NUMERIC;
  v_index INTEGER := 0;
  v_sex TEXT;
  v_age INTEGER;
BEGIN
  IF JSONB_TYPEOF(p_definition) IS DISTINCT FROM 'object'
     OR JSONB_TYPEOF(p_definition -> 'schemaVersion') IS DISTINCT FROM 'number'
     OR (p_definition ->> 'schemaVersion')::INTEGER < 3
     OR JSONB_TYPEOF(p_definition -> 'internalVersion') IS DISTINCT FROM 'string'
     OR NULLIF(BTRIM(p_definition ->> 'internalVersion'), '') IS NULL THEN
    RETURN FALSE;
  END IF;

  IF JSONB_TYPEOF(p_definition -> 'population') IS DISTINCT FROM 'object'
     OR JSONB_TYPEOF(p_definition #> '{population,ageMinYears}') IS DISTINCT FROM 'number'
     OR JSONB_TYPEOF(p_definition #> '{population,ageMaxYears}') IS DISTINCT FROM 'number'
     OR (p_definition #>> '{population,ageMinYears}')::INTEGER <> 18
     OR (p_definition #>> '{population,ageMaxYears}')::INTEGER <> 30
     OR JSONB_TYPEOF(p_definition #> '{population,sexCriteria}') IS DISTINCT FROM 'array'
     OR NOT ((p_definition #> '{population,sexCriteria}') @> '["MALE","FEMALE"]'::JSONB)
     OR JSONB_ARRAY_LENGTH(p_definition #> '{population,sexCriteria}') <> 2
     OR p_definition #>> '{population,maturationRule,mode}' IS DISTINCT FROM 'NOT_REQUIRED' THEN
    RETURN FALSE;
  END IF;

  IF JSONB_TYPEOF(p_definition -> 'requiredSkinfolds') IS DISTINCT FROM 'array'
     OR JSONB_ARRAY_LENGTH(p_definition -> 'requiredSkinfolds') <> 5
     OR NOT ((p_definition -> 'requiredSkinfolds') @> v_all_skinfolds)
     OR NOT (v_all_skinfolds @> (p_definition -> 'requiredSkinfolds'))
     OR JSONB_TYPEOF(p_definition #> '{calculationSkinfoldsBySex,MALE}') IS DISTINCT FROM 'array'
     OR JSONB_TYPEOF(p_definition #> '{calculationSkinfoldsBySex,FEMALE}') IS DISTINCT FROM 'array'
     OR NOT ((p_definition #> '{calculationSkinfoldsBySex,MALE}') @> v_male_skinfolds)
     OR NOT (v_male_skinfolds @> (p_definition #> '{calculationSkinfoldsBySex,MALE}'))
     OR NOT ((p_definition #> '{calculationSkinfoldsBySex,FEMALE}') @> v_female_skinfolds)
     OR NOT (v_female_skinfolds @> (p_definition #> '{calculationSkinfoldsBySex,FEMALE}')) THEN
    RETURN FALSE;
  END IF;

  IF p_definition #>> '{inputScales,weightKg}' IS DISTINCT FROM '2'
     OR p_definition #>> '{inputScales,tricepsMm}' IS DISTINCT FROM '1'
     OR p_definition #>> '{inputScales,subscapularMm}' IS DISTINCT FROM '1'
     OR p_definition #>> '{inputScales,suprailiacMm}' IS DISTINCT FROM '1'
     OR p_definition #>> '{inputScales,abdominalMm}' IS DISTINCT FROM '1'
     OR p_definition #>> '{inputScales,thighMm}' IS DISTINCT FROM '1'
     OR p_definition #>> '{rounding,mode}' IS DISTINCT FROM 'HALF_UP'
     OR p_definition #>> '{rounding,stage}' IS DISTINCT FROM 'FINAL_RESULTS_ONLY'
     OR p_definition #>> '{precision,resultScale}' IS DISTINCT FROM '2'
     OR p_definition #>> '{precision,internalScale}' IS DISTINCT FROM '8' THEN
    RETURN FALSE;
  END IF;

  FOREACH v_field IN ARRAY ARRAY['weightKg','tricepsMm','subscapularMm','suprailiacMm','abdominalMm','thighMm'] LOOP
    v_limit := p_definition #> ARRAY['limits','blocking',v_field];
    IF JSONB_TYPEOF(v_limit) IS DISTINCT FROM 'object'
       OR JSONB_TYPEOF(v_limit -> 'min') IS DISTINCT FROM 'number'
       OR JSONB_TYPEOF(v_limit -> 'max') IS DISTINCT FROM 'number'
       OR (v_limit ->> 'min')::NUMERIC <= 0
       OR (v_limit ->> 'max')::NUMERIC <= (v_limit ->> 'min')::NUMERIC THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  IF JSONB_TYPEOF(p_definition -> 'equations') IS DISTINCT FROM 'array'
     OR JSONB_ARRAY_LENGTH(p_definition -> 'equations') <> 3 THEN
    RETURN FALSE;
  END IF;
  FOR v_equation IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_definition -> 'equations') LOOP
    v_index := v_index + 1;
    IF v_equation ->> 'output' IS DISTINCT FROM v_expected_outputs[v_index]
       OR NOT "isValidAdipometryContractExpression"(v_equation -> 'expression', v_allowed_variables) THEN
      RETURN FALSE;
    END IF;
    v_allowed_variables := ARRAY_APPEND(v_allowed_variables, v_equation ->> 'output');
  END LOOP;

  IF JSONB_TYPEOF(p_definition -> 'testVectors') IS DISTINCT FROM 'array'
     OR JSONB_ARRAY_LENGTH(p_definition -> 'testVectors') < 3
     OR (
       SELECT COUNT(DISTINCT vector ->> 'id')
       FROM JSONB_ARRAY_ELEMENTS(p_definition -> 'testVectors') vector
     ) <> JSONB_ARRAY_LENGTH(p_definition -> 'testVectors')
     OR (
       SELECT COUNT(DISTINCT vector -> 'inputs')
       FROM JSONB_ARRAY_ELEMENTS(p_definition -> 'testVectors') vector
     ) <> JSONB_ARRAY_LENGTH(p_definition -> 'testVectors') THEN
    RETURN FALSE;
  END IF;

  FOR v_vector IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_definition -> 'testVectors') LOOP
    v_sex := UPPER(BTRIM(v_vector #>> '{inputs,profileCriteria,sex}'));
    IF JSONB_TYPEOF(v_vector #> '{inputs,ageAtAssessment}') IS DISTINCT FROM 'number'
       OR JSONB_TYPEOF(v_vector #> '{inputs,measurements}') IS DISTINCT FROM 'object'
       OR v_sex NOT IN ('MALE','FEMALE') THEN
      RETURN FALSE;
    END IF;
    v_age := (v_vector #>> '{inputs,ageAtAssessment}')::INTEGER;
    IF v_age NOT BETWEEN 18 AND 30 THEN RETURN FALSE; END IF;

    FOREACH v_field IN ARRAY ARRAY['weightKg','tricepsMm','subscapularMm','suprailiacMm','abdominalMm','thighMm'] LOOP
      IF JSONB_TYPEOF(v_vector #> ARRAY['inputs','measurements',v_field]) IS DISTINCT FROM 'number' THEN
        RETURN FALSE;
      END IF;
      v_limit := p_definition #> ARRAY['limits','blocking',v_field];
      IF (v_vector #>> ARRAY['inputs','measurements',v_field])::NUMERIC < (v_limit ->> 'min')::NUMERIC
         OR (v_vector #>> ARRAY['inputs','measurements',v_field])::NUMERIC > (v_limit ->> 'max')::NUMERIC THEN
        RETURN FALSE;
      END IF;
    END LOOP;

    v_actual := "evaluateAdipometryContractProtocolVector"(p_definition, v_vector);
    FOREACH v_field IN ARRAY ARRAY['skinfoldTotalMm','bodyFatPercentage','fatMassKg','leanMassKg'] LOOP
      IF JSONB_TYPEOF(v_actual -> v_field) IS DISTINCT FROM 'number'
         OR JSONB_TYPEOF(v_vector #> ARRAY['expectedResults',v_field]) IS DISTINCT FROM 'number'
         OR JSONB_TYPEOF(v_vector #> ARRAY['tolerance',v_field]) IS DISTINCT FROM 'number' THEN
        RETURN FALSE;
      END IF;
      v_expected := (v_vector #>> ARRAY['expectedResults',v_field])::NUMERIC;
      v_tolerance := (v_vector #>> ARRAY['tolerance',v_field])::NUMERIC;
      IF v_tolerance < 0 OR v_tolerance > 0.01 THEN RETURN FALSE; END IF;
      IF ABS(
        "roundAdipometryValue"(
          (v_actual ->> v_field)::NUMERIC,
          CASE WHEN v_field = 'skinfoldTotalMm' THEN 1 ELSE 2 END,
          'HALF_UP'
        ) - v_expected
      ) > v_tolerance THEN
        RETURN FALSE;
      END IF;
    END LOOP;

    IF (v_actual ->> 'bodyFatPercentage')::NUMERIC NOT BETWEEN 0 AND 100
       OR (v_actual ->> 'fatMassKg')::NUMERIC < 0
       OR (v_actual ->> 'leanMassKg')::NUMERIC < 0
       OR ABS(
         (v_actual ->> 'fatMassKg')::NUMERIC
         + (v_actual ->> 'leanMassKg')::NUMERIC
         - (v_vector #>> '{inputs,measurements,weightKg}')::NUMERIC
       ) > 0.02 THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$validator$;


ALTER TABLE "AdipometryAssessment" ENABLE TRIGGER USER;

CREATE OR REPLACE VIEW "AdipometryCurrentAssessment" AS
SELECT assessment.*
FROM "AdipometryAssessment" assessment
WHERE assessment."revisionStatus" = 'FINALIZED'
  AND assessment."correctedByAssessmentId" IS NULL;

COMMIT;

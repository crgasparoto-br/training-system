-- Issue #270: projections used by the administrative pre-registration list.
-- These columns keep filtering, ordering and displayed summaries on the same source of truth.
ALTER TABLE "Aluno"
  ADD COLUMN "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "leadAdditionalPhone" TEXT,
  ADD COLUMN "leadAdditionalPhoneNormalized" TEXT,
  ADD COLUMN "leadAdditionalEmail" TEXT,
  ADD COLUMN "leadAdditionalEmailNormalized" TEXT,
  ADD COLUMN "currentPreRegistrationInviteStatus" "PreRegistrationInviteStatus",
  ADD COLUMN "currentPreRegistrationInviteExpiresAt" TIMESTAMP(3),
  ADD COLUMN "parqRequiresProfessionalReview" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Aluno_contractId_leadAdditionalEmailNormalized_idx"
  ON "Aluno"("contractId", "leadAdditionalEmailNormalized");
CREATE INDEX "Aluno_contractId_leadAdditionalPhoneNormalized_idx"
  ON "Aluno"("contractId", "leadAdditionalPhoneNormalized");
CREATE INDEX "Aluno_contractId_lastActivityAt_idx"
  ON "Aluno"("contractId", "lastActivityAt");
CREATE INDEX "Aluno_contractId_currentPreRegistrationInviteStatus_idx"
  ON "Aluno"("contractId", "currentPreRegistrationInviteStatus");
CREATE INDEX "Aluno_contractId_parqRequiresProfessionalReview_idx"
  ON "Aluno"("contractId", "parqRequiresProfessionalReview");

-- Optional secondary contacts already present in JSON remain readable after the projection cutover.
UPDATE "Aluno" AS aluno
SET
  "leadAdditionalPhone" = NULLIF(profile."identificationData" ->> 'additionalPhone', ''),
  "leadAdditionalPhoneNormalized" = NULLIF(
    regexp_replace(COALESCE(profile."identificationData" ->> 'additionalPhone', ''), '[^0-9]', '', 'g'),
    ''
  ),
  "leadAdditionalEmail" = NULLIF(profile."identificationData" ->> 'additionalEmail', ''),
  "leadAdditionalEmailNormalized" = lower(NULLIF(profile."identificationData" ->> 'additionalEmail', ''))
FROM "StudentProfile" AS profile
WHERE profile."alunoId" = aluno.id;

-- Current invite is always the most recently created invite for PRE_REGISTRATION.
UPDATE "Aluno" AS aluno
SET
  "currentPreRegistrationInviteStatus" = (
    SELECT invite.status
    FROM "PreRegistrationInvite" AS invite
    WHERE invite."alunoId" = aluno.id
      AND invite.purpose = 'PRE_REGISTRATION'
    ORDER BY invite."createdAt" DESC, invite.id DESC
    LIMIT 1
  ),
  "currentPreRegistrationInviteExpiresAt" = (
    SELECT invite."expiresAt"
    FROM "PreRegistrationInvite" AS invite
    WHERE invite."alunoId" = aluno.id
      AND invite.purpose = 'PRE_REGISTRATION'
    ORDER BY invite."createdAt" DESC, invite.id DESC
    LIMIT 1
  );

CREATE OR REPLACE FUNCTION issue_270_json_has_positive_content(value JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF value IS NULL OR value = 'null'::jsonb THEN
    RETURN false;
  END IF;

  CASE jsonb_typeof(value)
    WHEN 'array' THEN RETURN jsonb_array_length(value) > 0;
    WHEN 'object' THEN RETURN jsonb_object_length(value) > 0;
    WHEN 'string' THEN RETURN length(btrim(value #>> '{}')) > 0;
    WHEN 'boolean' THEN RETURN (value #>> '{}')::boolean;
    WHEN 'number' THEN RETURN true;
    ELSE RETURN false;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION issue_270_refresh_parq_projection(target_aluno_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  requires_review BOOLEAN;
  activity_at TIMESTAMP(3);
BEGIN
  SELECT
    issue_270_json_has_positive_content(submission."positiveItems")
      OR EXISTS (
        SELECT 1
        FROM "ProntuarioAnamnesisFollowUp" AS follow_up
        WHERE follow_up."parqSubmissionId" = submission.id
          AND follow_up.status = 'active'
      ),
    GREATEST(submission."submittedAt", submission."updatedAt")
  INTO requires_review, activity_at
  FROM "StudentParqSubmission" AS submission
  WHERE submission."alunoId" = target_aluno_id
  ORDER BY submission."submittedAt" DESC, submission.id DESC
  LIMIT 1;

  UPDATE "Aluno"
  SET
    "parqRequiresProfessionalReview" = COALESCE(requires_review, false),
    "lastActivityAt" = GREATEST("lastActivityAt", COALESCE(activity_at, "lastActivityAt"))
  WHERE id = target_aluno_id;
END;
$$;

DO $$
DECLARE
  aluno_row RECORD;
BEGIN
  FOR aluno_row IN SELECT id FROM "Aluno" LOOP
    PERFORM issue_270_refresh_parq_projection(aluno_row.id);
  END LOOP;
END;
$$;

-- Backfill the canonical activity timestamp from every source shown by the administrative module.
UPDATE "Aluno" AS aluno
SET "lastActivityAt" = GREATEST(
  aluno."updatedAt",
  COALESCE((
    SELECT GREATEST(onboarding."updatedAt", COALESCE(onboarding."lastSavedAt", onboarding."updatedAt"))
    FROM "StudentOnboardingProcess" AS onboarding
    WHERE onboarding."alunoId" = aluno.id
  ), aluno."updatedAt"),
  COALESCE((
    SELECT MAX(event."createdAt")
    FROM "StudentLifecycleEvent" AS event
    WHERE event."alunoId" = aluno.id
  ), aluno."updatedAt"),
  COALESCE((
    SELECT MAX(GREATEST(
      invite."createdAt",
      COALESCE(invite."lastAccessAt", invite."createdAt"),
      COALESCE(invite."completedAt", invite."createdAt"),
      COALESCE(invite."revokedAt", invite."createdAt"),
      COALESCE(invite."supersededAt", invite."createdAt")
    ))
    FROM "PreRegistrationInvite" AS invite
    WHERE invite."alunoId" = aluno.id
  ), aluno."updatedAt"),
  COALESCE((
    SELECT MAX(GREATEST(submission."submittedAt", submission."updatedAt"))
    FROM "StudentParqSubmission" AS submission
    WHERE submission."alunoId" = aluno.id
  ), aluno."updatedAt")
);

CREATE OR REPLACE FUNCTION issue_270_touch_aluno_on_direct_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."lastActivityAt" IS NOT DISTINCT FROM OLD."lastActivityAt" THEN
    NEW."lastActivityAt" := CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER issue_270_aluno_direct_activity
BEFORE UPDATE ON "Aluno"
FOR EACH ROW
EXECUTE FUNCTION issue_270_touch_aluno_on_direct_update();

CREATE OR REPLACE FUNCTION issue_270_touch_onboarding_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "Aluno"
  SET "lastActivityAt" = GREATEST(
    "lastActivityAt",
    COALESCE(NEW."lastSavedAt", NEW."updatedAt", NEW."createdAt", CURRENT_TIMESTAMP)
  )
  WHERE id = NEW."alunoId";
  RETURN NEW;
END;
$$;

CREATE TRIGGER issue_270_onboarding_activity
AFTER INSERT OR UPDATE ON "StudentOnboardingProcess"
FOR EACH ROW
EXECUTE FUNCTION issue_270_touch_onboarding_activity();

CREATE OR REPLACE FUNCTION issue_270_touch_lifecycle_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "Aluno"
  SET "lastActivityAt" = GREATEST("lastActivityAt", NEW."createdAt")
  WHERE id = NEW."alunoId";
  RETURN NEW;
END;
$$;

CREATE TRIGGER issue_270_lifecycle_activity
AFTER INSERT ON "StudentLifecycleEvent"
FOR EACH ROW
EXECUTE FUNCTION issue_270_touch_lifecycle_activity();

CREATE OR REPLACE FUNCTION issue_270_refresh_invite_projection()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_aluno_id TEXT;
  latest_status "PreRegistrationInviteStatus";
  latest_expires_at TIMESTAMP(3);
  latest_activity TIMESTAMP(3);
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_aluno_id := OLD."alunoId";
  ELSE
    target_aluno_id := NEW."alunoId";
  END IF;

  SELECT
    invite.status,
    invite."expiresAt",
    GREATEST(
      invite."createdAt",
      COALESCE(invite."lastAccessAt", invite."createdAt"),
      COALESCE(invite."completedAt", invite."createdAt"),
      COALESCE(invite."revokedAt", invite."createdAt"),
      COALESCE(invite."supersededAt", invite."createdAt")
    )
  INTO latest_status, latest_expires_at, latest_activity
  FROM "PreRegistrationInvite" AS invite
  WHERE invite."alunoId" = target_aluno_id
    AND invite.purpose = 'PRE_REGISTRATION'
  ORDER BY invite."createdAt" DESC, invite.id DESC
  LIMIT 1;

  UPDATE "Aluno"
  SET
    "currentPreRegistrationInviteStatus" = latest_status,
    "currentPreRegistrationInviteExpiresAt" = latest_expires_at,
    "lastActivityAt" = GREATEST("lastActivityAt", COALESCE(latest_activity, "lastActivityAt"))
  WHERE id = target_aluno_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER issue_270_invite_projection
AFTER INSERT OR UPDATE OR DELETE ON "PreRegistrationInvite"
FOR EACH ROW
EXECUTE FUNCTION issue_270_refresh_invite_projection();

CREATE OR REPLACE FUNCTION issue_270_refresh_parq_from_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_aluno_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_aluno_id := OLD."alunoId";
  ELSE
    target_aluno_id := NEW."alunoId";
  END IF;
  PERFORM issue_270_refresh_parq_projection(target_aluno_id);
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER issue_270_parq_submission_projection
AFTER INSERT OR UPDATE OR DELETE ON "StudentParqSubmission"
FOR EACH ROW
EXECUTE FUNCTION issue_270_refresh_parq_from_submission();

CREATE OR REPLACE FUNCTION issue_270_refresh_parq_from_follow_up()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  old_aluno_id TEXT;
  new_aluno_id TEXT;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD."parqSubmissionId" IS NOT NULL THEN
    SELECT submission."alunoId" INTO old_aluno_id
    FROM "StudentParqSubmission" AS submission
    WHERE submission.id = OLD."parqSubmissionId";
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW."parqSubmissionId" IS NOT NULL THEN
    SELECT submission."alunoId" INTO new_aluno_id
    FROM "StudentParqSubmission" AS submission
    WHERE submission.id = NEW."parqSubmissionId";
  END IF;

  IF old_aluno_id IS NOT NULL THEN
    PERFORM issue_270_refresh_parq_projection(old_aluno_id);
  END IF;
  IF new_aluno_id IS NOT NULL AND new_aluno_id IS DISTINCT FROM old_aluno_id THEN
    PERFORM issue_270_refresh_parq_projection(new_aluno_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER issue_270_parq_follow_up_projection
AFTER INSERT OR UPDATE OR DELETE ON "ProntuarioAnamnesisFollowUp"
FOR EACH ROW
EXECUTE FUNCTION issue_270_refresh_parq_from_follow_up();

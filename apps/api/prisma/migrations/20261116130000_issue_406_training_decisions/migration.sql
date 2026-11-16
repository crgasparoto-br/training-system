-- Issue #406: suggestion, explicit professional decisions, and atomic versioned future planning.
CREATE TABLE "PostWorkoutDecision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "contractId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "workoutDayId" TEXT NOT NULL,
  "sourceFeedbackRevisionId" TEXT NOT NULL,
  "trainingPlanId" TEXT NOT NULL,
  "sourceSnapshot" JSONB NOT NULL,
  "action" TEXT NOT NULL,
  "rationale" TEXT NOT NULL,
  "studentMessage" TEXT,
  "exposeToStudent" BOOLEAN NOT NULL DEFAULT FALSE,
  "suggestedByProfessorId" TEXT NOT NULL,
  "suggestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "suggestionKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'suggested',
  "version" INTEGER NOT NULL DEFAULT 1,
  "approvedByProfessorId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "approvalReason" TEXT,
  "rejectedByProfessorId" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "appliedByProfessorId" TEXT,
  "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostWorkoutDecision_state" CHECK (
    "action" IN ('maintain','progress','reduce','replace','suspend','reassess')
    AND length(btrim("rationale")) > 0
    AND length(btrim("suggestionKey")) BETWEEN 8 AND 128
    AND "version" > 0
    AND (("status" = 'suggested' AND "version"=1
      AND "approvedAt" IS NULL AND "rejectedAt" IS NULL AND "appliedAt" IS NULL)
      OR ("status"='approved' AND "approvedByProfessorId" IS NOT NULL
        AND "approvedAt" IS NOT NULL AND "rejectedAt" IS NULL AND "appliedAt" IS NULL)
      OR ("status"='rejected' AND "rejectedByProfessorId" IS NOT NULL
        AND "rejectedAt" IS NOT NULL AND length(btrim("rejectionReason"))>0
        AND "approvedAt" IS NULL AND "appliedAt" IS NULL)
      OR ("status"='applied' AND "approvedByProfessorId" IS NOT NULL AND "approvedAt" IS NOT NULL
        AND "appliedByProfessorId" IS NOT NULL AND "appliedAt" IS NOT NULL AND "rejectedAt" IS NULL))
  ),
  CONSTRAINT "PostWorkoutDecision_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT,
  CONSTRAINT "PostWorkoutDecision_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT,
  CONSTRAINT "PostWorkoutDecision_sourceFeedbackRevisionId_fkey" FOREIGN KEY ("sourceFeedbackRevisionId") REFERENCES "PostWorkoutFeedbackRevision"("id") ON DELETE RESTRICT,
  CONSTRAINT "PostWorkoutDecision_trainingPlanId_fkey" FOREIGN KEY ("trainingPlanId") REFERENCES "TrainingPlan"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "PostWorkoutDecision_contractId_alunoId_suggestionKey_key"
  ON "PostWorkoutDecision"("contractId","alunoId","suggestionKey");
CREATE INDEX "PostWorkoutDecision_contractId_alunoId_createdAt_idx"
  ON "PostWorkoutDecision"("contractId","alunoId","createdAt");
CREATE INDEX "PostWorkoutDecision_workoutDayId_status_idx"
  ON "PostWorkoutDecision"("workoutDayId","status");

CREATE TABLE "PostWorkoutDecisionOperation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "decisionId" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "resultingVersion" INTEGER NOT NULL,
  "lifecycleEventId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostWorkoutDecisionOperation_decisionId_fkey"
    FOREIGN KEY ("decisionId") REFERENCES "PostWorkoutDecision"("id") ON DELETE RESTRICT,
  CONSTRAINT "PostWorkoutDecisionOperation_lifecycleEventId_fkey"
    FOREIGN KEY ("lifecycleEventId") REFERENCES "StudentLifecycleEvent"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "PostWorkoutDecisionOperation_decisionId_operationKey_key"
  ON "PostWorkoutDecisionOperation"("decisionId","operationKey");
CREATE INDEX "PostWorkoutDecisionOperation_createdAt_idx"
  ON "PostWorkoutDecisionOperation"("createdAt");

CREATE TABLE "TrainingPlanAdjustment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "decisionId" TEXT NOT NULL,
  "trainingPlanId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "instruction" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "appliedByProfessorId" TEXT NOT NULL,
  "sourceSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainingPlanAdjustment_valid" CHECK ("version">0 AND length(btrim("instruction"))>0),
  CONSTRAINT "TrainingPlanAdjustment_decisionId_fkey"
    FOREIGN KEY ("decisionId") REFERENCES "PostWorkoutDecision"("id") ON DELETE RESTRICT,
  CONSTRAINT "TrainingPlanAdjustment_trainingPlanId_fkey"
    FOREIGN KEY ("trainingPlanId") REFERENCES "TrainingPlan"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "TrainingPlanAdjustment_decisionId_key" ON "TrainingPlanAdjustment"("decisionId");
CREATE UNIQUE INDEX "TrainingPlanAdjustment_trainingPlanId_version_key"
  ON "TrainingPlanAdjustment"("trainingPlanId","version");
CREATE INDEX "TrainingPlanAdjustment_contractId_alunoId_createdAt_idx"
  ON "TrainingPlanAdjustment"("contractId","alunoId","createdAt");

-- Changes to evidence, actor, action or terminal decisions are forbidden at the SQL boundary.
CREATE FUNCTION "guard_post_workout_decision_transition"() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Decision history is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."contractId" IS DISTINCT FROM NEW."contractId"
    OR OLD."alunoId" IS DISTINCT FROM NEW."alunoId"
    OR OLD."workoutDayId" IS DISTINCT FROM NEW."workoutDayId"
    OR OLD."sourceFeedbackRevisionId" IS DISTINCT FROM NEW."sourceFeedbackRevisionId"
    OR OLD."trainingPlanId" IS DISTINCT FROM NEW."trainingPlanId"
    OR OLD."sourceSnapshot" IS DISTINCT FROM NEW."sourceSnapshot"
    OR OLD."action" IS DISTINCT FROM NEW."action"
    OR OLD."rationale" IS DISTINCT FROM NEW."rationale"
    OR OLD."studentMessage" IS DISTINCT FROM NEW."studentMessage"
    OR OLD."exposeToStudent" IS DISTINCT FROM NEW."exposeToStudent"
    OR OLD."suggestedByProfessorId" IS DISTINCT FROM NEW."suggestedByProfessorId"
    OR OLD."suggestedAt" IS DISTINCT FROM NEW."suggestedAt"
    OR OLD."suggestionKey" IS DISTINCT FROM NEW."suggestionKey"
    OR OLD."requestFingerprint" IS DISTINCT FROM NEW."requestFingerprint"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
    OR NEW."version" <> OLD."version"+1
    OR NOT ((OLD."status"='suggested' AND NEW."status" IN ('approved','rejected'))
      OR (OLD."status"='approved' AND NEW."status"='applied'))
    OR (OLD."status"='approved' AND
      (OLD."approvedByProfessorId" IS DISTINCT FROM NEW."approvedByProfessorId"
      OR OLD."approvedAt" IS DISTINCT FROM NEW."approvedAt"
      OR OLD."approvalReason" IS DISTINCT FROM NEW."approvalReason"))
  THEN
    RAISE EXCEPTION 'Invalid decision state transition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PostWorkoutDecision_no_delete" BEFORE DELETE ON "PostWorkoutDecision"
  FOR EACH ROW EXECUTE FUNCTION "guard_post_workout_decision_transition"();
CREATE TRIGGER "PostWorkoutDecision_guard_update" BEFORE UPDATE ON "PostWorkoutDecision"
  FOR EACH ROW EXECUTE FUNCTION "guard_post_workout_decision_transition"();

CREATE FUNCTION "guard_post_workout_decision_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Decision ledger is append only' USING ERRCODE='23514';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PostWorkoutDecisionOperation_immutable"
  BEFORE UPDATE OR DELETE ON "PostWorkoutDecisionOperation"
  FOR EACH ROW EXECUTE FUNCTION "guard_post_workout_decision_append_only"();
CREATE TRIGGER "TrainingPlanAdjustment_immutable"
  BEFORE UPDATE OR DELETE ON "TrainingPlanAdjustment"
  FOR EACH ROW EXECUTE FUNCTION "guard_post_workout_decision_append_only"();

-- Deferred until commit: an applied decision must have precisely one canonical planning effect.
CREATE FUNCTION "guard_applied_decision_effect"() RETURNS trigger AS $$
BEGIN
  IF NEW."status"='applied' AND NOT EXISTS (
    SELECT 1 FROM "TrainingPlanAdjustment" a
    WHERE a."decisionId"=NEW."id" AND a."contractId"=NEW."contractId"
      AND a."alunoId"=NEW."alunoId" AND a."trainingPlanId"=NEW."trainingPlanId"
  ) THEN
    RAISE EXCEPTION 'Applied decision requires canonical planning adjustment' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "PostWorkoutDecision_requires_effect"
  AFTER INSERT OR UPDATE ON "PostWorkoutDecision"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "guard_applied_decision_effect"();


-- Every effect must belong to an applied decision at commit and retain exact provenance.
CREATE FUNCTION "guard_planning_adjustment_owner"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "PostWorkoutDecision" d
    WHERE d."id"=NEW."decisionId" AND d."contractId"=NEW."contractId"
      AND d."alunoId"=NEW."alunoId" AND d."trainingPlanId"=NEW."trainingPlanId"
      AND d."action"=NEW."action" AND d."sourceSnapshot"=NEW."sourceSnapshot"
  ) THEN RAISE EXCEPTION 'Planning adjustment does not match decision origin' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "TrainingPlanAdjustment_same_subject"
  BEFORE INSERT ON "TrainingPlanAdjustment"
  FOR EACH ROW EXECUTE FUNCTION "guard_planning_adjustment_owner"();

CREATE FUNCTION "guard_planning_adjustment_final_state"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "PostWorkoutDecision" d
    WHERE d."id"=NEW."decisionId" AND d."status"='applied'
      AND d."appliedByProfessorId"=NEW."appliedByProfessorId"
      AND d."appliedAt" IS NOT NULL
  ) THEN RAISE EXCEPTION 'Planning adjustment requires applied decision' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "TrainingPlanAdjustment_requires_applied"
  AFTER INSERT ON "TrainingPlanAdjustment"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "guard_planning_adjustment_final_state"();

-- A confirmed audit event may not be changed or removed, including by SQL.
CREATE FUNCTION "guard_decision_lifecycle_event"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "PostWorkoutDecisionOperation" op WHERE op."lifecycleEventId"=OLD."id")
     OR EXISTS (SELECT 1 FROM "PostWorkoutDecision" d WHERE OLD."metadata"->>'domain'='training_decision'
        AND OLD."metadata"->>'decisionId'=d."id" AND OLD."metadata"->>'version'='1') THEN
    IF TG_OP='DELETE' OR to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION 'Decision lifecycle evidence is immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StudentLifecycleEvent_decision_immutable"
  BEFORE UPDATE OR DELETE ON "StudentLifecycleEvent"
  FOR EACH ROW EXECUTE FUNCTION "guard_decision_lifecycle_event"();

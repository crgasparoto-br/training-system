-- #401: planned and executed values remain separate, with a one-time historical plan.
-- New fields are additive: legacy executions keep their previous values, never zero backfills.
ALTER TABLE "WorkoutSessionExecution"
  ADD COLUMN "plannedSnapshot" JSONB;

ALTER TABLE "WorkoutSessionExecutionItem"
  ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'full',
  ADD COLUMN "substitutionNote" TEXT,
  ADD COLUMN "rir" DOUBLE PRECISION,
  ADD COLUMN "rpe" DOUBLE PRECISION,
  ADD COLUMN "tempo" TEXT,
  ADD COLUMN "restSec" INTEGER;

ALTER TABLE "WorkoutSessionExecutionItem"
  ADD CONSTRAINT "Issue401_item_outcome_check"
    CHECK ("outcome" IN ('full', 'partial', 'substituted', 'not_performed')),
  ADD CONSTRAINT "Issue401_item_substitution_check"
    CHECK ("outcome" <> 'substituted' OR NULLIF(BTRIM("substitutionNote"), '') IS NOT NULL),
  ADD CONSTRAINT "Issue401_item_rir_check"
    CHECK ("rir" IS NULL OR ("rir" >= 0 AND "rir" <= 30)),
  ADD CONSTRAINT "Issue401_item_rpe_check"
    CHECK ("rpe" IS NULL OR ("rpe" >= 0 AND "rpe" <= 10)),
  ADD CONSTRAINT "Issue401_item_rest_check"
    CHECK ("restSec" IS NULL OR ("restSec" >= 0 AND "restSec" <= 86400)),
  ADD CONSTRAINT "Issue401_item_tempo_check"
    CHECK ("tempo" IS NULL OR char_length("tempo") <= 80);

-- No later write can rewrite a plan already captured by the canonical execution.
-- The guard does not modify lifecycle versioning from #389/#399.
CREATE FUNCTION "issue401_guard_frozen_plan"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."plannedSnapshot" IS DISTINCT FROM OLD."plannedSnapshot" THEN
    RAISE EXCEPTION 'captured execution plan is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "issue401_frozen_plan_guard"
BEFORE UPDATE OF "plannedSnapshot" ON "WorkoutSessionExecution"
FOR EACH ROW EXECUTE FUNCTION "issue401_guard_frozen_plan"();

-- New snapshots must reference the exact released session row, never a synthetic ID.
ALTER TABLE "WorkoutSessionExecution"
  ADD CONSTRAINT "Issue401_snapshot_session_check"
  CHECK ("plannedSnapshot" IS NULL OR (
    jsonb_typeof("plannedSnapshot") = 'object'
    AND "plannedSnapshot"->>'id' = "workoutDayId"
    AND jsonb_typeof("plannedSnapshot"->'cyclicStages') = 'array'
    AND jsonb_typeof("plannedSnapshot"->'exercises') = 'array'
    AND jsonb_typeof("plannedSnapshot"->'resistanceGroups') = 'array'
  ));

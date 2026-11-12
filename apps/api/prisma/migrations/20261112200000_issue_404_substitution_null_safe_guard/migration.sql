-- #404: PostgreSQL CHECK accepts UNKNOWN; prevent outcome=NULL from carrying a substitution link.
-- Keep the published migration immutable. NOT VALID preserves legacy historical rows
-- while enforcing the null-safe predicate for every new INSERT and UPDATE.
BEGIN;
ALTER TABLE "WorkoutSessionExecutionItem"
  DROP CONSTRAINT "WorkoutSessionExecutionItem_substituted_link_required";
ALTER TABLE "WorkoutSessionExecutionItem"
  ADD CONSTRAINT "WorkoutSessionExecutionItem_substituted_link_required"
  CHECK (
    ("outcome" IS NOT DISTINCT FROM 'substituted' AND "substitutionId" IS NOT NULL)
    OR ("outcome" IS DISTINCT FROM 'substituted' AND "substitutionId" IS NULL)
  ) NOT VALID;
COMMIT;

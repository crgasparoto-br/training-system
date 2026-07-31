BEGIN;

-- Issue #246 audit remediation.
-- `maturationCriteria` is descriptive clinical text and must never be promoted
-- to an executable eligibility rule. Every APPROVED protocol must persist an
-- explicit `population.maturationRule` that passed the canonical validator.
--
-- This migration intentionally performs no inference and no backfill. A
-- follow-up cleanup migration removes the trigger/function from development
-- databases that applied an earlier branch revision before this correction.

COMMIT;

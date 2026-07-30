-- Composite references make contract isolation a database invariant.
ALTER TABLE "AnthropometryAssessment"
  ADD CONSTRAINT "AnthropometryAssessment_id_contractId_key" UNIQUE ("id", "contractId");

ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_id_contractId_key" UNIQUE ("id", "contractId");

ALTER TABLE "AdipometryAssessment"
  DROP CONSTRAINT "AdipometryAssessment_anthropometryAssessmentId_fkey";
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_anthropometryAssessmentId_contractId_fkey"
  FOREIGN KEY ("anthropometryAssessmentId", "contractId")
  REFERENCES "AnthropometryAssessment"("id", "contractId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdipometryAssessment"
  DROP CONSTRAINT "AdipometryAssessment_correctsAssessmentId_fkey";
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_correctsAssessmentId_contractId_fkey"
  FOREIGN KEY ("correctsAssessmentId", "contractId")
  REFERENCES "AdipometryAssessment"("id", "contractId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdipometryAssessment"
  DROP CONSTRAINT "AdipometryAssessment_correctedByAssessmentId_fkey";
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_correctedByAssessmentId_contractId_fkey"
  FOREIGN KEY ("correctedByAssessmentId", "contractId")
  REFERENCES "AdipometryAssessment"("id", "contractId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

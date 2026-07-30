-- Prisma requires the full defining field set of one-to-one composite
-- relations to be unique, even when the nullable target id is already unique.
CREATE UNIQUE INDEX "AdipometryAssessment_correctsAssessmentId_contractId_alunoId_key"
  ON "AdipometryAssessment"("correctsAssessmentId", "contractId", "alunoId");

CREATE UNIQUE INDEX "AdipometryAssessment_correctedByAssessmentId_contractId_alunoId_key"
  ON "AdipometryAssessment"("correctedByAssessmentId", "contractId", "alunoId");

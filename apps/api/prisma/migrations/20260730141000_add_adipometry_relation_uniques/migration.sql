-- Prisma requires the full defining field set of one-to-one composite
-- relations to be unique, even when the nullable target id is already unique.
CREATE UNIQUE INDEX "AdptAssess_corrects_contract_aluno_key"
  ON "AdipometryAssessment"("correctsAssessmentId", "contractId", "alunoId");

CREATE UNIQUE INDEX "AdptAssess_corrected_by_contract_aluno_key"
  ON "AdipometryAssessment"("correctedByAssessmentId", "contractId", "alunoId");

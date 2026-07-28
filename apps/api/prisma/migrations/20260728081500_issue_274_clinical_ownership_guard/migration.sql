-- Issue #274 / A-001: impede consolidacao de duplicidade quando qualquer
-- registro owned por outro dominio ainda pertence ao cadastro de origem.
--
-- O preflight da aplicacao devolve o erro de dominio no caminho normal. Este trigger
-- fecha a janela de concorrencia no commit e tambem protege chamadas diretas ou
-- futuras rotas que tentem descartar a origem sem reassociacao transacional.
-- Dados de processo e auditoria permanecem no registro de origem como historico,
-- conforme o contrato da issue; dados operacionais, clinicos, comerciais, de treino,
-- avaliacao, integracao e nutricao exigem reassociacao assistida e bloqueiam.

CREATE OR REPLACE FUNCTION "block_duplicate_consolidation_with_owned_health_data"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" = 'DISCARDED'
     AND COALESCE(NEW."discardReason", '') LIKE 'DUPLICATE_OF:%'
     AND (
       OLD."status" IS DISTINCT FROM NEW."status"
       OR OLD."discardReason" IS DISTINCT FROM NEW."discardReason"
       OR OLD."canonicalAlunoId" IS DISTINCT FROM NEW."canonicalAlunoId"
     )
     AND EXISTS (
       SELECT 1 FROM "AgendaBooking" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "AnthropometryAssessment" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "AlunoExerciseProgress" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "AlunoIntakeForm" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "AlunoAssessmentPlanItem" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "Assessment" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "Contract" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "StudentContract" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "FixedScheduleSlot" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "Integration" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "Macronutrients" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "NutritionPlan" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "ProgressMetric" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "TrainingExecution" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "TrainingPlan" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "WorkoutExecution" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "StudentHealthIntake" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "StudentAssessmentRecord" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "StudentFinancialProfile" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "StudentExternalAccount" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "StudentExternalActivity" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "StudentParqSubmission" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "StudentParqDraft" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "StudentParqProfessionalReview" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "StudentParqLegacyRecord" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "ProntuarioRecord" WHERE "alunoId" = NEW."id"
       UNION ALL SELECT 1 FROM "ProntuarioDiscomfortSnapshot" WHERE "alunoId" = NEW."id"
     )
  THEN
    RAISE EXCEPTION 'CLINICAL_REASSOCIATION_REQUIRED'
      USING ERRCODE = 'P0001',
            DETAIL = 'A consolidacao exige reassociacao transacional dos dados pertencentes ao cadastro de origem.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Aluno_block_duplicate_consolidation_with_owned_health_data"
ON "Aluno";

CREATE TRIGGER "Aluno_block_duplicate_consolidation_with_owned_health_data"
BEFORE UPDATE OF "status", "discardReason", "canonicalAlunoId"
ON "Aluno"
FOR EACH ROW
EXECUTE FUNCTION "block_duplicate_consolidation_with_owned_health_data"();

-- Issue #274 / AUD-274-20: campos clinicos legados armazenados diretamente
-- em Aluno tambem representam ownership e impedem descarte por duplicidade.
--
-- O servico de dominio faz o preflight no caminho normal. Esta funcao substitui
-- a versao anterior e fecha a janela de concorrencia no commit, incluindo tanto
-- campos escalares quanto registros relacionais que exigem reassociacao assistida.

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
     AND (
       NEW."weight" IS NOT NULL
       OR NEW."height" IS NOT NULL
       OR NEW."bodyFatPercentage" IS NOT NULL
       OR NEW."vo2Max" IS NOT NULL
       OR NEW."anaerobicThreshold" IS NOT NULL
       OR NEW."maxHeartRate" IS NOT NULL
       OR NEW."restingHeartRate" IS NOT NULL
       OR NEW."systolicPressure" IS NOT NULL
       OR NEW."diastolicPressure" IS NOT NULL
       OR EXISTS (
         SELECT 1 FROM "AgendaBooking" WHERE "alunoId" = NEW."id"
         UNION ALL SELECT 1 FROM "AnthropometryAssessment" WHERE "alunoId" = NEW."id"
         UNION ALL SELECT 1 FROM "AlunoExerciseProgress" WHERE "alunoId" = NEW."id"
         UNION ALL SELECT 1 FROM "AlunoIntakeForm" WHERE "alunoId" = NEW."id"
         UNION ALL SELECT 1 FROM "AlunoProfileReviewSettings" WHERE "alunoId" = NEW."id"
         UNION ALL SELECT 1 FROM "AlunoAssessmentPlanItem" WHERE "alunoId" = NEW."id"
         UNION ALL SELECT 1 FROM "Assessment" WHERE "alunoId" = NEW."id"
         -- O model Prisma Contract usa @@map("GeneratedContract").
         UNION ALL SELECT 1 FROM "GeneratedContract" WHERE "alunoId" = NEW."id"
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
         UNION ALL SELECT 1 FROM "PreRegistrationGuardianAuthorization" WHERE "alunoId" = NEW."id"
       )
     )
  THEN
    RAISE EXCEPTION 'CLINICAL_REASSOCIATION_REQUIRED'
      USING ERRCODE = 'P0001',
            DETAIL = 'A consolidacao exige reassociacao transacional dos dados pertencentes ao cadastro de origem.';
  END IF;

  RETURN NEW;
END;
$$;

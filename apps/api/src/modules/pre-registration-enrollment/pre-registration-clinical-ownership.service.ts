import type { Prisma, PrismaClient } from '@prisma/client';
import { issue274Prisma } from './issue-274-prisma.js';

export {
  CONSOLIDATION_BLOCKING_OWNERSHIP_RELATIONS,
  CONSOLIDATION_BLOCKING_SCALAR_FIELDS,
  CONSOLIDATION_PRESERVED_SOURCE_HISTORY_RELATIONS,
} from './pre-registration-consolidation-ownership.contract.js';

type DbClient = PrismaClient | Prisma.TransactionClient;

function hasScalarValue(value: number | null | undefined): boolean {
  return value !== null && value !== undefined;
}

export async function hasBlockingOwnershipForConsolidation(
  alunoId: string,
  contractId: string,
  client: DbClient = issue274Prisma
): Promise<boolean> {
  const aluno = await client.aluno.findFirst({
    where: { id: alunoId, contractId },
    select: {
      weight: true,
      height: true,
      bodyFatPercentage: true,
      vo2Max: true,
      anaerobicThreshold: true,
      maxHeartRate: true,
      restingHeartRate: true,
      systolicPressure: true,
      diastolicPressure: true,
      agendaBookings: { select: { id: true }, take: 1 },
      anthropometryAssessments: { select: { id: true }, take: 1 },
      exerciseProgress: { select: { id: true }, take: 1 },
      intakeForm: { select: { id: true } },
      profileReviewSettings: { select: { id: true } },
      assessmentPlanItems: { select: { id: true }, take: 1 },
      assessments: { select: { id: true }, take: 1 },
      contracts: { select: { id: true }, take: 1 },
      studentContracts: { select: { id: true }, take: 1 },
      fixedSlots: { select: { id: true }, take: 1 },
      integrations: { select: { id: true }, take: 1 },
      macronutrients: { select: { id: true } },
      nutritionPlans: { select: { id: true }, take: 1 },
      progressMetrics: { select: { id: true }, take: 1 },
      executions: { select: { id: true }, take: 1 },
      trainingPlans: { select: { id: true }, take: 1 },
      workoutExecutions: { select: { id: true }, take: 1 },
      studentHealthIntake: { select: { id: true } },
      studentAssessmentRecords: { select: { id: true }, take: 1 },
      studentFinancialProfile: { select: { id: true } },
      studentExternalAccounts: { select: { id: true }, take: 1 },
      studentExternalActivities: { select: { id: true }, take: 1 },
      parqSubmissions: { select: { id: true }, take: 1 },
      parqDraft: { select: { id: true } },
      parqProfessionalReviews: { select: { id: true }, take: 1 },
      parqLegacyRecords: { select: { id: true }, take: 1 },
      prontuarioRecords: { select: { id: true }, take: 1 },
      prontuarioDiscomfortSnapshots: { select: { id: true }, take: 1 },
      guardianAuthorizations: { select: { id: true }, take: 1 },
    },
  });

  if (!aluno) return false;

  return Boolean(
    hasScalarValue(aluno.weight) ||
      hasScalarValue(aluno.height) ||
      hasScalarValue(aluno.bodyFatPercentage) ||
      hasScalarValue(aluno.vo2Max) ||
      hasScalarValue(aluno.anaerobicThreshold) ||
      hasScalarValue(aluno.maxHeartRate) ||
      hasScalarValue(aluno.restingHeartRate) ||
      hasScalarValue(aluno.systolicPressure) ||
      hasScalarValue(aluno.diastolicPressure) ||
      aluno.agendaBookings.length ||
      aluno.anthropometryAssessments.length ||
      aluno.exerciseProgress.length ||
      aluno.intakeForm ||
      aluno.profileReviewSettings ||
      aluno.assessmentPlanItems.length ||
      aluno.assessments.length ||
      aluno.contracts.length ||
      aluno.studentContracts.length ||
      aluno.fixedSlots.length ||
      aluno.integrations.length ||
      aluno.macronutrients ||
      aluno.nutritionPlans.length ||
      aluno.progressMetrics.length ||
      aluno.executions.length ||
      aluno.trainingPlans.length ||
      aluno.workoutExecutions.length ||
      aluno.studentHealthIntake ||
      aluno.studentAssessmentRecords.length ||
      aluno.studentFinancialProfile ||
      aluno.studentExternalAccounts.length ||
      aluno.studentExternalActivities.length ||
      aluno.parqSubmissions.length ||
      aluno.parqDraft ||
      aluno.parqProfessionalReviews.length ||
      aluno.parqLegacyRecords.length ||
      aluno.prontuarioRecords.length ||
      aluno.prontuarioDiscomfortSnapshots.length ||
      aluno.guardianAuthorizations.length
  );
}

export function isClinicalReassociationDatabaseError(error: unknown): boolean {
  if (!error) return false;
  const candidate = error as {
    message?: unknown;
    meta?: unknown;
    cause?: unknown;
  };
  const serialized = [candidate.message, candidate.meta, candidate.cause]
    .map((value) => {
      if (typeof value === 'string') return value;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value ?? '');
      }
    })
    .join(' ');
  return serialized.includes('CLINICAL_REASSOCIATION_REQUIRED');
}

import type { Prisma, PrismaClient } from '@prisma/client';
import { issue274Prisma } from './issue-274-prisma.js';

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Relações cujo ownership não pode permanecer em uma origem descartada por
 * duplicidade. Enquanto não existir reassociação transacional por domínio,
 * qualquer ocorrência bloqueia a consolidação.
 */
export const CONSOLIDATION_BLOCKING_OWNERSHIP_RELATIONS = [
  'agendaBookings',
  'anthropometryAssessments',
  'exerciseProgress',
  'intakeForm',
  'profileReviewSettings',
  'assessmentPlanItems',
  'assessments',
  'contracts',
  'studentContracts',
  'fixedSlots',
  'integrations',
  'macronutrients',
  'nutritionPlans',
  'progressMetrics',
  'executions',
  'trainingPlans',
  'workoutExecutions',
  'studentHealthIntake',
  'studentAssessmentRecords',
  'studentFinancialProfile',
  'studentExternalAccounts',
  'studentExternalActivities',
  'parqSubmissions',
  'parqDraft',
  'parqProfessionalReviews',
  'parqLegacyRecords',
  'prontuarioRecords',
  'prontuarioDiscomfortSnapshots',
  'guardianAuthorizations',
] as const;

/**
 * Relações que permanecem no registro descartado como histórico do processo e
 * da auditoria, conforme o contrato da issue. Não são movidas nem usadas como
 * motivo para apagar a origem.
 */
export const CONSOLIDATION_PRESERVED_SOURCE_HISTORY_RELATIONS = [
  'studentProfile',
  'profileReviews',
  'profileAuditLogs',
  'onboarding',
  'lifecycleEvents',
  'preRegistrationInvites',
] as const;

export async function hasBlockingOwnershipForConsolidation(
  alunoId: string,
  contractId: string,
  client: DbClient = issue274Prisma
): Promise<boolean> {
  const aluno = await client.aluno.findFirst({
    where: { id: alunoId, contractId },
    select: {
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

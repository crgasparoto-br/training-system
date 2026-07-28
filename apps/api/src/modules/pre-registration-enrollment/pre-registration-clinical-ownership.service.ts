import type { Prisma, PrismaClient } from '@prisma/client';
import { issue274Prisma } from './issue-274-prisma.js';

type DbClient = PrismaClient | Prisma.TransactionClient;

export const CLINICAL_CONSOLIDATION_OWNERSHIP_RELATIONS = [
  'intakeForm',
  'studentHealthIntake',
  'parqDraft',
  'parqSubmissions',
  'parqProfessionalReviews',
  'parqLegacyRecords',
  'prontuarioRecords',
  'prontuarioDiscomfortSnapshots',
  'studentAssessmentRecords',
  'assessments',
  'anthropometryAssessments',
  'assessmentPlanItems',
  'progressMetrics',
  'macronutrients',
  'nutritionPlans',
] as const;

export async function hasOwnedHealthDataForConsolidation(
  alunoId: string,
  contractId: string,
  client: DbClient = issue274Prisma
): Promise<boolean> {
  const aluno = await client.aluno.findFirst({
    where: { id: alunoId, contractId },
    select: {
      intakeForm: { select: { id: true } },
      studentHealthIntake: { select: { id: true } },
      parqDraft: { select: { id: true } },
      parqSubmissions: { select: { id: true }, take: 1 },
      parqProfessionalReviews: { select: { id: true }, take: 1 },
      parqLegacyRecords: { select: { id: true }, take: 1 },
      prontuarioRecords: { select: { id: true }, take: 1 },
      prontuarioDiscomfortSnapshots: { select: { id: true }, take: 1 },
      studentAssessmentRecords: { select: { id: true }, take: 1 },
      assessments: { select: { id: true }, take: 1 },
      anthropometryAssessments: { select: { id: true }, take: 1 },
      assessmentPlanItems: { select: { id: true }, take: 1 },
      progressMetrics: { select: { id: true }, take: 1 },
      macronutrients: { select: { id: true } },
      nutritionPlans: { select: { id: true }, take: 1 },
    },
  });

  if (!aluno) return false;

  return Boolean(
    aluno.intakeForm ||
      aluno.studentHealthIntake ||
      aluno.parqDraft ||
      aluno.parqSubmissions.length ||
      aluno.parqProfessionalReviews.length ||
      aluno.parqLegacyRecords.length ||
      aluno.prontuarioRecords.length ||
      aluno.prontuarioDiscomfortSnapshots.length ||
      aluno.studentAssessmentRecords.length ||
      aluno.assessments.length ||
      aluno.anthropometryAssessments.length ||
      aluno.assessmentPlanItems.length ||
      aluno.progressMetrics.length ||
      aluno.macronutrients ||
      aluno.nutritionPlans.length
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

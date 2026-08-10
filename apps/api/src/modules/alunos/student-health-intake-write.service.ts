import type { Prisma } from '@prisma/client';

export type LegacyHealthIntakeWriteInput = {
  assessmentDate?: Date | null;
  mainGoal?: string | null;
  medicalHistory?: string | null;
  currentMedications?: string | null;
  injuriesHistory?: string | null;
  trainingBackground?: string | null;
  observations?: string | null;
};

export class CompletedHealthIntakeMutationError extends Error {
  readonly code = 'HEALTH_INTAKE_COMPLETED';
  readonly statusCode = 409;

  constructor() {
    super(
      'A Anamnese concluída não pode ser alterada por fluxos genéricos. Inicie uma revisão auditável para corrigir as respostas.'
    );
    this.name = 'CompletedHealthIntakeMutationError';
  }
}

type JsonRecord = Record<string, unknown>;

const cleanText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const normalizedText = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

const hasOwn = (value: object, key: keyof LegacyHealthIntakeWriteInput) =>
  Object.prototype.hasOwnProperty.call(value, key);

const hasDefined = (value: LegacyHealthIntakeWriteInput, key: keyof LegacyHealthIntakeWriteInput) =>
  hasOwn(value, key) && value[key] !== undefined;

const jsonRecord = (value: Prisma.JsonValue | null | undefined): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as JsonRecord) }
    : {};

async function lockHealthIntakeOnboarding(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string
) {
  const rawQuery = (tx as Prisma.TransactionClient & {
    $queryRaw?: Prisma.TransactionClient['$queryRaw'];
  }).$queryRaw;

  // Unit-level transaction doubles do not execute SQL. Production Prisma
  // transactions always expose $queryRaw and keep the row-level lock below.
  if (typeof rawQuery !== 'function') return;

  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "StudentOnboardingProcess"
    WHERE "alunoId" = ${alunoId}
      AND "contractId" = ${contractId}
    FOR UPDATE
  `;

  if (rows.length === 0) {
    throw new Error('StudentOnboardingProcess não encontrado para a Anamnese canônica.');
  }
}

export function hasCanonicalHealthIntakeValue(input?: LegacyHealthIntakeWriteInput | null) {
  if (!input) return false;
  return Boolean(
    input.assessmentDate ||
      cleanText(input.mainGoal) ||
      cleanText(input.medicalHistory) ||
      cleanText(input.currentMedications) ||
      cleanText(input.injuriesHistory) ||
      cleanText(input.trainingBackground) ||
      cleanText(input.observations)
  );
}

export function hasCanonicalHealthIntakeMutation(input?: LegacyHealthIntakeWriteInput | null) {
  if (!input) return false;
  return (
    hasDefined(input, 'assessmentDate') ||
    hasDefined(input, 'mainGoal') ||
    hasDefined(input, 'medicalHistory') ||
    hasDefined(input, 'currentMedications') ||
    hasDefined(input, 'injuriesHistory') ||
    hasDefined(input, 'trainingBackground') ||
    hasDefined(input, 'observations')
  );
}

export async function upsertCanonicalStudentHealthIntake(
  tx: Prisma.TransactionClient,
  input: {
    alunoId: string;
    contractId: string;
    sourceType: 'student' | 'professional' | 'integration' | 'system';
    sourceReference: string;
    recordedByUserId?: string;
    health: LegacyHealthIntakeWriteInput;
  }
) {
  if (!hasCanonicalHealthIntakeMutation(input.health)) return null;

  await lockHealthIntakeOnboarding(tx, input.alunoId, input.contractId);

  const existing = await tx.studentHealthIntake.findUnique({
    where: { alunoId: input.alunoId },
  });
  if (existing?.status === 'COMPLETED' || existing?.completedAt) {
    throw new CompletedHealthIntakeMutationError();
  }

  const clinicalHistory = jsonRecord(existing?.clinicalHistoryData);
  const medication = jsonRecord(existing?.medicationData);
  const injury = jsonRecord(existing?.injuryData);

  if (hasDefined(input.health, 'mainGoal')) {
    clinicalHistory.mainGoal = normalizedText(input.health.mainGoal);
  }
  if (hasDefined(input.health, 'medicalHistory')) {
    clinicalHistory.medicalHistory = normalizedText(input.health.medicalHistory);
  }
  if (hasDefined(input.health, 'trainingBackground')) {
    clinicalHistory.trainingBackground = normalizedText(input.health.trainingBackground);
  }
  if (hasDefined(input.health, 'currentMedications')) {
    medication.currentMedications = normalizedText(input.health.currentMedications);
  }
  if (hasDefined(input.health, 'injuriesHistory')) {
    injury.injuriesHistory = normalizedText(input.health.injuriesHistory);
  }

  const observations = hasDefined(input.health, 'observations')
    ? normalizedText(input.health.observations)
    : existing?.observations ?? undefined;

  const now = new Date();
  const data = {
    contractId: input.contractId,
    sourceType: input.sourceType,
    sourceReference: input.sourceReference,
    recordedByUserId: input.recordedByUserId,
    formVersion: 'health-intake-v1',
    status: 'IN_PROGRESS' as const,
    currentStep: 'REVIEW',
    ...(hasDefined(input.health, 'assessmentDate')
      ? { assessmentDate: input.health.assessmentDate }
      : {}),
    clinicalHistoryData: clinicalHistory as Prisma.InputJsonValue,
    medicationData: medication as Prisma.InputJsonValue,
    injuryData: injury as Prisma.InputJsonValue,
    observations,
    respondentRole:
      input.sourceType === 'professional'
        ? 'PROFESSIONAL'
        : input.sourceType === 'student'
          ? 'STUDENT'
          : 'SYSTEM',
    respondentUserId: input.recordedByUserId,
    lastSavedAt: now,
  };

  const intake = await tx.studentHealthIntake.upsert({
    where: { alunoId: input.alunoId },
    create: {
      alunoId: input.alunoId,
      ...data,
    },
    update: {
      ...data,
      version: { increment: 1 },
    },
  });

  await tx.studentOnboardingProcess.updateMany({
    where: { alunoId: input.alunoId, contractId: input.contractId },
    data: {
      healthIntakeId: intake.id,
      healthModuleStatus: intake.status,
      ...(!existing ? { healthStartedAt: now } : {}),
      healthLastSavedAt: now,
    },
  });

  return intake;
}

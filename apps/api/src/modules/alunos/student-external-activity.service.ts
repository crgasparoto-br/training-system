import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

type DbClient = PrismaClient | Prisma.TransactionClient;

type StudentExternalActivitySourceType = 'integration' | 'system';

export type UpsertStudentExternalActivityInput = {
  externalAccountId: string;
  alunoId: string;
  contractId: string;
  provider: string;
  externalActivityId: string;
  activityType?: string | null;
  startedAt: Date | string;
  endedAt?: Date | string | null;
  distanceMeters?: number | Prisma.Decimal | null;
  durationSeconds?: number | null;
  paceSecondsPerKm?: number | Prisma.Decimal | null;
  averageHeartRate?: number | null;
  maxHeartRate?: number | null;
  calories?: number | Prisma.Decimal | null;
  elevationGainMeters?: number | Prisma.Decimal | null;
  rawPayload?: Prisma.InputJsonValue | null;
  importedAt?: Date | string | null;
  sourceType?: StudentExternalActivitySourceType;
  sourceReference?: string | null;
  recordedByUserId?: string | null;
  linkedTrainingExecutionId?: string | null;
};

export type UpsertFromTrainingExecutionReferenceInput = {
  externalAccountId: string;
  alunoId: string;
  contractId: string;
  provider: string;
  externalActivityId: string;
  trainingExecutionId: string;
  executedDate?: Date | string | null;
  plannedDate: Date | string;
  createdAt?: Date | string | null;
};

const normalizeProvider = (provider: string) => {
  const normalized = provider.trim().toLowerCase();

  if (!normalized) {
    throw new Error('Provider da atividade externa é obrigatório');
  }

  return normalized;
};

const toDate = (value: Date | string) => {
  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Data inválida para atividade externa');
  }

  return parsed;
};

const toOptionalDate = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isJsonObject = (value: Prisma.InputJsonValue | null | undefined): value is Prisma.InputJsonObject => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const mergeRawPayload = (
  payload: Prisma.InputJsonValue | null | undefined,
  linkedTrainingExecutionId: string | null,
  linkSource: 'matched_by_provider_activity_id' | 'backfill_training_execution_reference'
): Prisma.InputJsonValue | null => {
  if (!linkedTrainingExecutionId) {
    return payload ?? null;
  }

  const linkage = {
    linkedTrainingExecutionId,
    trainingExecutionLinkSource: linkSource,
  };

  if (isJsonObject(payload)) {
    return {
      ...payload,
      ...linkage,
    };
  }

  if (payload === null || payload === undefined) {
    return linkage;
  }

  return {
    originalPayload: payload,
    ...linkage,
  };
};

const resolveLinkedTrainingExecutionId = async (
  input: {
    alunoId: string;
    provider: string;
    externalActivityId: string;
  },
  client: DbClient
) => {
  const provider = normalizeProvider(input.provider);

  if (provider !== 'garmin' && provider !== 'strava') {
    return null;
  }

  const execution = await client.trainingExecution.findFirst({
    where:
      provider === 'garmin'
        ? {
            alunoId: input.alunoId,
            garminActivityId: input.externalActivityId,
          }
        : {
            alunoId: input.alunoId,
            stravaActivityId: input.externalActivityId,
          },
    select: {
      id: true,
    },
  });

  return execution?.id ?? null;
};

export const studentExternalActivityService = {
  async upsert(data: UpsertStudentExternalActivityInput, client: DbClient = prisma) {
    const provider = normalizeProvider(data.provider);
    const linkedTrainingExecutionId =
      data.linkedTrainingExecutionId !== undefined
        ? data.linkedTrainingExecutionId
        : await resolveLinkedTrainingExecutionId(
            {
              alunoId: data.alunoId,
              provider,
              externalActivityId: data.externalActivityId,
            },
            client
          );

    const rawPayload = mergeRawPayload(
      data.rawPayload,
      linkedTrainingExecutionId ?? null,
      'matched_by_provider_activity_id'
    );

    const createData: Prisma.StudentExternalActivityUncheckedCreateInput = {
      externalAccountId: data.externalAccountId,
      alunoId: data.alunoId,
      contractId: data.contractId,
      provider,
      externalActivityId: data.externalActivityId,
      sourceType: data.sourceType ?? 'integration',
      startedAt: toDate(data.startedAt),
      importedAt: toOptionalDate(data.importedAt) ?? new Date(),
      rawPayload,
    };

    const updateData: Prisma.StudentExternalActivityUncheckedUpdateInput = {
      contractId: data.contractId,
      provider,
      sourceType: data.sourceType ?? 'integration',
      startedAt: toDate(data.startedAt),
      importedAt: toOptionalDate(data.importedAt) ?? new Date(),
      rawPayload,
    };

    if (data.activityType !== undefined) {
      createData.activityType = data.activityType;
      updateData.activityType = data.activityType;
    }

    if (data.endedAt !== undefined) {
      const endedAt = toOptionalDate(data.endedAt);
      createData.endedAt = endedAt;
      updateData.endedAt = endedAt;
    }

    if (data.distanceMeters !== undefined) {
      createData.distanceMeters = data.distanceMeters;
      updateData.distanceMeters = data.distanceMeters;
    }

    if (data.durationSeconds !== undefined) {
      createData.durationSeconds = data.durationSeconds;
      updateData.durationSeconds = data.durationSeconds;
    }

    if (data.paceSecondsPerKm !== undefined) {
      createData.paceSecondsPerKm = data.paceSecondsPerKm;
      updateData.paceSecondsPerKm = data.paceSecondsPerKm;
    }

    if (data.averageHeartRate !== undefined) {
      createData.averageHeartRate = data.averageHeartRate;
      updateData.averageHeartRate = data.averageHeartRate;
    }

    if (data.maxHeartRate !== undefined) {
      createData.maxHeartRate = data.maxHeartRate;
      updateData.maxHeartRate = data.maxHeartRate;
    }

    if (data.calories !== undefined) {
      createData.calories = data.calories;
      updateData.calories = data.calories;
    }

    if (data.elevationGainMeters !== undefined) {
      createData.elevationGainMeters = data.elevationGainMeters;
      updateData.elevationGainMeters = data.elevationGainMeters;
    }

    if (data.sourceReference !== undefined) {
      createData.sourceReference = data.sourceReference;
      updateData.sourceReference = data.sourceReference;
    }

    if (data.recordedByUserId !== undefined) {
      createData.recordedByUserId = data.recordedByUserId;
      updateData.recordedByUserId = data.recordedByUserId;
    }

    return client.studentExternalActivity.upsert({
      where: {
        externalAccountId_externalActivityId: {
          externalAccountId: data.externalAccountId,
          externalActivityId: data.externalActivityId,
        },
      },
      create: createData,
      update: updateData,
    });
  },

  async upsertFromTrainingExecutionReference(
    data: UpsertFromTrainingExecutionReferenceInput,
    client: DbClient = prisma
  ) {
    const startedAt = data.executedDate ?? data.plannedDate;
    const importedAt = data.createdAt ?? data.executedDate ?? data.plannedDate;

    return studentExternalActivityService.upsert(
      {
        externalAccountId: data.externalAccountId,
        alunoId: data.alunoId,
        contractId: data.contractId,
        provider: data.provider,
        externalActivityId: data.externalActivityId,
        startedAt,
        importedAt,
        sourceType: 'system',
        sourceReference: data.trainingExecutionId,
        linkedTrainingExecutionId: data.trainingExecutionId,
        rawPayload: mergeRawPayload(
          {
            backfilledFrom: 'training_execution_reference',
          },
          data.trainingExecutionId,
          'backfill_training_execution_reference'
        ),
      },
      client
    );
  },
};
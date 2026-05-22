import { PrismaClient, type Prisma, type StudentExternalConnectionStatus } from '@prisma/client';

const prisma = new PrismaClient();

type DbClient = PrismaClient | Prisma.TransactionClient;

export type UpsertStudentExternalAccountInput = {
  alunoId: string;
  contractId: string;
  provider: string;
  externalUserId?: string | null;
  connectionStatus?: StudentExternalConnectionStatus;
  lastSyncAt?: Date | string | null;
  sourceReference?: string | null;
  recordedByUserId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

export type UpsertFromLegacyIntegrationInput = {
  integrationId: string;
  alunoId: string;
  contractId: string;
  provider: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: Date | string | null;
  lastSync?: Date | string | null;
  externalUserId?: string | null;
  recordedByUserId?: string | null;
};

const normalizeProvider = (provider: string) => {
  const normalized = provider.trim().toLowerCase();

  if (!normalized) {
    throw new Error('Provider da integração é obrigatório');
  }

  return normalized;
};

const toDateOrNull = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const deriveLegacyConnectionStatus = (input: {
  accessToken?: string | null;
  refreshToken?: string | null;
}): StudentExternalConnectionStatus => {
  return input.accessToken || input.refreshToken ? 'connected' : 'pending';
};

const buildLegacyMetadata = (
  input: UpsertFromLegacyIntegrationInput
): Prisma.InputJsonValue => ({
  migratedFrom: 'legacy_integration',
  legacyIntegrationId: input.integrationId,
  legacyExpiresAt: toDateOrNull(input.expiresAt)?.toISOString() ?? null,
  hasAccessToken: Boolean(input.accessToken),
  hasRefreshToken: Boolean(input.refreshToken),
});

const buildUpsertPayload = (input: UpsertStudentExternalAccountInput) => {
  const provider = normalizeProvider(input.provider);
  const createData: Prisma.StudentExternalAccountUncheckedCreateInput = {
    alunoId: input.alunoId,
    contractId: input.contractId,
    provider,
    connectionStatus: input.connectionStatus ?? 'pending',
    sourceType: 'integration',
  };
  const updateData: Prisma.StudentExternalAccountUncheckedUpdateInput = {
    contractId: input.contractId,
    connectionStatus: input.connectionStatus ?? 'pending',
    sourceType: 'integration',
  };

  if (input.externalUserId !== undefined) {
    createData.externalUserId = input.externalUserId;
    updateData.externalUserId = input.externalUserId;
  }

  if (input.lastSyncAt !== undefined) {
    const lastSyncAt = toDateOrNull(input.lastSyncAt);
    createData.lastSyncAt = lastSyncAt;
    updateData.lastSyncAt = lastSyncAt;
  }

  if (input.sourceReference !== undefined) {
    createData.sourceReference = input.sourceReference;
    updateData.sourceReference = input.sourceReference;
  }

  if (input.recordedByUserId !== undefined) {
    createData.recordedByUserId = input.recordedByUserId;
    updateData.recordedByUserId = input.recordedByUserId;
  }

  if (input.metadata !== undefined) {
    createData.metadata = input.metadata;
    updateData.metadata = input.metadata;
  }

  return {
    provider,
    createData,
    updateData,
  };
};

export const studentExternalAccountService = {
  async upsert(data: UpsertStudentExternalAccountInput, client: DbClient = prisma) {
    const payload = buildUpsertPayload(data);

    return client.studentExternalAccount.upsert({
      where: {
        alunoId_provider: {
          alunoId: data.alunoId,
          provider: payload.provider,
        },
      },
      create: payload.createData,
      update: payload.updateData,
    });
  },

  async upsertFromLegacyIntegration(
    data: UpsertFromLegacyIntegrationInput,
    client: DbClient = prisma
  ) {
    return studentExternalAccountService.upsert(
      {
        alunoId: data.alunoId,
        contractId: data.contractId,
        provider: data.provider,
        externalUserId: data.externalUserId ?? null,
        connectionStatus: deriveLegacyConnectionStatus(data),
        lastSyncAt: data.lastSync ?? null,
        sourceReference: data.integrationId,
        recordedByUserId: data.recordedByUserId ?? null,
        metadata: buildLegacyMetadata(data),
      },
      client
    );
  },
};
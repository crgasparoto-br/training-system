const upsertMock = jest.fn();
const mockPrisma = {
  studentExternalAccount: {
    upsert: upsertMock,
  },
};

jest.mock('@prisma/client', () => ({
  Prisma: {
    JsonNull: null,
  },
  PrismaClient: jest.fn(() => mockPrisma),
}));

import { studentExternalAccountService } from '../src/modules/alunos/student-external-account.service';

describe('studentExternalAccountService', () => {
  beforeEach(() => {
    upsertMock.mockReset();
    upsertMock.mockResolvedValue({ id: 'acc-1' });
  });

  it('upserts segmented accounts by aluno and normalized provider', async () => {
    await studentExternalAccountService.upsert({
      alunoId: 'aluno-1',
      contractId: 'contract-1',
      provider: ' Strava ',
      externalUserId: 'strava-user-1',
      connectionStatus: 'connected',
      lastSyncAt: '2026-05-22T10:00:00.000Z',
      sourceReference: 'oauth:strava:connection-1',
      recordedByUserId: 'user-1',
      metadata: {
        importedFrom: 'oauth',
      },
    });

    expect(upsertMock).toHaveBeenCalledWith({
      where: {
        alunoId_provider: {
          alunoId: 'aluno-1',
          provider: 'strava',
        },
      },
      create: {
        alunoId: 'aluno-1',
        contractId: 'contract-1',
        provider: 'strava',
        externalUserId: 'strava-user-1',
        connectionStatus: 'connected',
        sourceType: 'integration',
        lastSyncAt: new Date('2026-05-22T10:00:00.000Z'),
        sourceReference: 'oauth:strava:connection-1',
        recordedByUserId: 'user-1',
        metadata: {
          importedFrom: 'oauth',
        },
      },
      update: {
        contractId: 'contract-1',
        connectionStatus: 'connected',
        sourceType: 'integration',
        externalUserId: 'strava-user-1',
        lastSyncAt: new Date('2026-05-22T10:00:00.000Z'),
        sourceReference: 'oauth:strava:connection-1',
        recordedByUserId: 'user-1',
        metadata: {
          importedFrom: 'oauth',
        },
      },
    });
  });

  it('derives safe metadata and connection status from legacy integrations', async () => {
    await studentExternalAccountService.upsertFromLegacyIntegration({
      integrationId: 'legacy-int-1',
      alunoId: 'aluno-1',
      contractId: 'contract-1',
      provider: 'GARMIN',
      accessToken: 'secret-access-token',
      refreshToken: 'secret-refresh-token',
      expiresAt: '2026-06-01T00:00:00.000Z',
      lastSync: '2026-05-20T09:00:00.000Z',
      externalUserId: 'garmin-user-1',
      recordedByUserId: 'user-prof-1',
    });

    const payload = upsertMock.mock.calls[0][0];

    expect(payload.where).toEqual({
      alunoId_provider: {
        alunoId: 'aluno-1',
        provider: 'garmin',
      },
    });
    expect(payload.create.connectionStatus).toBe('connected');
    expect(payload.create.sourceReference).toBe('legacy-int-1');
    expect(payload.create.recordedByUserId).toBe('user-prof-1');
    expect(payload.create.lastSyncAt).toEqual(new Date('2026-05-20T09:00:00.000Z'));
    expect(payload.create.metadata).toEqual({
      migratedFrom: 'legacy_integration',
      legacyIntegrationId: 'legacy-int-1',
      legacyExpiresAt: '2026-06-01T00:00:00.000Z',
      hasAccessToken: true,
      hasRefreshToken: true,
    });
    expect(payload.create.metadata).not.toHaveProperty('accessToken');
    expect(payload.create.metadata).not.toHaveProperty('refreshToken');
  });

  it('falls back to pending status when legacy integration has no tokens', async () => {
    await studentExternalAccountService.upsertFromLegacyIntegration({
      integrationId: 'legacy-int-2',
      alunoId: 'aluno-2',
      contractId: 'contract-2',
      provider: 'strava',
      accessToken: null,
      refreshToken: null,
    });

    const payload = upsertMock.mock.calls[0][0];

    expect(payload.create.connectionStatus).toBe('pending');
    expect(payload.create.metadata).toMatchObject({
      hasAccessToken: false,
      hasRefreshToken: false,
    });
  });
});

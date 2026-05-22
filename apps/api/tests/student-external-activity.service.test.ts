const findFirstMock = jest.fn();
const upsertMock = jest.fn();
const mockPrisma = {
  trainingExecution: {
    findFirst: findFirstMock,
  },
  studentExternalActivity: {
    upsert: upsertMock,
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

import { studentExternalActivityService } from '../src/modules/alunos/student-external-activity.service';

describe('studentExternalActivityService', () => {
  beforeEach(() => {
    findFirstMock.mockReset();
    upsertMock.mockReset();
    upsertMock.mockResolvedValue({ id: 'activity-1' });
  });

  it('links imported activities to training executions by provider activity id', async () => {
    findFirstMock.mockResolvedValue({ id: 'execution-1' });

    await studentExternalActivityService.upsert({
      externalAccountId: 'account-1',
      alunoId: 'aluno-1',
      contractId: 'contract-1',
      provider: ' GARMIN ',
      externalActivityId: 'garmin-activity-1',
      activityType: 'run',
      startedAt: '2026-05-22T08:00:00.000Z',
      rawPayload: {
        source: 'garmin-webhook',
      },
    });

    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        alunoId: 'aluno-1',
        garminActivityId: 'garmin-activity-1',
      },
      select: {
        id: true,
      },
    });

    expect(upsertMock).toHaveBeenCalledWith({
      where: {
        externalAccountId_externalActivityId: {
          externalAccountId: 'account-1',
          externalActivityId: 'garmin-activity-1',
        },
      },
      create: expect.objectContaining({
        provider: 'garmin',
        sourceType: 'integration',
        activityType: 'run',
        rawPayload: {
          source: 'garmin-webhook',
          linkedTrainingExecutionId: 'execution-1',
          trainingExecutionLinkSource: 'matched_by_provider_activity_id',
        },
      }),
      update: expect.objectContaining({
        provider: 'garmin',
        rawPayload: {
          source: 'garmin-webhook',
          linkedTrainingExecutionId: 'execution-1',
          trainingExecutionLinkSource: 'matched_by_provider_activity_id',
        },
      }),
    });
  });

  it('does not try to link providers without execution reference fields', async () => {
    await studentExternalActivityService.upsert({
      externalAccountId: 'account-2',
      alunoId: 'aluno-2',
      contractId: 'contract-2',
      provider: 'apple_health',
      externalActivityId: 'apple-activity-1',
      startedAt: '2026-05-22T09:00:00.000Z',
    });

    expect(findFirstMock).not.toHaveBeenCalled();
    const payload = upsertMock.mock.calls[0][0];
    expect(payload.create.rawPayload).toBeNull();
  });

  it('backfills skeletal activities from training execution references', async () => {
    await studentExternalActivityService.upsertFromTrainingExecutionReference({
      externalAccountId: 'account-3',
      alunoId: 'aluno-3',
      contractId: 'contract-3',
      provider: 'strava',
      externalActivityId: 'strava-activity-1',
      trainingExecutionId: 'execution-3',
      plannedDate: '2026-05-20T06:00:00.000Z',
      executedDate: '2026-05-20T06:15:00.000Z',
      createdAt: '2026-05-20T07:00:00.000Z',
    });

    expect(findFirstMock).not.toHaveBeenCalled();
    const payload = upsertMock.mock.calls[0][0];

    expect(payload.create).toEqual(
      expect.objectContaining({
        provider: 'strava',
        sourceType: 'system',
        sourceReference: 'execution-3',
        startedAt: new Date('2026-05-20T06:15:00.000Z'),
        importedAt: new Date('2026-05-20T07:00:00.000Z'),
        rawPayload: {
          backfilledFrom: 'training_execution_reference',
          linkedTrainingExecutionId: 'execution-3',
          trainingExecutionLinkSource: 'matched_by_provider_activity_id',
        },
      })
    );
  });
});
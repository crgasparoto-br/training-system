const findUniqueMock = jest.fn();
const lifecycleFindManyMock = jest.fn();
const prntFindManyMock = jest.fn();
const intakeFindManyMock = jest.fn();
const intakeFindFirstMock = jest.fn();
const mockPrisma = {
  aluno: {
    findUnique: findUniqueMock,
    findFirst: findUniqueMock,
  },
  studentLifecycleEvent: {
    findMany: lifecycleFindManyMock,
  },
  prontuarioHistoryEvent: { findMany: prntFindManyMock },
  studentHealthIntakeRevision: { findMany: intakeFindManyMock, findFirst: intakeFindFirstMock },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

jest.mock('../src/modules/student-contracts/student-contract.service', () => ({
  studentContractService: {
    listByAluno: jest.fn(),
  },
}));

import { studentDomainService } from '../src/modules/alunos/student-domain.service';
import { studentContractService } from '../src/modules/student-contracts/student-contract.service';

// Legacy timeline fixtures exercise the whole sequence with explicit test grants.
// Production grants are resolved by the authenticated professor at the route.
const timelineWithPermissions = (
  alunoId: string,
  options: Parameters<typeof studentDomainService.getTimeline>[1] = {},
) => studentDomainService.getTimeline(alunoId, {
  ...options,
  timelineAccess: options.timelineAccess ?? {
    profile: true, health: true, assessments: true,
    financial: true, integrations: true, training: true,
    clinical: { prnt: {}, intake: false, parq: false, anthropometry: false, adipometry: false },
  },
});

const createAlunoSnapshot = () => ({
  id: 'aluno-1',
  age: 30,
  createdAt: '2026-05-01T08:00:00.000Z',
  updatedAt: '2026-05-10T08:00:00.000Z',
  schedulePlan: 'free',
  user: {
    email: 'aluno@example.com',
    isActive: true,
    profile: {
      id: 'profile-1',
      name: 'Aluno Teste',
      updatedAt: '2026-05-10T08:00:00.000Z',
    },
  },
  professor: {
    user: {
      profile: {
        name: 'Professor Responsavel',
      },
    },
  },
  service: null,
  intakeForm: null,
  studentProfile: null,
  studentHealthIntake: null,
  studentAssessmentRecords: [],
  assessments: [],
  studentFinancialProfile: null,
  integrations: [],
  studentExternalAccounts: [
    {
      id: 'acc-1',
      provider: 'garmin',
      externalUserId: 'garmin-user-1',
      sourceType: 'integration',
      sourceReference: 'oauth:garmin:connection-1',
      recordedByUserId: 'user-prof-1',
      connectionStatus: 'connected',
      lastSyncAt: '2026-05-09T12:00:00.000Z',
      metadata: null,
      createdAt: '2026-05-06T09:00:00.000Z',
      updatedAt: '2026-05-09T12:00:00.000Z',
    },
  ],
  studentExternalActivities: [
    {
      id: 'act-1',
      provider: 'garmin',
      externalActivityId: 'garmin-activity-1',
      sourceType: 'integration',
      sourceReference: 'garmin-import-1',
      recordedByUserId: null,
      activityType: 'run',
      startedAt: '2026-05-04T06:00:00.000Z',
      endedAt: '2026-05-04T06:30:00.000Z',
      distanceMeters: 5000,
      durationSeconds: 1800,
      paceSecondsPerKm: 360,
      averageHeartRate: 150,
      maxHeartRate: 170,
      calories: 400,
      elevationGainMeters: 50,
      rawPayload: null,
      importedAt: '2026-05-08T07:00:00.000Z',
      createdAt: '2026-05-08T07:00:00.000Z',
      updatedAt: '2026-05-08T07:00:00.000Z',
    },
  ],
});

const createStudentContract = (overrides: Record<string, unknown> = {}) => ({
  id: 'student-contract-1',
  alunoId: 'aluno-1',
  contractId: 'generated-contract-1',
  serviceId: 'service-1',
  status: 'active',
  startDate: '2026-05-07T08:00:00.000Z',
  endDate: null,
  signedAt: '2026-05-06T08:00:00.000Z',
  canceledAt: null,
  cancellationReason: null,
  amount: 299.9,
  paymentDay: 10,
  notes: 'Observacao contratual',
  createdAt: '2026-05-05T08:00:00.000Z',
  updatedAt: '2026-05-07T08:00:00.000Z',
  contract: {
    id: 'generated-contract-1',
    title: 'Contrato Premium',
    status: 'SIGNED',
    createdAt: '2026-05-05T08:00:00.000Z',
    signedAt: '2026-05-06T08:00:00.000Z',
    cancelledAt: null,
    companyContractId: 'contract-1',
    serviceId: 'service-1',
  },
  service: {
    id: 'service-1',
    name: 'Premium',
    code: 'premium',
    description: null,
    monthlyPrice: 299.9,
    isActive: true,
  },
  ...overrides,
});

describe('studentDomainService', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    lifecycleFindManyMock.mockReset();
    lifecycleFindManyMock.mockResolvedValue([]);
    prntFindManyMock.mockReset().mockResolvedValue([]);
    intakeFindManyMock.mockReset().mockResolvedValue([]);
    intakeFindFirstMock.mockReset().mockResolvedValue(null);
    (studentContractService.listByAluno as jest.Mock).mockReset();
  });

  it('passes companyContractId when loading the segmented financial profile', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'aluno-1',
      studentFinancialProfile: null,
      intakeForm: null,
      service: null,
      updatedAt: '2026-05-22T00:00:00.000Z',
      createdAt: '2026-05-20T00:00:00.000Z',
    });
    (studentContractService.listByAluno as jest.Mock).mockResolvedValue([]);

    await studentDomainService.getFinancialProfile('aluno-1', {
      companyContractId: 'contract-1',
    });

    expect(studentContractService.listByAluno).toHaveBeenCalledWith('aluno-1', {
      companyContractId: 'contract-1',
    });
  });

  it('keeps legacy and segmented assessments together during the additive rollout', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'aluno-1',
      studentAssessmentRecords: [
        {
          id: 'seg-1',
          assessmentCategory: 'anthropometry',
          assessmentCode: 'anthro',
          title: 'Avaliação segmentada',
          performedAt: '2026-05-22T10:00:00.000Z',
          status: 'completed',
          summaryData: null,
          notes: null,
          measurements: [],
          createdAt: '2026-05-22T10:00:00.000Z',
          updatedAt: '2026-05-22T10:00:00.000Z',
        },
      ],
      assessments: [
        {
          id: 'legacy-1',
          assessmentDate: '2026-05-01T10:00:00.000Z',
          filePath: '/files/legacy.pdf',
          originalFileName: 'legacy.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          extractedData: null,
          createdAt: '2026-05-01T10:00:00.000Z',
          updatedAt: '2026-05-01T10:00:00.000Z',
          type: {
            code: 'legacy_complete',
            name: 'Avaliação completa legada',
          },
        },
      ],
    });

    const result = await studentDomainService.listAssessmentRecords('aluno-1');

    expect(result).not.toBeNull();
    expect(result?.hasSegmentedRecords).toBe(true);
    expect(result?.hasLegacyRecords).toBe(true);
    expect(result?.items).toHaveLength(2);
    expect(result?.items.map((item) => item.id)).toEqual(['seg-1', 'legacy-legacy-1']);
  });

  it('fails closed for health, training and finance when no timeline grants are supplied', async () => {
    findUniqueMock.mockResolvedValue(createAlunoSnapshot());
    (studentContractService.listByAluno as jest.Mock).mockResolvedValue([createStudentContract()]);
    const result = await studentDomainService.getTimeline('aluno-1', {
      companyContractId: 'contract-1',
    });
    expect(result?.items.map((item) => item.type)).toEqual(['student_created']);
    expect(lifecycleFindManyMock).not.toHaveBeenCalled();
  });

  it('builds timeline events with contract milestones and import traceability', async () => {
    findUniqueMock.mockResolvedValue(createAlunoSnapshot());
    (studentContractService.listByAluno as jest.Mock).mockResolvedValue([createStudentContract()]);

    const result = await timelineWithPermissions('aluno-1', {
      companyContractId: 'contract-1',
    });

    expect(studentContractService.listByAluno).toHaveBeenCalledWith('aluno-1', {
      companyContractId: 'contract-1',
    });
    expect(result).not.toBeNull();
    expect(result?.items.map((item) => item.type)).toEqual([
      'profile_updated',
      'integration_synchronized',
      'external_activity_imported',
      'financial_contract_started',
      'integration_connected',
      'financial_contract_signed',
      'financial_contract_created',
      'student_created',
    ]);

    const importedActivity = result?.items.find((item) => item.type === 'external_activity_imported');
    expect(importedActivity?.occurredAt).toBe('2026-05-08T07:00:00.000Z');
    expect(importedActivity?.source).toEqual({
      type: 'integration',
      reference: 'garmin-import-1',
      recordedByUserId: null,
    });
    expect(importedActivity?.details).toMatchObject({
      provider: 'garmin',
      startedAt: '2026-05-04T06:00:00.000Z',
    });

    const connectedIntegration = result?.items.find((item) => item.type === 'integration_connected');
    expect(connectedIntegration?.source).toEqual({
      type: 'integration',
      reference: 'oauth:garmin:connection-1',
      recordedByUserId: 'user-prof-1',
    });

    const startedContract = result?.items.find((item) => item.type === 'financial_contract_started');
    expect(startedContract?.details).toMatchObject({
      status: 'active',
      serviceName: 'Premium',
    });
    expect(result?.items.some((item) => item.type === 'intake_recorded' || item.type === 'intake_updated')).toBe(false);
  });

  it('projects canonical training lifecycle events into the student timeline without sensitive feedback values', async () => {
    findUniqueMock.mockResolvedValue({
      ...createAlunoSnapshot(),
      studentExternalAccounts: [],
      studentExternalActivities: [],
    });
    (studentContractService.listByAluno as jest.Mock).mockResolvedValue([]);
    lifecycleFindManyMock.mockResolvedValue([
      {
        id: 'evt-feedback',
        alunoId: 'aluno-1',
        contractId: 'contract-1',
        eventType: 'STATUS_CHANGED',
        actorUserId: 'student-user-1',
        createdAt: '2026-05-12T10:15:00.000Z',
        metadata: {
          eventKey: 'post-workout-feedback:rev-1',
          domain: 'post_workout_feedback',
          action: 'created',
          workoutDayId: 'day-1',
          revisionNumber: 1,
          signalCodes: ['pain_attention'],
        },
      },
      {
        id: 'evt-execution',
        alunoId: 'aluno-1',
        contractId: 'contract-1',
        eventType: 'STATUS_CHANGED',
        actorUserId: 'student-user-1',
        createdAt: '2026-05-12T10:00:00.000Z',
        metadata: {
          eventKey: 'workout-session-execution:exec-1:op-1',
          domain: 'workout_session_execution',
          action: 'transition',
          workoutDayId: 'day-1',
          previousStatus: 'in_progress',
          status: 'completed',
          version: 2,
        },
      },
    ]);

    const result = await timelineWithPermissions('aluno-1', {
      companyContractId: 'contract-1',
    });

    expect(lifecycleFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        alunoId: 'aluno-1',
        contractId: 'contract-1',
        AND: expect.arrayContaining([
          expect.objectContaining({ OR: expect.arrayContaining([
            { metadata: { path: ['domain'], equals: 'workout_session_execution' } },
          ]) }),
        ]),
      }),
    }));
    expect(result?.items.slice(0, 2).map((item) => item.type)).toEqual([
      'post_workout_feedback_recorded',
      'workout_execution_completed',
    ]);
    expect(result?.items[0].details).toEqual({
      workoutDayId: 'day-1',
      revisionNumber: 1,
    });
    expect(result?.items[0].details).not.toHaveProperty('signalCodes');
  });

  it('paginates legacy and training events in one chronological order, including identical timestamps', async () => {
    findUniqueMock.mockResolvedValue({
      ...createAlunoSnapshot(),
      createdAt: '2026-05-12T10:00:00.000Z',
      studentExternalAccounts: [],
      studentExternalActivities: [],
    });
    (studentContractService.listByAluno as jest.Mock).mockResolvedValue([]);
    const records = [
      { id: 'event-z', alunoId: 'aluno-1', createdAt: '2026-05-12T10:00:00.000Z', actorUserId: null, metadata: { domain: 'workout_session_execution', status: 'completed' } },
      { id: 'event-a', alunoId: 'aluno-1', createdAt: '2026-05-12T10:00:00.000Z', actorUserId: null, metadata: { domain: 'post_workout_feedback', action: 'created' } },
      { id: 'event-old', alunoId: 'aluno-1', createdAt: '2026-05-11T10:00:00.000Z', actorUserId: null, metadata: { domain: 'pre_workout_check_in' } },
    ];
    lifecycleFindManyMock.mockImplementation(({ where }: any) => {
      const cursorTime = where.AND?.[1]?.OR?.[0]?.createdAt?.lt?.getTime();
      if (cursorTime === undefined) return Promise.resolve(records.slice(0, 3));
      const sameTimeCursor = where.AND?.[1]?.OR?.[1];
      const sameTimeId = sameTimeCursor?.id?.lt;
      return Promise.resolve(records.filter((record) =>
        new Date(record.createdAt).getTime() < cursorTime ||
        (Boolean(sameTimeCursor) && new Date(record.createdAt).getTime() === cursorTime &&
          (sameTimeId === undefined || record.id < sameTimeId))
      ));
    });
    const first = await timelineWithPermissions('aluno-1', { timelineLimit: 1, companyContractId: 'contract-1' });
    expect(first?.items[0].id).toBe('student-created-aluno-1');
    expect(first?.nextCursor).toEqual(expect.any(String));
    const second = await timelineWithPermissions('aluno-1', {
      timelineLimit: 1, timelineCursor: first?.nextCursor ?? undefined, companyContractId: 'contract-1',
    });
    expect(second?.items[0].id).toBe('training-execution-event-z');
    const third = await timelineWithPermissions('aluno-1', {
      timelineLimit: 1, timelineCursor: second?.nextCursor ?? undefined, companyContractId: 'contract-1',
    });
    expect(third?.items[0].id).toBe('training-feedback-event-a');
    expect(new Set([first?.items[0].id, second?.items[0].id, third?.items[0].id]).size).toBe(3);
  });

  it('rejects cursor reuse across students and contracts before querying events', async () => {
    findUniqueMock.mockResolvedValue({
      ...createAlunoSnapshot(), studentExternalAccounts: [], studentExternalActivities: [],
    });
    (studentContractService.listByAluno as jest.Mock).mockResolvedValue([]);
    lifecycleFindManyMock.mockResolvedValue([
      { id: 'event-a', alunoId: 'aluno-1', createdAt: '2026-05-12T10:00:00.000Z', actorUserId: null, metadata: { domain: 'workout_session_execution', status: 'completed' } },
      { id: 'event-b', alunoId: 'aluno-1', createdAt: '2026-05-11T10:00:00.000Z', actorUserId: null, metadata: { domain: 'workout_session_execution', status: 'completed' } },
    ]);
    const first = await timelineWithPermissions('aluno-1', {
      timelineLimit: 1, companyContractId: 'contract-1',
    });
    expect(first?.nextCursor).toEqual(expect.any(String));
    lifecycleFindManyMock.mockClear();
    await expect(timelineWithPermissions('aluno-1', {
      timelineLimit: 1, companyContractId: 'contract-2', timelineCursor: first?.nextCursor ?? undefined,
    })).rejects.toThrow('INVALID_TIMELINE_CURSOR');
    await expect(timelineWithPermissions('aluno-2', {
      timelineLimit: 1, companyContractId: 'contract-1', timelineCursor: first?.nextCursor ?? undefined,
    })).rejects.toThrow('INVALID_TIMELINE_CURSOR');
    await expect(timelineWithPermissions('aluno-1', {
      companyContractId: 'contract-1', timelineCursor: 'invalid-token',
    })).rejects.toThrow('INVALID_TIMELINE_CURSOR');
    expect(lifecycleFindManyMock).not.toHaveBeenCalled();
  });

  it('falls back to external ids when segmented source metadata is absent', async () => {
    findUniqueMock.mockResolvedValue({
      ...createAlunoSnapshot(),
      studentExternalAccounts: [
        {
          id: 'acc-legacy-fallback',
          provider: 'strava',
          externalUserId: 'strava-user-1',
          connectionStatus: 'connected',
          lastSyncAt: null,
          metadata: null,
          createdAt: '2026-05-03T09:00:00.000Z',
          updatedAt: '2026-05-03T09:00:00.000Z',
        },
      ],
      studentExternalActivities: [
        {
          id: 'act-legacy-fallback',
          provider: 'strava',
          externalActivityId: 'strava-activity-1',
          activityType: 'ride',
          startedAt: '2026-05-03T06:00:00.000Z',
          endedAt: null,
          distanceMeters: 10000,
          durationSeconds: 2400,
          paceSecondsPerKm: null,
          averageHeartRate: null,
          maxHeartRate: null,
          calories: null,
          elevationGainMeters: null,
          rawPayload: null,
          importedAt: '2026-05-03T07:00:00.000Z',
          createdAt: '2026-05-03T07:00:00.000Z',
          updatedAt: '2026-05-03T07:00:00.000Z',
        },
      ],
    });

    const integrations = await studentDomainService.getIntegrations('aluno-1');
    const activities = await studentDomainService.listExternalActivities('aluno-1');

    expect(integrations?.accounts[0].source).toEqual({
      type: 'integration',
      reference: 'strava-user-1',
      recordedByUserId: null,
    });
    expect(activities?.activities[0].source).toEqual({
      type: 'integration',
      reference: 'strava-activity-1',
      recordedByUserId: null,
    });
  });

  it('emits contract cancellation events with stable source traceability', async () => {
    findUniqueMock.mockResolvedValue({
      ...createAlunoSnapshot(),
      studentExternalAccounts: [],
      studentExternalActivities: [],
    });
    (studentContractService.listByAluno as jest.Mock).mockResolvedValue([
      createStudentContract({
        status: 'canceled',
        canceledAt: '2026-05-11T09:00:00.000Z',
        contract: {
          id: 'generated-contract-1',
          title: 'Contrato Premium',
          status: 'CANCELLED',
          createdAt: '2026-05-05T08:00:00.000Z',
          signedAt: '2026-05-06T08:00:00.000Z',
          cancelledAt: '2026-05-11T09:00:00.000Z',
          companyContractId: 'contract-1',
          serviceId: 'service-1',
        },
      }),
    ]);

    const result = await timelineWithPermissions('aluno-1');

    const canceledContract = result?.items.find((item) => item.type === 'financial_contract_canceled');
    expect(canceledContract).toMatchObject({
      occurredAt: '2026-05-11T09:00:00.000Z',
      source: {
        type: 'system',
        reference: 'student-contract-1',
      },
    });
  });

  it('paginates legacy, clinical and training on the same timestamp without gaps', async () => {
    const instant = new Date('2026-05-12T10:00:00.000Z');
    findUniqueMock.mockResolvedValue({
      ...createAlunoSnapshot(), createdAt: instant.toISOString(),
      studentExternalAccounts: [], studentExternalActivities: [],
    });
    (studentContractService.listByAluno as jest.Mock).mockResolvedValue([]);
    const canonical = {
      id: 'prnt-1', alunoId: 'aluno-1', contractId: 'contract-1',
      recordId: 'record-1', entityType: 'goal', entityId: 'goal-1',
      version: 1, action: 'created', actorUserId: 'user-1', source: 'prnt-api', createdAt: instant,
    };
    prntFindManyMock.mockImplementation(({ where }: any) => {
      if (where.OR?.[0]?.createdAt?.lt && !where.OR?.[1]) return Promise.resolve([]);
      if (where.OR?.[1]?.id?.lt && canonical.id >= where.OR[1].id.lt) return Promise.resolve([]);
      return Promise.resolve([canonical]);
    });
    const training = {
      id: 'train-1', alunoId: 'aluno-1', contractId: 'contract-1',
      createdAt: instant.toISOString(), actorUserId: null,
      metadata: { domain: 'workout_session_execution', status: 'completed' },
    };
    lifecycleFindManyMock.mockImplementation(({ where }: any) => {
      const timeFilter = where.AND?.[1]?.OR;
      if (!timeFilter) return Promise.resolve([training]);
      const olderThan = timeFilter[0].createdAt.lt.getTime();
      const equals = timeFilter[1];
      return Promise.resolve(
        new Date(training.createdAt).getTime() < olderThan ||
        (Boolean(equals) && new Date(training.createdAt).getTime() === olderThan
          && (!equals.id?.lt || training.id < equals.id.lt)) ? [training] : []
      );
    });
    const options = {
      companyContractId: 'contract-1', timelineLimit: 1,
      timelineAccess: {
        profile: true, health: false, assessments: false, financial: false,
        integrations: false, training: true,
        clinical: { prnt: { goal: true }, intake: false, parq: false, anthropometry: false, adipometry: false },
      },
    };
    const first = await studentDomainService.getTimeline('aluno-1', options);
    const second = await studentDomainService.getTimeline('aluno-1', {
      ...options, timelineCursor: first?.nextCursor ?? undefined,
    });
    const third = await studentDomainService.getTimeline('aluno-1', {
      ...options, timelineCursor: second?.nextCursor ?? undefined,
    });
    expect([first?.items[0]?.id, second?.items[0]?.id, third?.items[0]?.id]).toEqual([
      'student-created-aluno-1', 'clinical-prnt-prnt-1', 'training-execution-train-1',
    ]);
  });

  it('does not resurface legacy intake when its canonical revision is outside the current page', async () => {
    findUniqueMock.mockResolvedValue({
      ...createAlunoSnapshot(),
      intakeForm: {
        id: 'legacy-intake-1', assessmentDate: '2026-05-11T10:00:00.000Z',
        createdAt: '2026-05-11T10:00:00.000Z', updatedAt: '2026-05-11T10:00:00.000Z',
        observations: 'Legacy intake',
      },
      studentExternalAccounts: [], studentExternalActivities: [],
    });
    (studentContractService.listByAluno as jest.Mock).mockResolvedValue([]);
    intakeFindManyMock.mockResolvedValue([]); // Revision outside the cursor window.
    intakeFindFirstMock.mockResolvedValue({ id: 'canonical-revision-1' });
    const options = {
      companyContractId: 'contract-1',
      timelineAccess: {
        profile: true, health: true, assessments: false, financial: false,
        integrations: false, training: false,
        clinical: { prnt: {}, intake: true, parq: false, anthropometry: false, adipometry: false },
      },
    };
    const canonical = await studentDomainService.getTimeline('aluno-1', options);
    expect(canonical?.items.some((item) => item.type.startsWith('intake_'))).toBe(false);
    expect(intakeFindFirstMock).toHaveBeenCalledWith({
      where: { alunoId: 'aluno-1', contractId: 'contract-1' }, select: { id: true },
    });
    intakeFindFirstMock.mockResolvedValue(null);
    const legacy = await studentDomainService.getTimeline('aluno-1', options);
    expect(legacy?.items.some((item) => item.type.startsWith('intake_'))).toBe(true);
  });


  it('denies legacy intake when the health grant lacks clinical intake permission', async () => {
    findUniqueMock.mockResolvedValue({
      ...createAlunoSnapshot(),
      intakeForm: { id: 'legacy-intake', observations: 'sensitive',
        assessmentDate: '2026-05-12T08:00:00.000Z' },
    });
    (studentContractService.listByAluno as jest.Mock).mockResolvedValue([]);
    const result = await studentDomainService.getTimeline('aluno-1', {
      companyContractId: 'contract-1',
      timelineAccess: {
        profile: true, health: true, assessments: false, financial: false,
        integrations: false, training: false,
        clinical: { prnt: {}, intake: false, parq: false, anthropometry: false, adipometry: false },
      },
    });
    expect(result?.items.some((item) => item.type.startsWith('intake_'))).toBe(false);
    expect(intakeFindFirstMock).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('sensitive');
  });

  it('fails closed rather than resurrecting legacy intake when canonical lookup fails', async () => {
    findUniqueMock.mockResolvedValue({
      ...createAlunoSnapshot(),
      intakeForm: { id: 'legacy-intake', observations: 'sensitive',
        assessmentDate: '2026-05-12T08:00:00.000Z' },
    });
    (studentContractService.listByAluno as jest.Mock).mockResolvedValue([]);
    intakeFindManyMock.mockRejectedValueOnce(new Error('private clinical database details'));
    intakeFindFirstMock.mockRejectedValueOnce(new Error('private existence details'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await studentDomainService.getTimeline('aluno-1', {
        companyContractId: 'contract-1',
        timelineAccess: {
          profile: true, health: true, assessments: false, financial: false,
          integrations: false, training: false,
          clinical: { prnt: {}, intake: true, parq: false, anthropometry: false, adipometry: false },
        },
      });
      expect(result?.partial).toBe(true);
      expect(result?.unavailableDomains).toContain('Anamnese');
      expect(result?.items.some((item) => item.type.startsWith('intake_'))).toBe(false);
      expect(JSON.stringify(result)).not.toContain('private');
      expect(JSON.stringify(result)).not.toContain('sensitive');
    } finally {
      spy.mockRestore();
    }
  });

  it('recovers profile and PRNT when a broad or optional assessment read fails', async () => {
    const snapshot = { ...createAlunoSnapshot(),
      studentExternalAccounts: [], studentExternalActivities: [] };
    findUniqueMock.mockRejectedValueOnce(new Error('broken assessment join'))
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(snapshot)
      .mockRejectedValueOnce(new Error('broken optional assessment read'))
      .mockResolvedValue(snapshot);
    (studentContractService.listByAluno as jest.Mock).mockResolvedValue([]);
    prntFindManyMock.mockResolvedValue([{
      id: 'prnt-1', alunoId: 'aluno-1', contractId: 'contract-1',
      recordId: 'record-1', entityType: 'goal', entityId: 'goal-1',
      version: 1, action: 'created', actorUserId: 'user-1',
      source: 'prnt-api', createdAt: new Date('2026-05-15T08:00:00.000Z'),
    }]);
    const result = await studentDomainService.getTimeline('aluno-1', {
      companyContractId: 'contract-1',
      timelineAccess: {
        profile: true, health: false, assessments: true, financial: false,
        integrations: false, training: false,
        clinical: { prnt: { goal: true }, intake: false, parq: false, anthropometry: false, adipometry: false },
      },
    });
    expect(result?.partial).toBe(true);
    expect(result?.unavailableDomains).toEqual(['Avaliações']);
    expect(result?.items.map((item) => item.type)).toContain('prnt_goal_created');
    expect(result?.items.map((item) => item.type)).toContain('profile_updated');
    expect(findUniqueMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'aluno-1', contractId: 'contract-1' },
    }));
  });

});

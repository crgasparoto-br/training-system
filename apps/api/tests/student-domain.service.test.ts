const findUniqueMock = jest.fn();
const mockPrisma = {
  aluno: {
    findUnique: findUniqueMock,
  },
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

  it('builds timeline events with contract milestones and import traceability', async () => {
    findUniqueMock.mockResolvedValue(createAlunoSnapshot());
    (studentContractService.listByAluno as jest.Mock).mockResolvedValue([createStudentContract()]);

    const result = await studentDomainService.getTimeline('aluno-1', {
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

    const result = await studentDomainService.getTimeline('aluno-1');

    const canceledContract = result?.items.find((item) => item.type === 'financial_contract_canceled');
    expect(canceledContract).toMatchObject({
      occurredAt: '2026-05-11T09:00:00.000Z',
      source: {
        type: 'system',
        reference: 'student-contract-1',
      },
    });
  });
});

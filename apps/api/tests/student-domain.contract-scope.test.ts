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

const createContractScopedSnapshot = () => ({
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
  assessments: [],
  integrations: [],
  contracts: [],
  studentProfile: {
    id: 'profile-segmented-other',
    contractId: 'contract-other',
    sourceType: 'student',
    sourceReference: 'seg-profile',
    recordedByUserId: null,
    identificationData: {
      name: 'Outro contrato',
    },
    preferenceData: null,
    objectiveData: null,
    createdAt: '2026-05-09T08:00:00.000Z',
    updatedAt: '2026-05-09T08:00:00.000Z',
  },
  studentHealthIntake: {
    id: 'intake-segmented-other',
    contractId: 'contract-other',
    sourceType: 'student',
    sourceReference: 'seg-intake',
    recordedByUserId: null,
    assessmentDate: '2026-05-08T08:00:00.000Z',
    questionnaireParq: { q1: true },
    questionnaireAha: null,
    clinicalHistoryData: null,
    medicationData: null,
    injuryData: null,
    allergyData: null,
    rawFormResponses: null,
    observations: 'Não deveria aparecer',
    createdAt: '2026-05-08T08:00:00.000Z',
    updatedAt: '2026-05-08T08:00:00.000Z',
  },
  studentAssessmentRecords: [
    {
      id: 'assessment-other',
      contractId: 'contract-other',
      assessmentCategory: 'anthropometry',
      assessmentCode: 'anthro',
      title: 'Avaliação de outro contrato',
      sourceType: 'professional',
      sourceReference: 'assessment-other',
      recordedByUserId: null,
      performedByProfessorId: null,
      performedAt: '2026-05-08T10:00:00.000Z',
      status: 'completed',
      summaryData: null,
      notes: null,
      measurements: [],
      createdAt: '2026-05-08T10:00:00.000Z',
      updatedAt: '2026-05-08T10:00:00.000Z',
    },
  ],
  studentFinancialProfile: {
    id: 'financial-other',
    contractId: 'contract-other',
    sourceType: 'student',
    sourceReference: 'financial-other',
    recordedByUserId: null,
    currentServiceName: 'Plano de outro contrato',
    specialCondition: null,
    monthlyAmount: null,
    discountPercentage: null,
    paymentDay: null,
    contractStartDate: null,
    contractDueDate: null,
    cameFromReferral: null,
    referralPerson: null,
    notes: null,
    createdAt: '2026-05-08T10:00:00.000Z',
    updatedAt: '2026-05-08T10:00:00.000Z',
  },
  studentExternalAccounts: [
    {
      id: 'account-other',
      contractId: 'contract-other',
      provider: 'garmin',
      externalUserId: 'garmin-other',
      sourceType: 'integration',
      sourceReference: 'account-other',
      recordedByUserId: null,
      connectionStatus: 'connected',
      lastSyncAt: '2026-05-08T10:00:00.000Z',
      metadata: null,
      createdAt: '2026-05-08T10:00:00.000Z',
      updatedAt: '2026-05-08T10:00:00.000Z',
    },
  ],
  studentExternalActivities: [
    {
      id: 'activity-other',
      contractId: 'contract-other',
      provider: 'garmin',
      externalActivityId: 'garmin-activity-other',
      sourceType: 'integration',
      sourceReference: 'activity-other',
      recordedByUserId: null,
      activityType: 'run',
      startedAt: '2026-05-07T06:00:00.000Z',
      endedAt: '2026-05-07T06:30:00.000Z',
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

describe('studentDomainService contract scope', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    (studentContractService.listByAluno as jest.Mock).mockReset();
  });

  it('drops segmented records from other contracts when a companyContractId is provided', async () => {
    findUniqueMock.mockResolvedValue(createContractScopedSnapshot());
    (studentContractService.listByAluno as jest.Mock).mockResolvedValue([
      {
        id: 'student-contract-1',
        status: 'active',
        amount: 299.9,
        paymentDay: 10,
        notes: 'Observacao contratual',
        startDate: '2026-05-07T08:00:00.000Z',
        endDate: null,
        createdAt: '2026-05-05T08:00:00.000Z',
        service: {
          name: 'Premium',
        },
      },
    ]);

    const summary = await studentDomainService.getSummary('aluno-1', {
      companyContractId: 'contract-1',
    });

    expect(summary).not.toBeNull();
    expect(summary?.profile.source).toEqual({
      type: 'student',
      reference: 'aluno-1',
      recordedByUserId: null,
    });
    expect(summary?.assessments.total).toBe(0);
    expect(summary?.integrations.totalAccounts).toBe(0);
    expect(summary?.activities.total).toBe(0);
    expect(summary?.financial.currentServiceName).toBe('Premium');
    expect(summary?.intake.observations).toBeNull();
  });
});

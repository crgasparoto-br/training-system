const mockTx = {
  professor: {
    findUniqueOrThrow: jest.fn(),
  },
  serviceOption: {
    findFirst: jest.fn(),
  },
  user: {
    create: jest.fn(),
  },
  aluno: {
    create: jest.fn(),
    update: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  studentProfile: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  studentFinancialProfile: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  studentLifecycleEvent: {
    create: jest.fn(),
  },
  profile: {
    update: jest.fn(),
  },
  macronutrients: {
    create: jest.fn(),
    upsert: jest.fn(),
  },
  alunoIntakeForm: {
    findUnique: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
  },
  studentHealthIntake: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  studentOnboardingProcess: {
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  progressMetric: {
    create: jest.fn(),
  },
  studentParqSubmission: {
    create: jest.fn(),
  },
};

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockHash = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: {
    hash: (...args: unknown[]) => mockHash(...args),
  },
}));

const { alunoService } = require('../src/modules/alunos/aluno.service');

const emptyParq = {
  q1: false,
  q2: false,
  q3: false,
  q4: false,
  q5: false,
  q6: false,
  q7: false,
  q8: false,
};

describe('alunoService assessment boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockTx) => unknown) =>
      callback(mockTx)
    );
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockHash.mockResolvedValue('hashed-password');
    mockTx.professor.findUniqueOrThrow.mockResolvedValue({ contractId: 'contract-1' });
    mockTx.serviceOption.findFirst.mockResolvedValue({
      id: 'service-1',
      isActive: true,
      parentServiceId: null,
    });
    mockTx.user.create.mockResolvedValue({ id: 'user-1' });
    mockTx.aluno.create.mockResolvedValue({ id: 'aluno-1' });
    mockTx.aluno.update.mockResolvedValue({ id: 'aluno-1', userId: 'user-1' });
    mockTx.aluno.findUniqueOrThrow.mockResolvedValue({
      id: 'aluno-1',
      contractId: 'contract-1',
    });
    mockTx.aluno.count.mockResolvedValue(1);
    mockTx.aluno.findFirst.mockResolvedValue({
      id: 'aluno-1',
      contractId: 'contract-1',
      userId: 'user-1',
      leadName: null,
      leadEmail: null,
      leadEmailNormalized: null,
      leadPhone: null,
      leadPhoneNormalized: null,
      leadCpf: null,
      leadCpfNormalized: null,
      birthDate: null,
      studentProfile: null,
      user: {
        email: 'novo@example.com',
        profile: {
          name: 'Aluno Novo',
          phone: null,
          cpf: null,
          birthDate: null,
          gender: null,
          rg: null,
          maritalStatus: null,
          addressStreet: null,
          addressNumber: null,
          addressComplement: null,
          addressNeighborhood: null,
          addressCity: null,
          addressState: null,
          addressZipCode: null,
          instagramHandle: null,
        },
      },
    });
    mockTx.studentProfile.findUnique.mockResolvedValue({ preferenceData: null });
    mockTx.studentProfile.upsert.mockResolvedValue({});
    mockTx.studentProfile.update.mockResolvedValue({});
    mockTx.studentFinancialProfile.findUnique.mockResolvedValue(null);
    mockTx.studentFinancialProfile.upsert.mockResolvedValue({});
    mockTx.studentLifecycleEvent.create.mockResolvedValue({});
    mockTx.studentOnboardingProcess.create.mockResolvedValue({ id: 'onboarding-1' });
    mockTx.studentHealthIntake.findUnique.mockResolvedValue(null);
    mockTx.studentHealthIntake.upsert.mockResolvedValue({
      id: 'health-intake-1',
      status: 'IN_PROGRESS',
      completedAt: null,
    });
  });

  it('cria aluno com o serviço no mesmo tx, persiste payload completo canônico e não reativa formResponses legado', async () => {
    await alunoService.create({
      name: 'Aluno Novo',
      email: 'novo@example.com',
      professorId: 'professor-1',
      serviceId: 'service-1',
      schedulePlan: 'free',
      age: 30,
      intakeForm: {
        mainGoal: 'Condicionamento físico',
        trainingBackground: 'Iniciante',
        observations: 'Cadastro inicial',
        formResponses: {
          identification: {
            cpf: '139.513.548-79',
            rg: '',
            maritalStatus: '',
            socialNetwork: 'linkedin',
            instagram: 'aluno-linkedin',
            addressStreet: 'Rua A',
            addressNumber: '100',
            addressComplement: '',
            addressNeighborhood: 'Centro',
            addressCity: 'Sorocaba',
            addressState: 'SP',
            addressZipCode: '18000-000',
            emergencyContactName: 'Maria',
            emergencyContactPhone: '(15) 99999-9999',
            emergencyContactRelationship: 'Cônjuge',
          },
          financial: { monthlyValue: '' },
          preferences: {},
          ahaResponses: {},
        },
      },
    });

    expect(mockTx.serviceOption.findFirst).toHaveBeenCalledWith({
      where: { id: 'service-1', contractId: 'contract-1' },
      select: { id: true, isActive: true, parentServiceId: true },
    });
    expect(mockTx.aluno.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          professorId: 'professor-1',
          serviceId: 'service-1',
          schedulePlan: 'free',
          age: 30,
        }),
      })
    );
    expect(mockTx.studentOnboardingProcess.create).toHaveBeenCalledWith({
      data: { alunoId: 'aluno-1', contractId: 'contract-1' },
    });
    expect(mockTx.studentProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          identificationData: expect.objectContaining({
            cpf: '139.513.548-79',
            socialNetwork: 'linkedin',
            socialAccount: 'aluno-linkedin',
            addressStreet: 'Rua A',
            addressNumber: '100',
            addressNeighborhood: 'Centro',
            addressCity: 'Sorocaba',
            addressState: 'SP',
            addressZipCode: '18000-000',
            emergencyContactName: 'Maria',
            emergencyContactPhone: '(15) 99999-9999',
            emergencyContactRelationship: 'Cônjuge',
          }),
        }),
      })
    );
    expect(mockTx.alunoIntakeForm.upsert).not.toHaveBeenCalled();
    expect(mockTx.macronutrients.create).not.toHaveBeenCalled();
    expect(mockTx.progressMetric.create).not.toHaveBeenCalled();
  });

  it('preserva saúde e grava relação/financeiro nos modelos canônicos sem dual-write legado', async () => {
    mockTx.aluno.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: 'aluno-1',
        contractId: 'contract-1',
        professorId: 'professor-1',
        professor: { contractId: 'contract-1' },
        currentStudentContract: null,
        intakeForm: { parqResponses: emptyParq },
      })
      .mockResolvedValueOnce({ id: 'aluno-1', contractId: 'contract-1' })
      .mockResolvedValueOnce({ id: 'aluno-1' });

    await alunoService.update('aluno-1', {
      age: 31,
      intakeForm: {
        mainGoal: 'Objetivo atualizado',
        medicalHistory: 'Histórico preservado',
        currentMedications: 'Nenhuma',
        injuriesHistory: 'Sem lesões',
        trainingBackground: 'Treino atualizado',
        observations: 'Observação atualizada',
        formResponses: {
          identification: { emergencyContactRelationship: 'Vizinho de confiança' },
          financial: { monthlyValue: '350,00' },
          preferences: {},
          ahaResponses: {},
        },
      },
    });

    expect(mockTx.aluno.update).toHaveBeenCalledWith({
      where: { id: 'aluno-1' },
      data: { age: 31 },
    });
    expect(mockTx.alunoIntakeForm.upsert).not.toHaveBeenCalled();
    expect(mockTx.studentFinancialProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ monthlyAmount: 350 }),
      })
    );
    expect(mockTx.studentProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          identificationData: expect.objectContaining({
            emergencyContactRelationship: 'Vizinho de confiança',
          }),
        }),
      })
    );
    expect(mockTx.macronutrients.upsert).not.toHaveBeenCalled();
    expect(mockTx.progressMetric.create).not.toHaveBeenCalled();
    expect(mockTx.studentParqSubmission.create).not.toHaveBeenCalled();
    expect(mockTx.studentHealthIntake.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { alunoId: 'aluno-1' },
        create: expect.objectContaining({
          clinicalHistoryData: expect.objectContaining({
            mainGoal: 'Objetivo atualizado',
            medicalHistory: 'Histórico preservado',
            trainingBackground: 'Treino atualizado',
          }),
          medicationData: expect.objectContaining({ currentMedications: 'Nenhuma' }),
          injuryData: expect.objectContaining({ injuriesHistory: 'Sem lesões' }),
          observations: 'Observação atualizada',
        }),
      })
    );
  });
});

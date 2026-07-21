const mockTx = {
  professor: {
    findUniqueOrThrow: jest.fn(),
  },
  user: {
    create: jest.fn(),
  },
  aluno: {
    create: jest.fn(),
    update: jest.fn(),
    findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
    },
    studentProfile: {
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
    create: jest.fn(),
    upsert: jest.fn(),
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

const mockGetServiceForContract = jest.fn();
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

jest.mock('../src/modules/services/service.service', () => ({
  getServiceForContract: (...args: unknown[]) => mockGetServiceForContract(...args),
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
    mockGetServiceForContract.mockResolvedValue({
      id: 'service-1',
      isActive: true,
      parentServiceId: null,
    });
    mockTx.user.create.mockResolvedValue({ id: 'user-1' });
    mockTx.aluno.create.mockResolvedValue({ id: 'aluno-1' });
    mockTx.aluno.update.mockResolvedValue({ id: 'aluno-1', userId: 'user-1' });
    mockTx.aluno.findUniqueOrThrow.mockResolvedValue({ id: 'aluno-1' });
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
    mockTx.studentProfile.upsert.mockResolvedValue({});
    mockTx.studentLifecycleEvent.create.mockResolvedValue({});
  });

  it('cria aluno sem macronutrientes ou métrica de progresso quando o formulário não envia avaliação', async () => {
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
        parqResponses: emptyParq,
        formResponses: {
          identification: {},
          financial: {},
          preferences: {},
          ahaResponses: {},
        },
      },
    });

    expect(mockTx.aluno.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          professorId: 'professor-1',
          serviceId: 'service-1',
          schedulePlan: 'free',
          age: 30,
          weight: undefined,
          height: undefined,
          bodyFatPercentage: undefined,
          vo2Max: undefined,
          anaerobicThreshold: undefined,
          maxHeartRate: undefined,
          restingHeartRate: undefined,
          systolicPressure: undefined,
          diastolicPressure: undefined,
        }),
      })
    );
    expect(mockTx.macronutrients.create).not.toHaveBeenCalled();
    expect(mockTx.progressMetric.create).not.toHaveBeenCalled();
  });

  it('preserva avaliação, macronutrientes e métricas ao atualizar somente cadastro e anamnese', async () => {
    mockTx.aluno.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: 'aluno-1',
        professorId: 'professor-1',
        professor: { contractId: 'contract-1' },
        currentStudentContract: null,
        intakeForm: { parqResponses: emptyParq },
      })
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
        parqResponses: emptyParq,
        formResponses: {
          identification: {},
          financial: {},
          preferences: {},
          ahaResponses: {},
        },
      },
    });

    expect(mockTx.aluno.update).toHaveBeenCalledWith({
      where: { id: 'aluno-1' },
      data: { age: 31 },
    });
    expect(mockTx.macronutrients.upsert).not.toHaveBeenCalled();
    expect(mockTx.progressMetric.create).not.toHaveBeenCalled();

    const intakeUpsert = mockTx.alunoIntakeForm.upsert.mock.calls[0][0];
    expect(intakeUpsert.update.assessmentDate).toBeUndefined();
    expect(intakeUpsert.update).toMatchObject({
      mainGoal: 'Objetivo atualizado',
      medicalHistory: 'Histórico preservado',
      currentMedications: 'Nenhuma',
      injuriesHistory: 'Sem lesões',
      trainingBackground: 'Treino atualizado',
      observations: 'Observação atualizada',
    });
  });
});

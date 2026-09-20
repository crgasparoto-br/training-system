const tx = {
  $queryRaw: jest.fn(),
  aluno: {
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
  profile: { update: jest.fn() },
  professor: { findFirst: jest.fn() },
  serviceOption: { findFirst: jest.fn(), findUnique: jest.fn() },
  macronutrients: { upsert: jest.fn(), create: jest.fn() },
  alunoIntakeForm: { findUnique: jest.fn(), upsert: jest.fn(), create: jest.fn() },
  studentProfile: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  studentFinancialProfile: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  studentHealthIntake: { findUnique: jest.fn(), upsert: jest.fn() },
  studentOnboardingProcess: { create: jest.fn(), updateMany: jest.fn() },
  studentParqSubmission: { create: jest.fn() },
  progressMetric: { create: jest.fn() },
  contract: { findUnique: jest.fn(), create: jest.fn() },
  contractTemplate: { findFirst: jest.fn() },
  contractAuditLog: { create: jest.fn() },
  studentContract: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  companyContract: { findUniqueOrThrow: jest.fn() },
  user: { findUnique: jest.fn(), create: jest.fn() },
};

const prisma = {
  $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prisma),
  Prisma: { sql: jest.fn((parts: TemplateStringsArray) => parts.join('?')) },
}));

jest.mock('bcryptjs', () => ({ hash: jest.fn(async () => 'hash') }));
jest.mock('../src/modules/contracts/contract-document.service', () => ({
  contractDocumentService: { renderTemplate: jest.fn(() => '<html />') },
}));
jest.mock('../src/modules/contracts/contract-service-context', () => ({
  loadContractServiceVariableContext: jest.fn(async () => ({})),
}));

import {
  preserveAuthoritativeFinancialCurrentService,
  resolveAuthoritativeStudentContractServiceId,
  studentFinancialContractService,
} from '../src/modules/alunos/student-financial-contract.service';

describe('student financial contract service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => unknown) => callback(tx)
    );
    tx.studentProfile.findUnique.mockResolvedValue({ preferenceData: null });
    tx.studentProfile.upsert.mockResolvedValue({});
    tx.studentProfile.update.mockResolvedValue({});
    tx.studentFinancialProfile.findUnique.mockResolvedValue(null);
    tx.studentFinancialProfile.upsert.mockResolvedValue({});
    tx.studentHealthIntake.findUnique.mockResolvedValue(null);
    tx.studentHealthIntake.upsert.mockResolvedValue({
      id: 'health-intake-1',
      status: 'IN_PROGRESS',
      completedAt: null,
    });
  });

  it('always prioritizes the service persisted on the generated contract', () => {
    expect(
      resolveAuthoritativeStudentContractServiceId(
        'contract-service',
        'interest-service'
      )
    ).toBe('contract-service');
    expect(
      resolveAuthoritativeStudentContractServiceId(null, 'interest-service')
    ).toBe('interest-service');
    expect(resolveAuthoritativeStudentContractServiceId(null, null)).toBeNull();
  });

  it('keeps currentService server-owned while preserving the remaining financial form', () => {
    expect(
      preserveAuthoritativeFinancialCurrentService(
        {
          financial: {
            currentService: 'client-writer',
            monthlyValue: '350,00',
          },
          identification: { cpf: '123' },
        },
        'active-contract-service'
      )
    ).toEqual({
      financial: {
        currentService: 'active-contract-service',
        monthlyValue: '350,00',
      },
      identification: { cpf: '123' },
    });

    expect(
      preserveAuthoritativeFinancialCurrentService({
        financial: { currentService: 'client-writer', paymentDay: '10' },
      })
    ).toEqual({ financial: { paymentDay: '10' } });
  });

  it('uses the persisted Aluno service and stores administrative finance outside AlunoIntakeForm', async () => {
    tx.aluno.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: 'student-1',
        contractId: 'company-1',
        userId: 'user-1',
        professorId: 'professor-1',
        serviceId: 'interest-service',
        professor: { contractId: 'company-1' },
        currentStudentContract: {
          contract: { companyContractId: 'company-1' },
        },
        intakeForm: {
          parqResponses: null,
          formResponses: {
            financial: { currentService: 'active-contract-service' },
          },
        },
      })
      .mockResolvedValueOnce({
        id: 'student-1',
        contractId: 'company-1',
      })
      .mockResolvedValueOnce({
        contractId: 'company-1',
        serviceId: 'interest-service',
        professor: { contractId: 'company-1' },
      })
      .mockResolvedValueOnce({ id: 'student-1' });
    tx.aluno.update.mockResolvedValue({ id: 'student-1', userId: 'user-1' });
    tx.studentFinancialProfile.findUnique.mockResolvedValue({
      currentServiceName: 'active-contract-service',
    });
    tx.contract.findUnique.mockResolvedValue({
      id: 'contract-1',
      alunoId: 'student-1',
      companyContractId: 'company-1',
      serviceId: null,
    });
    tx.serviceOption.findFirst.mockResolvedValue({ id: 'interest-service' });
    tx.studentContract.findUnique
      .mockResolvedValueOnce({
        id: 'link-1',
        alunoId: 'student-1',
        contractId: 'contract-1',
        serviceId: 'legacy-service',
        status: 'draft',
        startDate: null,
        endDate: null,
        signedAt: null,
      })
      .mockResolvedValueOnce({
        id: 'link-1',
        alunoId: 'student-1',
        contractId: 'contract-1',
        serviceId: 'interest-service',
        status: 'draft',
        startDate: new Date('2026-07-01T12:00:00.000Z'),
        endDate: new Date('2027-07-01T12:00:00.000Z'),
        signedAt: null,
        contract: { status: 'GENERATED', signedAt: null },
      });
    tx.studentContract.update
      .mockResolvedValueOnce({
        id: 'link-1',
        alunoId: 'student-1',
        contractId: 'contract-1',
        serviceId: 'interest-service',
        status: 'draft',
      })
      .mockResolvedValueOnce({
        id: 'link-1',
        alunoId: 'student-1',
        contractId: 'contract-1',
        serviceId: 'interest-service',
        status: 'draft',
      });
    tx.studentContract.findUniqueOrThrow.mockResolvedValue({
      id: 'link-1',
      serviceId: 'interest-service',
      status: 'draft',
    });

    const result = await studentFinancialContractService.updateAlunoWithContract(
      'student-1',
      {
        age: 31,
        intakeForm: {
          formResponses: {
            financial: {
              currentService: 'client-writer',
              monthlyValue: '350,00',
            },
          },
        },
      },
      {
        contractId: 'contract-1',
        serviceId: 'untrusted-direct-caller-service',
        startDate: new Date('2026-07-01T12:00:00.000Z'),
        endDate: new Date('2027-07-01T12:00:00.000Z'),
      } as any,
      { professorId: 'professor-1', companyContractId: 'company-1' }
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.aluno.update).toHaveBeenCalledTimes(1);
    expect(tx.alunoIntakeForm.upsert).not.toHaveBeenCalled();
    expect(tx.studentFinancialProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          currentServiceName: 'active-contract-service',
          monthlyAmount: 350,
        }),
      })
    );
    expect(tx.studentHealthIntake.upsert).not.toHaveBeenCalled();
    expect(tx.serviceOption.findFirst).toHaveBeenCalledWith({
      where: { id: 'interest-service', contractId: 'company-1' },
      select: { id: true },
    });
    expect(tx.serviceOption.findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'untrusted-direct-caller-service' }),
      })
    );
    expect(tx.studentContract.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'link-1' },
        data: expect.objectContaining({
          serviceId: 'interest-service',
          endDate: new Date('2027-07-01T12:00:00.000Z'),
        }),
      })
    );
    expect(tx.studentContract.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'link-1' },
      data: { status: 'draft' },
    });
    expect(tx.studentContract.updateMany).not.toHaveBeenCalled();
    expect(result.studentContract).toEqual({
      id: 'link-1',
      serviceId: 'interest-service',
      status: 'draft',
    });
  });

  it('updates an existing active link without re-running the activation lifecycle', async () => {
    tx.aluno.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: 'student-1',
        contractId: 'company-1',
        userId: 'user-1',
        professorId: 'professor-1',
        serviceId: 'interest-service',
      })
      .mockResolvedValueOnce({
        id: 'student-1',
        contractId: 'company-1',
        serviceId: 'interest-service',
      })
      .mockResolvedValueOnce({ id: 'student-1' });
    tx.aluno.update.mockResolvedValue({ id: 'student-1', userId: 'user-1' });
    tx.contract.findUnique.mockResolvedValue({
      id: 'contract-active-legacy',
      alunoId: 'student-1',
      companyContractId: 'company-1',
      serviceId: null,
    });
    tx.serviceOption.findFirst.mockResolvedValue({ id: 'interest-service' });
    tx.studentContract.findUnique.mockResolvedValueOnce({
      id: 'link-active',
      alunoId: 'student-1',
      contractId: 'contract-active-legacy',
      serviceId: 'interest-service',
      status: 'active',
      startDate: new Date('2026-01-01T12:00:00.000Z'),
      endDate: new Date('2026-12-31T12:00:00.000Z'),
      signedAt: null,
    });
    tx.studentContract.update.mockResolvedValue({
      id: 'link-active',
      alunoId: 'student-1',
      contractId: 'contract-active-legacy',
      serviceId: 'interest-service',
      status: 'active',
      amount: 420,
      paymentDay: 12,
    });
    tx.studentContract.findUniqueOrThrow.mockResolvedValue({
      id: 'link-active',
      alunoId: 'student-1',
      contractId: 'contract-active-legacy',
      serviceId: 'interest-service',
      status: 'active',
      amount: 420,
      paymentDay: 12,
    });

    const result = await studentFinancialContractService.updateAlunoWithContract(
      'student-1',
      { age: 31 },
      {
        contractId: 'contract-active-legacy',
        amount: 420,
        paymentDay: 12,
      },
      { professorId: 'professor-1', companyContractId: 'company-1' }
    );

    expect(tx.studentContract.update).toHaveBeenCalledTimes(1);
    expect(tx.studentContract.update).toHaveBeenCalledWith({
      where: { id: 'link-active' },
      data: expect.objectContaining({
        serviceId: 'interest-service',
        amount: 420,
        paymentDay: 12,
      }),
    });
    expect(tx.studentContract.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(result.studentContract).toEqual(
      expect.objectContaining({
        id: 'link-active',
        status: 'active',
        amount: 420,
        paymentDay: 12,
      })
    );
  });

  it('rejects a persisted fallback service from another company contract', async () => {
    tx.aluno.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: 'student-1',
        contractId: 'company-1',
        userId: 'user-1',
        professorId: 'professor-1',
        serviceId: 'foreign-service',
        professor: { contractId: 'company-1' },
        currentStudentContract: null,
        intakeForm: null,
      })
      .mockResolvedValueOnce({
        contractId: 'company-1',
        serviceId: 'foreign-service',
        professor: { contractId: 'company-1' },
      });
    tx.aluno.update.mockResolvedValue({ id: 'student-1', userId: 'user-1' });
    tx.contract.findUnique.mockResolvedValue({
      id: 'contract-1',
      alunoId: 'student-1',
      companyContractId: 'company-1',
      serviceId: null,
    });
    tx.serviceOption.findFirst.mockResolvedValue(null);

    await expect(
      studentFinancialContractService.updateAlunoWithContract(
        'student-1',
        { age: 32 },
        { contractId: 'contract-1' },
        { professorId: 'professor-1', companyContractId: 'company-1' }
      )
    ).rejects.toThrow(
      'Serviço financeiro do contrato não pertence ao contrato autenticado'
    );

    expect(tx.studentContract.update).not.toHaveBeenCalled();
    expect(tx.studentContract.create).not.toHaveBeenCalled();
  });

  it('rejects the whole transaction when the selected contract cannot be resolved', async () => {
    tx.aluno.findUniqueOrThrow.mockResolvedValue({
      id: 'student-1',
      contractId: 'company-1',
      userId: 'user-1',
      professorId: 'professor-1',
      serviceId: 'interest-service',
      professor: { contractId: 'company-1' },
      currentStudentContract: null,
      intakeForm: null,
    });
    tx.aluno.update.mockResolvedValue({ id: 'student-1', userId: 'user-1' });
    tx.contract.findUnique.mockResolvedValue(null);

    await expect(
      studentFinancialContractService.updateAlunoWithContract(
        'student-1',
        { age: 32 },
        { contractId: 'missing-contract' },
        { professorId: 'professor-1', companyContractId: 'company-1' }
      )
    ).rejects.toThrow('Contrato selecionado não encontrado');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.studentContract.update).not.toHaveBeenCalled();
    expect(tx.studentContract.create).not.toHaveBeenCalled();
  });

  it('rejects an aluno owned by another company contract before writing the profile', async () => {
    tx.aluno.findUniqueOrThrow.mockResolvedValue({
      id: 'student-other-company',
      contractId: 'company-other',
      userId: 'user-other-company',
      professorId: 'professor-other-company',
      serviceId: null,
      professor: { contractId: 'company-other' },
      currentStudentContract: null,
      intakeForm: null,
    });

    await expect(
      studentFinancialContractService.updateAlunoWithContract(
        'student-other-company',
        { age: 32 },
        { contractId: 'contract-1' },
        { professorId: 'professor-1', companyContractId: 'company-1' }
      )
    ).rejects.toThrow('Aluno não pertence ao contrato autenticado');

    expect(tx.aluno.update).not.toHaveBeenCalled();
    expect(tx.studentContract.update).not.toHaveBeenCalled();
    expect(tx.studentContract.create).not.toHaveBeenCalled();
  });

  it('rejects a generated contract from another company contract', async () => {
    tx.aluno.findUniqueOrThrow.mockResolvedValue({
      id: 'student-1',
      contractId: 'company-1',
      userId: 'user-1',
      professorId: 'professor-1',
      serviceId: null,
      professor: { contractId: 'company-1' },
      currentStudentContract: null,
      intakeForm: null,
    });
    tx.aluno.update.mockResolvedValue({ id: 'student-1', userId: 'user-1' });
    tx.contract.findUnique.mockResolvedValue({
      id: 'contract-other-company',
      alunoId: 'student-1',
      companyContractId: 'company-other',
      serviceId: 'financial-service',
    });

    await expect(
      studentFinancialContractService.updateAlunoWithContract(
        'student-1',
        { age: 32 },
        { contractId: 'contract-other-company' },
        { professorId: 'professor-1', companyContractId: 'company-1' }
      )
    ).rejects.toThrow('Contrato selecionado está fora do contrato autenticado');

    expect(tx.studentContract.update).not.toHaveBeenCalled();
    expect(tx.studentContract.create).not.toHaveBeenCalled();
  });
});

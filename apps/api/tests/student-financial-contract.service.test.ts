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
  alunoIntakeForm: { upsert: jest.fn(), create: jest.fn() },
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

  it('updates profile and prepares an unsigned replacement in one transaction without terminating the active contract', async () => {
    tx.aluno.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: 'student-1',
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
      .mockResolvedValueOnce({ id: 'student-1' });
    tx.aluno.update.mockResolvedValue({ id: 'student-1', userId: 'user-1' });
    tx.contract.findUnique.mockResolvedValue({
      id: 'contract-1',
      alunoId: 'student-1',
      companyContractId: 'company-1',
      serviceId: 'financial-service',
    });
    tx.studentContract.findUnique
      .mockResolvedValueOnce({
        id: 'link-1',
        alunoId: 'student-1',
        contractId: 'contract-1',
        serviceId: 'interest-service',
        status: 'draft',
        startDate: null,
        endDate: null,
        signedAt: null,
      })
      .mockResolvedValueOnce({
        id: 'link-1',
        alunoId: 'student-1',
        contractId: 'contract-1',
        serviceId: 'financial-service',
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
        serviceId: 'financial-service',
        status: 'draft',
      })
      .mockResolvedValueOnce({
        id: 'link-1',
        alunoId: 'student-1',
        contractId: 'contract-1',
        serviceId: 'financial-service',
        status: 'draft',
      });
    tx.studentContract.findUniqueOrThrow.mockResolvedValue({
      id: 'link-1',
      serviceId: 'financial-service',
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
        serviceId: 'interest-service',
        startDate: new Date('2026-07-01T12:00:00.000Z'),
        endDate: new Date('2027-07-01T12:00:00.000Z'),
      },
      { professorId: 'professor-1', companyContractId: 'company-1' }
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.aluno.update).toHaveBeenCalledTimes(1);
    expect(tx.alunoIntakeForm.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          formResponses: expect.objectContaining({
            financial: {
              currentService: 'active-contract-service',
              monthlyValue: '350,00',
            },
          }),
        }),
      })
    );
    expect(tx.studentContract.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'link-1' },
        data: expect.objectContaining({
          serviceId: 'financial-service',
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
      serviceId: 'financial-service',
      status: 'draft',
    });
  });

  it('rejects the whole transaction when the selected contract cannot be resolved', async () => {
    tx.aluno.findUniqueOrThrow.mockResolvedValue({
      id: 'student-1',
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

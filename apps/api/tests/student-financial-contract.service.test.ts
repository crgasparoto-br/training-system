const tx = {
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
  Prisma: {},
}));

jest.mock('bcryptjs', () => ({ hash: jest.fn(async () => 'hash') }));
jest.mock('../src/modules/contracts/contract-document.service', () => ({
  contractDocumentService: { renderTemplate: jest.fn(() => '<html />') },
}));
jest.mock('../src/modules/contracts/contract-service-context', () => ({
  loadContractServiceVariableContext: jest.fn(async () => ({})),
}));

import {
  resolveAuthoritativeStudentContractServiceId,
  studentFinancialContractService,
} from '../src/modules/alunos/student-financial-contract.service';

describe('student financial contract service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it('always prioritizes the service persisted on the contract', () => {
    expect(
      resolveAuthoritativeStudentContractServiceId('contract-service', 'interest-service')
    ).toBe('contract-service');
    expect(
      resolveAuthoritativeStudentContractServiceId(null, 'interest-service')
    ).toBe('interest-service');
    expect(resolveAuthoritativeStudentContractServiceId(null, null)).toBeNull();
  });

  it('updates profile and legacy contract link inside one transaction using contract.serviceId', async () => {
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
        intakeForm: null,
      })
      .mockResolvedValueOnce({ id: 'student-1' });
    tx.aluno.update
      .mockResolvedValueOnce({ id: 'student-1', userId: 'user-1' })
      .mockResolvedValueOnce({ id: 'student-1', currentStudentContractId: 'link-1' });
    tx.contract.findUnique.mockResolvedValue({
      id: 'contract-1',
      alunoId: 'student-1',
      companyContractId: 'company-1',
      serviceId: 'financial-service',
    });
    tx.studentContract.findUnique.mockResolvedValue({
      id: 'link-1',
      alunoId: 'student-1',
      contractId: 'contract-1',
      serviceId: 'interest-service',
      startDate: null,
      signedAt: null,
    });
    tx.studentContract.update
      .mockResolvedValueOnce({
        id: 'link-1',
        alunoId: 'student-1',
        contractId: 'contract-1',
        serviceId: 'financial-service',
        startDate: null,
        signedAt: null,
      })
      .mockResolvedValueOnce({
        id: 'link-1',
        alunoId: 'student-1',
        contractId: 'contract-1',
        serviceId: 'financial-service',
        startDate: new Date(),
        signedAt: new Date(),
      });
    tx.studentContract.updateMany.mockResolvedValue({ count: 1 });
    tx.studentContract.findUniqueOrThrow.mockResolvedValue({
      id: 'link-1',
      serviceId: 'financial-service',
    });

    const result = await studentFinancialContractService.updateAlunoWithContract(
      'student-1',
      { age: 31 },
      {
        contractId: 'contract-1',
        serviceId: 'interest-service',
        endDate: new Date('2027-07-01T12:00:00.000Z'),
      },
      { professorId: 'professor-1', companyContractId: 'company-1' }
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.aluno.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'student-1' },
      data: { age: 31 },
    });
    expect(tx.studentContract.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'link-1' },
        data: expect.objectContaining({ serviceId: 'financial-service' }),
      })
    );
    expect(tx.studentContract.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ serviceId: 'financial-service', status: 'active' }),
      })
    );
    expect(result.studentContract).toEqual({
      id: 'link-1',
      serviceId: 'financial-service',
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
});

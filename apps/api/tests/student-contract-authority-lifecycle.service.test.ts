const db = {
  aluno: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  contract: { findUnique: jest.fn() },
  contractTemplate: { findFirst: jest.fn() },
  serviceOption: { findFirst: jest.fn() },
  studentContract: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const tx = db;
const prisma = {
  ...db,
  $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
};

const prepareOrActivateStudentContractInTransaction = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prisma),
  Prisma: {},
}));

jest.mock(
  '../src/modules/student-contracts/student-contract-lifecycle-transaction',
  () => ({ prepareOrActivateStudentContractInTransaction })
);

import { studentContractService } from '../src/modules/student-contracts/student-contract.service';

describe('student contract authority and lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => unknown) => callback(tx)
    );
  });

  it('ignores a serviceId supplied by the legacy link route', async () => {
    db.contract.findUnique.mockResolvedValue({
      id: 'contract-1',
      alunoId: 'student-1',
      companyContractId: 'company-1',
      serviceId: 'contract-service',
      status: 'GENERATED',
    });
    db.aluno.findUnique.mockResolvedValue({
      serviceId: 'interest-service',
      professor: { contractId: 'company-1' },
    });
    db.serviceOption.findFirst.mockResolvedValue({ id: 'contract-service' });
    db.studentContract.findUnique.mockResolvedValue(null);
    db.studentContract.create.mockResolvedValue({
      id: 'link-1',
      alunoId: 'student-1',
      contractId: 'contract-1',
      serviceId: 'contract-service',
      status: 'draft',
    });

    await studentContractService.linkExistingContract(
      {
        alunoId: 'student-1',
        contractId: 'contract-1',
        serviceId: 'untrusted-client-service',
      },
      { companyContractId: 'company-1' }
    );

    expect(db.serviceOption.findFirst).toHaveBeenCalledWith({
      where: { id: 'contract-service', contractId: 'company-1' },
      select: { id: true },
    });
    expect(db.serviceOption.findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'untrusted-client-service' }),
      })
    );
    expect(db.studentContract.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          serviceId: 'contract-service',
          status: 'draft',
        }),
      })
    );
  });

  it('uses persisted Aluno.serviceId only when the generated contract has no service', async () => {
    db.contract.findUnique.mockResolvedValue({
      id: 'contract-1',
      alunoId: 'student-1',
      companyContractId: 'company-1',
      serviceId: null,
      status: 'GENERATED',
    });
    db.aluno.findUnique.mockResolvedValue({
      serviceId: 'interest-service',
      professor: { contractId: 'company-1' },
    });
    db.serviceOption.findFirst.mockResolvedValue({ id: 'interest-service' });
    db.studentContract.findUnique.mockResolvedValue(null);
    db.studentContract.create.mockResolvedValue({
      id: 'link-1',
      serviceId: 'interest-service',
      status: 'draft',
    });

    await studentContractService.linkExistingContract(
      {
        alunoId: 'student-1',
        contractId: 'contract-1',
        serviceId: 'untrusted-client-service',
      },
      { companyContractId: 'company-1' }
    );

    expect(db.studentContract.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ serviceId: 'interest-service' }),
      })
    );
  });

  it('delegates legacy activation to the signed/effective lifecycle policy', async () => {
    const existing = {
      id: 'link-new',
      alunoId: 'student-1',
      contract: { id: 'contract-new', companyContractId: 'company-1' },
    };
    db.studentContract.findUnique.mockResolvedValue(existing);
    prepareOrActivateStudentContractInTransaction.mockResolvedValue({
      studentContract: {
        id: 'link-new',
        status: 'draft',
      },
      activationDeferred: true,
      reason: 'awaiting_signature',
    });

    const result = await studentContractService.activate('student-1', 'link-new', {
      companyContractId: 'company-1',
    });

    expect(prepareOrActivateStudentContractInTransaction).toHaveBeenCalledWith(
      tx,
      'link-new'
    );
    expect(db.studentContract.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'link-new', status: 'draft' });
  });

  it('does not allow PATCH status active to write active or signedAt directly', async () => {
    const existing = {
      id: 'link-new',
      alunoId: 'student-1',
      contract: { id: 'contract-new', companyContractId: 'company-1' },
    };
    db.studentContract.findUnique.mockResolvedValue(existing);
    db.studentContract.update.mockResolvedValue({
      id: 'link-new',
      status: 'pending_signature',
    });
    prepareOrActivateStudentContractInTransaction.mockResolvedValue({
      studentContract: {
        id: 'link-new',
        status: 'pending_signature',
      },
      activationDeferred: true,
      reason: 'scheduled_start',
    });

    const result = await studentContractService.update(
      'student-1',
      'link-new',
      {
        status: 'active',
        serviceId: 'untrusted-client-service',
        signedAt: new Date('2026-07-15T12:00:00.000Z'),
        startDate: new Date('2026-08-01T12:00:00.000Z'),
      },
      { companyContractId: 'company-1' }
    );

    expect(db.studentContract.update).toHaveBeenCalledWith({
      where: { id: 'link-new' },
      data: { startDate: new Date('2026-08-01T12:00:00.000Z') },
    });
    expect(db.studentContract.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'active',
          signedAt: expect.anything(),
          serviceId: expect.anything(),
        }),
      })
    );
    expect(result).toEqual({ id: 'link-new', status: 'pending_signature' });
  });
});

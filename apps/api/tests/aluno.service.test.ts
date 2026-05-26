jest.mock('@prisma/client', () => {
  const aluno = {
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  };
  const profile = { update: jest.fn() };
  const macronutrients = { upsert: jest.fn() };
  const alunoIntakeForm = { upsert: jest.fn() };
  const professor = { findFirst: jest.fn() };
  const studentParqSubmission = { create: jest.fn() };

  const instance: Record<string, unknown> = {
    aluno,
    profile,
    macronutrients,
    alunoIntakeForm,
    professor,
    studentParqSubmission,
    $transaction: jest.fn(),
  };

  (instance.$transaction as jest.Mock).mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(instance);
    return Promise.all(arg as Promise<unknown>[]);
  });

  return {
    PrismaClient: jest.fn(() => instance),
    Prisma: { JsonNull: null },
    _db: instance,
  };
});

jest.mock('../src/modules/services/service.service.js', () => ({
  getServiceForContract: jest.fn(),
}));

import { alunoService } from '../src/modules/alunos/aluno.service';

type DbMock = {
  aluno: { findUniqueOrThrow: jest.Mock; update: jest.Mock };
  profile: { update: jest.Mock };
  macronutrients: { upsert: jest.Mock };
  alunoIntakeForm: { upsert: jest.Mock };
  professor: { findFirst: jest.Mock };
  studentParqSubmission: { create: jest.Mock };
  $transaction: jest.Mock;
};

const db = (jest.requireMock('@prisma/client') as { _db: DbMock })._db;

const CURRENT_ALUNO = {
  id: 'aluno-1',
  professorId: 'prof-1',
  userId: 'user-1',
  professor: { contractId: 'contract-1' },
  currentStudentContract: null,
};

const SAME_PARQ = {
  q1: false,
  q2: false,
  q3: false,
  q4: false,
  q5: false,
  q6: false,
  q7: false,
  q8: true,
};

const CHANGED_PARQ = {
  q1: true,
  q2: false,
  q3: false,
  q4: false,
  q5: false,
  q6: false,
  q7: false,
  q8: true,
};

describe('alunoService.update', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(db);
      return Promise.all(arg as Promise<unknown>[]);
    });
    db.aluno.update.mockResolvedValue({ id: 'aluno-1', userId: 'user-1' });
    db.alunoIntakeForm.upsert.mockResolvedValue({});
  });

  it('creates a PAR-Q submission when the responses changed', async () => {
    db.aluno.findUniqueOrThrow
      .mockResolvedValueOnce({
        ...CURRENT_ALUNO,
        intakeForm: { parqResponses: SAME_PARQ },
      })
      .mockResolvedValueOnce({ id: 'aluno-1' });

    await alunoService.update('aluno-1', {
      intakeForm: {
        parqResponses: CHANGED_PARQ,
      },
    });

    expect(db.studentParqSubmission.create).toHaveBeenCalledTimes(1);
    expect(db.studentParqSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          alunoId: 'aluno-1',
          contractId: 'contract-1',
        }),
      })
    );
  });

  it('does not create a PAR-Q submission when the responses are unchanged', async () => {
    db.aluno.findUniqueOrThrow
      .mockResolvedValueOnce({
        ...CURRENT_ALUNO,
        intakeForm: { parqResponses: SAME_PARQ },
      })
      .mockResolvedValueOnce({ id: 'aluno-1' });

    await alunoService.update('aluno-1', {
      intakeForm: {
        parqResponses: SAME_PARQ,
      },
    });

    expect(db.studentParqSubmission.create).not.toHaveBeenCalled();
  });
});

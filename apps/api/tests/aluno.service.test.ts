jest.mock('@prisma/client', () => {
  const instance = {
    aluno: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    profile: { update: jest.fn() },
    macronutrients: { upsert: jest.fn() },
    alunoIntakeForm: { upsert: jest.fn() },
    professor: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  instance.$transaction.mockImplementation(async (arg: unknown) => {
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
  $transaction: jest.Mock;
  alunoIntakeForm: { upsert: jest.Mock };
};

const db = (jest.requireMock('@prisma/client') as { _db: DbMock })._db;

const LEGACY_PARQ = {
  q1: false,
  q2: false,
  q3: false,
  q4: false,
  q5: false,
  q6: false,
  q7: false,
  q8: true,
};

describe('alunoService.update PAR-Q cutover', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects direct writes to the legacy PAR-Q field before opening a transaction', async () => {
    await expect(
      alunoService.update('aluno-1', {
        intakeForm: { parqResponses: LEGACY_PARQ },
      })
    ).rejects.toMatchObject({
      code: 'LEGACY_WRITE_DISABLED',
      statusCode: 410,
    });

    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.alunoIntakeForm.upsert).not.toHaveBeenCalled();
  });

  it('rejects PAR-Q hidden inside legacy formResponses instead of dual-writing it', async () => {
    await expect(
      alunoService.update('aluno-1', {
        intakeForm: {
          formResponses: {
            parqResponses: LEGACY_PARQ,
          },
        },
      })
    ).rejects.toMatchObject({
      code: 'LEGACY_WRITE_DISABLED',
      statusCode: 410,
    });

    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

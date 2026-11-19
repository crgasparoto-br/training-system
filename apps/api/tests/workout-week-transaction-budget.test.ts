import { Prisma, type PrismaClient } from '@prisma/client';
import { saveTemplateWeek } from '../src/modules/workout/workout-week-structure.service';
import { withWorkoutTemplatePlanningMutation, WorkoutPlanningLockedError } from '../src/modules/workout/workout-planning.helpers';

const updatedAt = new Date('2026-11-18T12:00:00.000Z');

function dbFixture(released = false) {
  const template = {
    id: 'template-1', planId: 'plan-1', weekStartDate: updatedAt, updatedAt,
    plan: { aluno: { contractId: 'contract-test' } }, workoutDays: [], released,
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    workoutTemplate: {
      findUnique: jest.fn()
        .mockResolvedValueOnce({ released })
        .mockResolvedValueOnce(template)
        .mockResolvedValueOnce(template),
      findFirst: jest.fn().mockResolvedValue({ id: 'template-1' }),
    },
    workoutSessionExecution: { findFirst: jest.fn().mockResolvedValue(null) },
    workoutExecution: { findFirst: jest.fn().mockResolvedValue(null) },
    workoutDay: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({ id: 'day-1' }),
    },
  };
  const db = { $transaction: jest.fn(async (mutate: (transactionClient: typeof tx) => Promise<unknown>) => mutate(tx)) };
  return { db: db as unknown as PrismaClient, transaction: db.$transaction, tx };
}

describe('#551 - orçamento transacional específico do salvamento semanal', () => {
  it('salva uma semana sob locks serializáveis com 15s de espera e 30s de execução', async () => {
    const { db, transaction, tx } = dbFixture();
    const saved = await saveTemplateWeek(db, 'template-1', { baseUpdatedAt: updatedAt.toISOString() }, 'contract-test');
    expect(saved).toMatchObject({ id: 'template-1' });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 15_000,
      timeout: 30_000,
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.workoutTemplate.findFirst).toHaveBeenCalledWith({
      where: { id: 'template-1', plan: { aluno: { contractId: 'contract-test' } } },
      select: { id: true },
    });
  });

  it('salva dois dias na mesma transação serializável e preserva a revisão', async () => {
    const { db, tx, transaction } = dbFixture();
    await saveTemplateWeek(db, 'template-1', {
      baseUpdatedAt: updatedAt.toISOString(),
      workoutDays: [
        { dayOfWeek: 1, detailNotes: 'Treino de segunda' },
        { dayOfWeek: 2, detailNotes: 'Treino de terça' },
      ],
    }, 'contract-test');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 15_000,
      timeout: 30_000,
    }));
    expect(tx.workoutDay.upsert).toHaveBeenCalledTimes(2);
    expect(tx.workoutDay.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { templateId_dayOfWeek: { templateId: 'template-1', dayOfWeek: 1 } },
    }));
    expect(tx.workoutDay.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { templateId_dayOfWeek: { templateId: 'template-1', dayOfWeek: 2 } },
    }));
  });

  it('preserva limites padrão em outras mutações do helper e rejeita treino liberado', async () => {
    const { db, transaction } = dbFixture(true);
    const mutation = jest.fn();
    await expect(withWorkoutTemplatePlanningMutation(db, 'template-1', mutation)).rejects.toBeInstanceOf(WorkoutPlanningLockedError);
    expect(mutation).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('bloqueia conflito de revisão antes de qualquer edição do snapshot', async () => {
    const { db, tx } = dbFixture();
    await expect(saveTemplateWeek(db, 'template-1', {
      baseUpdatedAt: '2026-11-18T10:00:00.000Z',
    }, 'contract-test')).rejects.toMatchObject({ code: 'WORKOUT_PLANNING_VERSION_CONFLICT' });
    expect(tx.workoutDay.findMany).not.toHaveBeenCalled();
  });
});

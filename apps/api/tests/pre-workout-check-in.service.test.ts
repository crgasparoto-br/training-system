import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  createPreWorkoutCheckInService,
  PreWorkoutCheckInConflictError,
  PreWorkoutCheckInNotFoundError,
} from '../src/modules/workout/pre-workout-check-in.service.js';

const values = {
  psr: 7,
  sleepQuality: null,
  fatigue: null,
  painLevel: 3,
  motivation: null,
  availableMinutes: 45,
  notes: null,
};

const makeCheckIn = (overrides: Record<string, unknown> = {}) => ({
  id: 'checkin-1',
  workoutDayId: 'day-1',
  alunoId: 'aluno-1',
  contractId: 'contract-1',
  ...values,
  ruleSetVersion: 'pre-workout-check-in-v1',
  ruleSnapshot: {
    version: 'pre-workout-check-in-v1',
    painTriage: 'attention',
    studentMessage: 'Atenção',
    technicalMessage: 'Faixa de atenção',
    blocksWorkout: false,
    changesWorkoutAutomatically: false,
  },
  createdByUserId: 'user-1',
  createdAt: new Date('2026-10-02T20:00:00.000Z'),
  updatedAt: new Date('2026-10-02T20:00:00.000Z'),
  ...overrides,
});

describe('pre-workout check-in service (#388)', () => {
  const queryRaw = jest.fn();
  const checkInFindFirst = jest.fn();
  const checkInCreate = jest.fn();
  const checkInUpdate = jest.fn();
  const operationFindUnique = jest.fn();
  const operationCreate = jest.fn();
  const operationUpdate = jest.fn();
  const lifecycleCreate = jest.fn();

  const tx = {
    $queryRaw: queryRaw,
    preWorkoutCheckIn: {
      findFirst: checkInFindFirst,
      create: checkInCreate,
      update: checkInUpdate,
    },
    preWorkoutCheckInOperation: {
      findUnique: operationFindUnique,
      create: operationCreate,
      update: operationUpdate,
    },
    studentLifecycleEvent: { create: lifecycleCreate },
  };

  const transaction = jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx));
  const client = { $transaction: transaction } as unknown as PrismaClient;
  const service = createPreWorkoutCheckInService(client);

  beforeEach(() => {
    jest.clearAllMocks();
    queryRaw.mockResolvedValue([{ id: 'day-1', status: 'planned' }]);
    checkInFindFirst.mockResolvedValue(null);
    operationFindUnique.mockResolvedValue(null);
    operationCreate.mockResolvedValue({ id: 'operation-1' });
    operationUpdate.mockResolvedValue({});
    lifecycleCreate.mockResolvedValue({ id: 'event-1' });
    checkInCreate.mockImplementation(({ data }: any) =>
      Promise.resolve(makeCheckIn({
        ...data,
        ruleSnapshot: data.ruleSnapshot,
        createdAt: new Date('2026-10-02T20:00:00.000Z'),
        updatedAt: new Date('2026-10-02T20:00:00.000Z'),
      }))
    );
    checkInUpdate.mockImplementation(({ data }: any) =>
      Promise.resolve(makeCheckIn({
        ...data,
        ruleSnapshot: data.ruleSnapshot,
        updatedAt: new Date('2026-10-02T20:05:00.000Z'),
      }))
    );
  });

  const save = (payload: Record<string, unknown> = {}) =>
    service.saveForStudent({
      sessionId: 'day-1',
      alunoId: 'aluno-1',
      contractId: 'contract-1',
      actorUserId: 'user-1',
      payload: {
        operationKey: 'operation-123',
        psr: 7,
        painLevel: 3,
        availableMinutes: 45,
        ...payload,
      },
    });

  it('persiste check-in, operação idempotente e timeline na mesma transação', async () => {
    const result = await save();

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(checkInCreate).toHaveBeenCalledTimes(1);
    expect(operationCreate).toHaveBeenCalledTimes(1);
    expect(lifecycleCreate).toHaveBeenCalledTimes(1);
    expect(operationUpdate).toHaveBeenCalledWith({
      where: { id: 'operation-1' },
      data: { lifecycleEventId: 'event-1' },
    });
    expect(result.guidance).toMatchObject({
      painTriage: 'attention',
      blocksWorkout: false,
      changesWorkoutAutomatically: false,
    });

    const metadata = lifecycleCreate.mock.calls[0][0].data.metadata;
    expect(metadata).toMatchObject({
      domain: 'pre_workout_check_in',
      checkInId: 'checkin-1',
      workoutDayId: 'day-1',
      operationId: 'operation-1',
      ruleSetVersion: 'pre-workout-check-in-v1',
    });
    expect(metadata).not.toHaveProperty('psr');
    expect(metadata).not.toHaveProperty('painLevel');
    expect(metadata).not.toHaveProperty('notes');
  });

  it('replay da mesma operação e mesmo conteúdo não duplica check-in nem evento', async () => {
    const existing = makeCheckIn();
    checkInFindFirst.mockResolvedValue(existing);
    operationFindUnique.mockResolvedValue({
      id: 'operation-1',
      payloadFingerprint: createHash('sha256').update(JSON.stringify(values)).digest('hex'),
    });

    const result = await save();

    expect(result.id).toBe('checkin-1');
    expect(checkInCreate).not.toHaveBeenCalled();
    expect(checkInUpdate).not.toHaveBeenCalled();
    expect(operationCreate).not.toHaveBeenCalled();
    expect(lifecycleCreate).not.toHaveBeenCalled();
  });

  it('reutilizar a mesma operationKey com conteúdo diferente falha sem efeitos', async () => {
    checkInFindFirst.mockResolvedValue(makeCheckIn());
    operationFindUnique.mockResolvedValue({
      id: 'operation-1',
      payloadFingerprint: createHash('sha256').update(JSON.stringify(values)).digest('hex'),
    });

    await expect(save({ psr: 8 })).rejects.toMatchObject({
      code: 'PRE_WORKOUT_CHECK_IN_IDEMPOTENCY_CONFLICT',
    });

    expect(checkInCreate).not.toHaveBeenCalled();
    expect(checkInUpdate).not.toHaveBeenCalled();
    expect(operationCreate).not.toHaveBeenCalled();
    expect(lifecycleCreate).not.toHaveBeenCalled();
  });

  it('não cria nem edita depois que a sessão saiu de planned/not_started', async () => {
    queryRaw.mockResolvedValue([{ id: 'day-1', status: 'in_progress' }]);

    await expect(save()).rejects.toBeInstanceOf(PreWorkoutCheckInConflictError);

    expect(checkInFindFirst).not.toHaveBeenCalled();
    expect(checkInCreate).not.toHaveBeenCalled();
    expect(lifecycleCreate).not.toHaveBeenCalled();
  });

  it('sessão fora do aluno/contrato/release é indistinguível de inexistente e não grava', async () => {
    queryRaw.mockResolvedValue([]);

    await expect(save()).rejects.toBeInstanceOf(PreWorkoutCheckInNotFoundError);

    expect(checkInFindFirst).not.toHaveBeenCalled();
    expect(checkInCreate).not.toHaveBeenCalled();
    expect(lifecycleCreate).not.toHaveBeenCalled();
  });

  it('falha ao registrar timeline aborta a operação transacional para o caller', async () => {
    lifecycleCreate.mockRejectedValue(new Error('timeline unavailable'));

    await expect(save()).rejects.toThrow('timeline unavailable');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(operationUpdate).not.toHaveBeenCalled();
  });
});

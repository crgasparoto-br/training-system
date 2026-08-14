jest.mock('@prisma/client', () => {
  const state = {
    trainingParameters: [] as Array<Record<string, unknown>>,
    exercises: [] as Array<Record<string, unknown>>,
    assessmentTypes: [] as Array<Record<string, unknown>>,
    cloneLogs: [] as Array<Record<string, unknown>>,
    nextAssessmentTypeId: 1,
  };

  const db = {
    trainingParameter: {
      findMany: jest.fn(async ({ where }: { where: { contractId: string } }) =>
        state.trainingParameters.filter((item) => item.contractId === where.contractId)
      ),
      createMany: jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        let count = 0;
        for (const item of data) {
          const exists = state.trainingParameters.some(
            (stored) =>
              stored.contractId === item.contractId &&
              stored.category === item.category &&
              stored.code === item.code
          );
          if (!exists) {
            state.trainingParameters.push({ ...item });
            count += 1;
          }
        }
        return { count };
      }),
    },
    exerciseLibrary: {
      findMany: jest.fn(async ({ where }: { where: { contractId: string } }) =>
        state.exercises.filter((item) => item.contractId === where.contractId)
      ),
      createMany: jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        for (const item of data) state.exercises.push({ ...item });
        return { count: data.length };
      }),
    },
    assessmentType: {
      findMany: jest.fn(async ({ where }: { where: { contractId: string } }) =>
        state.assessmentTypes.filter((item) => item.contractId === where.contractId)
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          ...data,
          id: `assessment-${state.nextAssessmentTypeId++}`,
        };
        state.assessmentTypes.push(created);
        return created;
      }),
      update: jest.fn(async () => ({})),
    },
    contractDataCloneLog: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.cloneLogs.push({ ...data });
        return data;
      }),
    },
  };

  return {
    PrismaClient: jest.fn(() => db),
    _db: db,
    _state: state,
  };
});

import { cloneContractData } from '../src/modules/contracts/contract-data.service';

type State = {
  trainingParameters: Array<Record<string, unknown>>;
  exercises: Array<Record<string, unknown>>;
  assessmentTypes: Array<Record<string, unknown>>;
  cloneLogs: Array<Record<string, unknown>>;
  nextAssessmentTypeId: number;
};

type Db = {
  trainingParameter: { createMany: jest.Mock };
  exerciseLibrary: { createMany: jest.Mock };
  assessmentType: { create: jest.Mock };
  contractDataCloneLog: { create: jest.Mock };
};

const prismaMock = jest.requireMock('@prisma/client') as { _db: Db; _state: State };
const db = prismaMock._db;
const state = prismaMock._state;

const cloneOptions = {
  sourceContractId: 'source-contract',
  targetContractId: 'target-contract',
  professorId: 'master-1',
};

describe('cloneContractData idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    state.trainingParameters = [
      {
        contractId: 'source-contract',
        category: 'pace',
        code: 'easy',
        description: 'Easy pace',
        order: 1,
        active: true,
      },
      {
        contractId: 'source-contract',
        category: 'pace',
        code: 'tempo',
        description: 'Tempo pace',
        order: 2,
        active: true,
      },
    ];
    state.exercises = [
      {
        contractId: 'source-contract',
        name: 'Agachamento',
        videoUrl: null,
        loadType: 'bodyweight',
        movementType: 'strength',
        countingType: 'repetitions',
        category: 'strength',
        muscleGroup: 'legs',
        notes: null,
      },
      {
        contractId: 'source-contract',
        name: 'Prancha',
        videoUrl: null,
        loadType: 'bodyweight',
        movementType: 'strength',
        countingType: 'time',
        category: 'strength',
        muscleGroup: 'core',
        notes: null,
      },
    ];
    state.assessmentTypes = [
      {
        id: 'source-assessment-1',
        contractId: 'source-contract',
        code: 'physical',
        name: 'Avaliação física',
        description: null,
        scheduleType: 'fixed_interval',
        intervalMonths: 3,
        afterTypeId: null,
        offsetMonths: null,
        isActive: true,
      },
    ];
    state.cloneLogs = [];
    state.nextAssessmentTypeId = 1;
  });

  it('segunda execucao no mesmo estado cria zero e contabiliza todos os itens como skipped', async () => {
    const first = await cloneContractData(cloneOptions);
    const second = await cloneContractData(cloneOptions);

    expect(first).toEqual({
      parametersCreated: 2,
      parametersSkipped: 0,
      exercisesCreated: 2,
      exercisesSkipped: 0,
      assessmentTypesCreated: 1,
      assessmentTypesSkipped: 0,
    });
    expect(second).toEqual({
      parametersCreated: 0,
      parametersSkipped: 2,
      exercisesCreated: 0,
      exercisesSkipped: 2,
      assessmentTypesCreated: 0,
      assessmentTypesSkipped: 1,
    });

    expect(
      state.trainingParameters.filter((item) => item.contractId === 'target-contract')
    ).toHaveLength(2);
    expect(state.exercises.filter((item) => item.contractId === 'target-contract')).toHaveLength(2);
    expect(
      state.assessmentTypes.filter((item) => item.contractId === 'target-contract')
    ).toHaveLength(1);
    expect(state.cloneLogs).toHaveLength(2);
    expect(state.cloneLogs[1]).toEqual(expect.objectContaining(second));
  });

  it('retry idempotente nao reexecuta writes de exercicio ou tipo de avaliacao', async () => {
    await cloneContractData(cloneOptions);
    const exerciseWritesAfterFirst = db.exerciseLibrary.createMany.mock.calls.length;
    const assessmentWritesAfterFirst = db.assessmentType.create.mock.calls.length;

    await cloneContractData(cloneOptions);

    expect(db.exerciseLibrary.createMany).toHaveBeenCalledTimes(exerciseWritesAfterFirst);
    expect(db.assessmentType.create).toHaveBeenCalledTimes(assessmentWritesAfterFirst);
    expect(db.trainingParameter.createMany).toHaveBeenCalledTimes(2);
    expect(db.contractDataCloneLog.create).toHaveBeenCalledTimes(2);
  });
});

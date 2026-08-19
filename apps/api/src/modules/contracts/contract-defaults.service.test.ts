import {
  PRODUCT_ASSESSMENT_TYPES,
  PRODUCT_TRAINING_PARAMETERS,
} from '../../common/product-defaults.js';
import {
  installContractDefaults,
  loadProductExerciseDefaults,
} from './contract-defaults.service.js';

type TrainingRow = {
  contractId: string;
  category: string;
  code: string;
  description: string;
  order: number;
  active: boolean;
};

type AssessmentRow = {
  contractId: string;
  name: string;
  code: string;
  scheduleType: string;
  intervalMonths: number | null;
  isActive: boolean;
};

type ExerciseRow = {
  contractId: string;
  name: string;
  category?: string | null;
  muscleGroup?: string | null;
  notes?: string | null;
};

function createFakeDb(initial?: {
  training?: TrainingRow[];
  assessments?: AssessmentRow[];
  exercises?: ExerciseRow[];
}) {
  const training = [...(initial?.training ?? [])];
  const assessments = [...(initial?.assessments ?? [])];
  const exercises = [...(initial?.exercises ?? [])];

  const trainingFindMany = jest.fn(async (args: { where: { contractId: string } }) =>
    training
      .filter((item) => item.contractId === args.where.contractId)
      .map(({ category, code }) => ({ category, code }))
  );
  const assessmentFindMany = jest.fn(async (args: { where: { contractId: string } }) =>
    assessments
      .filter((item) => item.contractId === args.where.contractId)
      .map(({ code }) => ({ code }))
  );
  const exerciseFindMany = jest.fn(async (args: { where: { contractId: string } }) =>
    exercises
      .filter((item) => item.contractId === args.where.contractId)
      .map(({ name }) => ({ name }))
  );

  const db = {
    trainingParameter: {
      findMany: trainingFindMany,
      createMany: jest.fn(async (args: { data: TrainingRow[] }) => {
        training.push(...args.data);
        return { count: args.data.length };
      }),
    },
    assessmentType: {
      findMany: assessmentFindMany,
      createMany: jest.fn(async (args: { data: AssessmentRow[] }) => {
        assessments.push(...args.data);
        return { count: args.data.length };
      }),
    },
    exerciseLibrary: {
      findMany: exerciseFindMany,
      createMany: jest.fn(async (args: { data: ExerciseRow[] }) => {
        exercises.push(...args.data);
        return { count: args.data.length };
      }),
    },
  } as unknown as Parameters<typeof installContractDefaults>[1];

  return {
    db,
    state: { training, assessments, exercises },
    reads: { trainingFindMany, assessmentFindMany, exerciseFindMany },
  };
}

describe('installContractDefaults', () => {
  const contractId = 'target-contract';
  const exerciseDefaults = loadProductExerciseDefaults();

  it('instala todos os padrões em um contrato vazio sem consultar outro tenant', async () => {
    const fake = createFakeDb();

    const result = await installContractDefaults(contractId, fake.db);

    expect(result.trainingParameters.installed).toBe(PRODUCT_TRAINING_PARAMETERS.length);
    expect(result.assessmentTypes.installed).toBe(PRODUCT_ASSESSMENT_TYPES.length);
    expect(result.exercises.installed).toBe(exerciseDefaults.length);
    expect(fake.reads.trainingFindMany).toHaveBeenCalledWith({
      where: { contractId },
      select: { category: true, code: true },
    });
    expect(fake.reads.assessmentFindMany).toHaveBeenCalledWith({
      where: { contractId },
      select: { code: true },
    });
    expect(fake.reads.exerciseFindMany).toHaveBeenCalledWith({
      where: { contractId },
      select: { name: true },
    });
  });

  it('repara somente padrões ausentes e preserva registros existentes e customizados', async () => {
    const firstParameter = PRODUCT_TRAINING_PARAMETERS[0];
    const firstAssessment = PRODUCT_ASSESSMENT_TYPES[0];
    const firstExercise = exerciseDefaults[0];
    const customDescription = 'Descrição customizada pelo tenant';
    const fake = createFakeDb({
      training: [
        { ...firstParameter, contractId, description: customDescription },
        {
          contractId,
          category: 'custom',
          code: 'CUSTOM',
          description: 'Registro próprio',
          order: 99,
          active: true,
        },
      ],
      assessments: [{ ...firstAssessment, contractId }],
      exercises: [{ contractId, ...firstExercise }],
    });

    const result = await installContractDefaults(contractId, fake.db);

    expect(result.trainingParameters.installed).toBe(PRODUCT_TRAINING_PARAMETERS.length - 1);
    expect(result.assessmentTypes.installed).toBe(PRODUCT_ASSESSMENT_TYPES.length - 1);
    expect(result.exercises.installed).toBe(exerciseDefaults.length - 1);
    expect(
      fake.state.training.find(
        (item) => item.category === firstParameter.category && item.code === firstParameter.code
      )?.description
    ).toBe(customDescription);
    expect(fake.state.training.some((item) => item.code === 'CUSTOM')).toBe(true);
  });

  it('é idempotente e não cria novas linhas na segunda execução', async () => {
    const fake = createFakeDb();

    await installContractDefaults(contractId, fake.db);
    const second = await installContractDefaults(contractId, fake.db);

    expect(second.trainingParameters.installed).toBe(0);
    expect(second.assessmentTypes.installed).toBe(0);
    expect(second.exercises.installed).toBe(0);
    expect(second.trainingParameters.skipped).toBe(PRODUCT_TRAINING_PARAMETERS.length);
    expect(second.assessmentTypes.skipped).toBe(PRODUCT_ASSESSMENT_TYPES.length);
    expect(second.exercises.skipped).toBe(exerciseDefaults.length);
  });
});

import { cloneContractData } from './contract-data.service.js';

const sourceContractId = 'source-contract';
const targetContractId = 'target-contract';

const exercise = (name: string, muscleGroup: string | null = null, notes: string | null = null) => ({
  name,
  videoUrl: null,
  loadType: null,
  movementType: null,
  countingType: null,
  category: 'RESISTIDO',
  muscleGroup,
  notes,
});

function createExerciseCopyDb(source: ReturnType<typeof exercise>[], targetNames: string[] = []) {
  const exerciseCreateMany = jest.fn(async ({ data }: { data: unknown[] }) => ({
    count: data.length,
  }));

  const db = {
    trainingParameter: {},
    exerciseLibrary: {
      findMany: jest.fn(async ({ where }: { where: { contractId: string } }) =>
        where.contractId === sourceContractId
          ? source
          : targetNames.map((name) => ({ name }))
      ),
      createMany: exerciseCreateMany,
    },
    assessmentType: {},
    contractDataCloneLog: {
      create: jest.fn(async () => ({})),
    },
  } as unknown as NonNullable<Parameters<typeof cloneContractData>[1]>;

  return { db, exerciseCreateMany };
}

describe('cloneContractData: codificação pt-BR dos exercícios', () => {
  it('normaliza os textos copiados e compara o destino pelo nome reparado', async () => {
    const fake = createExerciseCopyDb(
      [
        exercise('Abdominal P\u0082 a P\u0082'),
        exercise('Abdominal M\u00a0quina', 'Abd\u0093men', 'Execu\u0087\u00c6o controlada'),
      ],
      ['Abdominal Pé a Pé']
    );

    const result = await cloneContractData(
      {
        sourceContractId,
        targetContractId,
        copyParameters: false,
        copyAssessmentTypes: false,
      },
      fake.db
    );

    expect(result.exercisesCreated).toBe(1);
    expect(result.exercisesSkipped).toBe(1);
    expect(fake.exerciseCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          contractId: targetContractId,
          name: 'Abdominal Máquina',
          muscleGroup: 'Abdômen',
          notes: 'Execução controlada',
        }),
      ],
    });
  });

  it('não replica duas versões do mesmo nome após a normalização', async () => {
    const fake = createExerciseCopyDb([
      exercise('Abdominal P\u0082 a P\u0082'),
      exercise('Abdominal Pé a Pé'),
    ]);

    const result = await cloneContractData(
      {
        sourceContractId,
        targetContractId,
        copyParameters: false,
        copyAssessmentTypes: false,
      },
      fake.db
    );

    expect(result.exercisesCreated).toBe(1);
    expect(result.exercisesSkipped).toBe(1);
    expect(fake.exerciseCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ name: 'Abdominal Pé a Pé' })],
    });
  });
});

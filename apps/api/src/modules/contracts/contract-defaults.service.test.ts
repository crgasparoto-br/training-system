import fs from 'node:fs';
import path from 'node:path';
import {
  PRODUCT_ASSESSMENT_TYPES,
  PRODUCT_TRAINING_PARAMETERS,
} from '../../common/product-defaults.js';
import { repairPtBrMojibake } from '../../common/pt-br-text.js';
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
  const trainingCreateMany = jest.fn(async (args: { data: TrainingRow[] }) => {
    training.push(...args.data);
    return { count: args.data.length };
  });
  const assessmentCreateMany = jest.fn(async (args: { data: AssessmentRow[] }) => {
    assessments.push(...args.data);
    return { count: args.data.length };
  });
  const exerciseCreateMany = jest.fn(async (args: { data: ExerciseRow[] }) => {
    exercises.push(...args.data);
    return { count: args.data.length };
  });
  const exerciseUpdateMany = jest.fn(async (args: {
    where: { contractId: string; name: string };
    data: { name: string };
  }) => {
    let count = 0;
    for (const exercise of exercises) {
      if (
        exercise.contractId === args.where.contractId &&
        exercise.name === args.where.name
      ) {
        exercise.name = args.data.name;
        count++;
      }
    }
    return { count };
  });

  const db = {
    trainingParameter: {
      findMany: trainingFindMany,
      createMany: trainingCreateMany,
    },
    assessmentType: {
      findMany: assessmentFindMany,
      createMany: assessmentCreateMany,
    },
    exerciseLibrary: {
      findMany: exerciseFindMany,
      createMany: exerciseCreateMany,
      updateMany: exerciseUpdateMany,
    },
  } as unknown as Parameters<typeof installContractDefaults>[1];

  return {
    db,
    state: { training, assessments, exercises },
    reads: { trainingFindMany, assessmentFindMany, exerciseFindMany },
    writes: {
      trainingCreateMany,
      assessmentCreateMany,
      exerciseCreateMany,
      exerciseUpdateMany,
    },
  };
}

const assessmentRow = (
  contractId: string,
  code: string
): AssessmentRow => {
  const canonical = PRODUCT_ASSESSMENT_TYPES.find((item) => item.code === code);
  if (!canonical) throw new Error(`Unknown canonical assessment code: ${code}`);
  return { ...canonical, contractId };
};

describe('installContractDefaults', () => {
  const contractId = 'target-contract';
  const foreignContractId = 'foreign-contract';
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

  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['inválido', 'contract-that-does-not-exist'],
    ['apontando para outro tenant', foreignContractId],
  ])('não depende de DEFAULT_CONTRACT_ID %s', async (_label, envValue) => {
    const original = process.env.DEFAULT_CONTRACT_ID;
    if (envValue === undefined) delete process.env.DEFAULT_CONTRACT_ID;
    else process.env.DEFAULT_CONTRACT_ID = envValue;

    try {
      const fake = createFakeDb();
      const result = await installContractDefaults(contractId, fake.db);
      expect(result.trainingParameters.installed).toBe(PRODUCT_TRAINING_PARAMETERS.length);
      expect(result.assessmentTypes.installed).toBe(PRODUCT_ASSESSMENT_TYPES.length);
      expect(result.exercises.installed).toBe(exerciseDefaults.length);
    } finally {
      if (original === undefined) delete process.env.DEFAULT_CONTRACT_ID;
      else process.env.DEFAULT_CONTRACT_ID = original;
    }
  });

  it('não deixa dados personalizados de outro tenant vazarem para o alvo', async () => {
    const fake = createFakeDb({
      training: [
        {
          contractId: foreignContractId,
          category: 'foreign-only',
          code: 'FOREIGN-SENTINEL',
          description: 'Nunca deve cruzar tenants',
          order: 999,
          active: true,
        },
      ],
      assessments: [
        {
          contractId: foreignContractId,
          name: 'Avaliação exclusiva estrangeira',
          code: 'foreign-assessment-sentinel',
          scheduleType: 'fixed_interval',
          intervalMonths: 9,
          isActive: true,
        },
      ],
      exercises: [
        {
          contractId: foreignContractId,
          name: 'Exercício exclusivo estrangeiro',
          category: 'RESISTIDO',
        },
      ],
    });

    await installContractDefaults(contractId, fake.db);

    expect(fake.state.training.some((item) => item.contractId === contractId && item.code === 'FOREIGN-SENTINEL')).toBe(false);
    expect(fake.state.assessments.some((item) => item.contractId === contractId && item.code === 'foreign-assessment-sentinel')).toBe(false);
    expect(fake.state.exercises.some((item) => item.contractId === contractId && item.name === 'Exercício exclusivo estrangeiro')).toBe(false);
    for (const read of Object.values(fake.reads)) {
      expect(read).toHaveBeenCalledWith(expect.objectContaining({ where: { contractId } }));
    }
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
      assessments: [
        { ...firstAssessment, contractId },
        {
          contractId,
          name: 'Avaliação customizada',
          code: 'custom-assessment',
          scheduleType: 'fixed_interval',
          intervalMonths: 5,
          isActive: true,
        },
      ],
      exercises: [
        { contractId, ...firstExercise },
        { contractId, name: 'Exercício customizado', category: 'RESISTIDO' },
      ],
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
    expect(fake.state.assessments.some((item) => item.code === 'custom-assessment')).toBe(true);
    expect(fake.state.exercises.some((item) => item.name === 'Exercício customizado')).toBe(true);
  });

  it('corrige exercício padrão já persistido com mojibake sem criar duplicata', async () => {
    const correctName = 'Abdominal Pé a Pé';
    const corruptedName = 'Abdominal P\u0082 a P\u0082';
    expect(exerciseDefaults.some((item) => item.name === correctName)).toBe(true);

    const fake = createFakeDb({
      exercises: [
        {
          contractId,
          name: corruptedName,
          category: 'RESISTIDO',
          muscleGroup: 'Abdômen',
        },
        {
          contractId,
          name: 'Exercício customizado',
          category: 'RESISTIDO',
        },
      ],
    });

    await installContractDefaults(contractId, fake.db);

    expect(fake.writes.exerciseUpdateMany).toHaveBeenCalledWith({
      where: { contractId, name: corruptedName },
      data: { name: correctName },
    });
    expect(fake.state.exercises.filter((item) => item.name === correctName)).toHaveLength(1);
    expect(fake.state.exercises.some((item) => item.name === corruptedName)).toBe(false);
    expect(fake.state.exercises.some((item) => item.name === 'Exercício customizado')).toBe(true);

    const createdNames = fake.writes.exerciseCreateMany.mock.calls.flatMap(([args]) =>
      args.data.map((item) => item.name)
    );
    expect(createdNames).not.toContain(correctName);
  });

  it.each([
    ['somente tipo customizado', ['custom-assessment'], ['intermediate', 'complete']],
    ['somente intermediate', ['intermediate'], ['complete']],
    ['somente complete', ['complete'], ['intermediate']],
    ['ambos os tipos padrão', ['intermediate', 'complete'], []],
  ])('preenche tipos de avaliação corretamente com %s', async (_label, existingCodes, expectedCreatedCodes) => {
    const assessments: AssessmentRow[] = existingCodes.map((code) =>
      code === 'custom-assessment'
        ? {
            contractId,
            name: 'Avaliação customizada',
            code,
            scheduleType: 'fixed_interval',
            intervalMonths: 7,
            isActive: true,
          }
        : assessmentRow(contractId, code)
    );
    const fake = createFakeDb({ assessments });

    await installContractDefaults(contractId, fake.db);

    const created = fake.writes.assessmentCreateMany.mock.calls.flatMap(([args]) =>
      args.data.map((item) => item.code)
    );
    expect(created.sort()).toEqual([...expectedCreatedCodes].sort());

    const customAssessment = fake.state.assessments.find(
      (item) => item.code === 'custom-assessment'
    );
    if (existingCodes.includes('custom-assessment')) {
      expect(customAssessment?.intervalMonths).toBe(7);
    } else {
      expect(customAssessment).toBeUndefined();
    }
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

  it('deriva os exercícios instaláveis diretamente do catálogo JSON canônico', () => {
    const canonicalPath = path.resolve(process.cwd(), 'src/scripts/exercises-data.json');
    const canonicalRows = JSON.parse(fs.readFileSync(canonicalPath, 'utf-8')) as Array<{
      nome?: string;
      name?: string;
    }>;
    const canonicalNames = [
      ...new Set(
        canonicalRows
          .map((row) =>
            repairPtBrMojibake(row.name || row.nome || '')
              .trim()
              .replace(/\s+/g, ' ')
          )
          .filter(Boolean)
      ),
    ];

    expect(loadProductExerciseDefaults().map((item) => item.name)).toEqual(canonicalNames);
  });

  it('mantém o catálogo canônico em UTF-8 pt-BR sem marcadores CP850', () => {
    const canonicalPath = path.resolve(process.cwd(), 'src/scripts/exercises-data.json');
    const canonicalSource = fs.readFileSync(canonicalPath, 'utf-8');
    const cp850Markers = /[\u0080-\u009f\u00a0-\u00a3\u00b5-\u00b7\u00c6\u00c7\u00d2-\u00d4\u00d6-\u00d8\u00de]/;

    expect(canonicalSource).not.toMatch(cp850Markers);
    expect(canonicalSource).toContain('Abdominal Máquina');
    expect(canonicalSource).toContain('Abdominal Obliquo na polia média');
    expect(canonicalSource).toContain('Abdominal Pé a Pé');
  });

  it('mantém seed, runtime e tipos de avaliação ligados às definições canônicas compartilhadas', () => {
    const seedSource = fs.readFileSync(path.resolve(process.cwd(), 'prisma/seed-parameters.ts'), 'utf-8');
    const installSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/modules/contracts/contract-defaults.service.ts'),
      'utf-8'
    );
    const assessmentSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/modules/assessments/assessment-type.service.ts'),
      'utf-8'
    );

    expect(seedSource).toContain('PRODUCT_TRAINING_PARAMETERS');
    expect(installSource).toContain('PRODUCT_TRAINING_PARAMETERS');
    expect(installSource).toContain('PRODUCT_ASSESSMENT_TYPES');
    expect(assessmentSource).toContain('PRODUCT_ASSESSMENT_TYPES');
    expect(PRODUCT_TRAINING_PARAMETERS).toHaveLength(26);
    expect(PRODUCT_ASSESSMENT_TYPES.map((item) => item.code)).toEqual(['intermediate', 'complete']);
  });

  it('falha explicitamente quando o catálogo canônico de exercícios está inacessível, sem fallback para tenant', () => {
    const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    try {
      expect(() => loadProductExerciseDefaults()).toThrow('Catálogo padrão de exercícios não encontrado');
    } finally {
      existsSpy.mockRestore();
    }
  });
});

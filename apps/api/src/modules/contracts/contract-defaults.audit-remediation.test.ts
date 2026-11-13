import fs from 'node:fs';
import {
  installContractDefaults,
  loadProductExerciseDefaults,
} from './contract-defaults.service.js';

describe('contract defaults audit remediation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejeita catálogo parcialmente inválido em vez de ignorar a linha defeituosa', () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(
      JSON.stringify([
        { name: 'Exercício válido', muscleGroup: 'Core' },
        { name: '   ', muscleGroup: 'Pernas' },
      ])
    );

    expect(() => loadProductExerciseDefaults()).toThrow(
      'Catálogo padrão de exercícios inválido: item 2 não possui name/nome válido'
    );
  });

  it('consolida variantes de caixa e espaços, sem perder metadados ou a grafia preferencial', () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(
      JSON.stringify([
        { name: 'Agachamento Livre', notes: 'Instrução principal' },
        {
          name: '  agachamento   LIVRE  ', muscleGroup: 'Quadríceps',
          videoUrl: 'https://example.org/video', notes: 'Instrução secundária',
        },
        { name: 'Agachamento lateral', muscleGroup: 'Glúteos' },
      ])
    );

    expect(loadProductExerciseDefaults()).toEqual([
      expect.objectContaining({
        name: 'Agachamento Livre',
        muscleGroup: 'Quadríceps',
        notes: 'Instrução principal',
        videoUrl: 'https://example.org/video',
      }),
      expect.objectContaining({
        name: 'Agachamento lateral',
        muscleGroup: 'Glúteos',
      }),
    ]);
  });

  it('adquire lock transacional por contrato antes de qualquer leitura de instalação', async () => {
    const events: string[] = [];
    const createMany = jest.fn(async (args: { data: unknown[] }) => ({ count: args.data.length }));
    const tx = {
      $executeRaw: jest.fn(async (..._args: unknown[]) => {
        events.push('lock');
        return 1;
      }),
      trainingParameter: {
        findMany: jest.fn(async () => {
          events.push('training-read');
          return [];
        }),
        createMany,
      },
      assessmentType: {
        findMany: jest.fn(async () => {
          events.push('assessment-read');
          return [];
        }),
        createMany,
      },
      exerciseLibrary: {
        findMany: jest.fn(async () => {
          events.push('exercise-read');
          return [];
        }),
        createMany,
      },
    };
    const db = {
      ...tx,
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
        events.push('transaction');
        return callback(tx);
      }),
    } as unknown as Parameters<typeof installContractDefaults>[1];

    await installContractDefaults('target-contract', db);

    expect(events[0]).toBe('transaction');
    expect(events[1]).toBe('lock');
    for (const event of ['training-read', 'assessment-read', 'exercise-read']) {
      expect(events.indexOf(event)).toBeGreaterThan(events.indexOf('lock'));
    }

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const [queryParts, boundContractId] = tx.$executeRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      string,
    ];
    expect(queryParts.join('')).toContain('pg_advisory_xact_lock');
    expect(boundContractId).toBe('target-contract');
    expect((db as any).$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5_000,
      timeout: 15_000,
    });
  });

  it('faz o backfill de muitos exercícios em uma única operação set-based dentro do lock', async () => {
    const defaults = loadProductExerciseDefaults();
    const createMany = jest.fn(async (args: { data: unknown[] }) => ({ count: args.data.length }));
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const tx = {
      $executeRaw: jest.fn(async () => 1),
      trainingParameter: {
        findMany: jest.fn(async () => []),
        createMany,
      },
      assessmentType: {
        findMany: jest.fn(async () => []),
        createMany,
      },
      exerciseLibrary: {
        findMany: jest.fn(async () =>
          defaults.map((item) => ({
            name: item.name,
            videoUrl: null,
            loadType: null,
            movementType: null,
            countingType: null,
            category: null,
            muscleGroup: null,
            notes: null,
          }))
        ),
        createMany,
        updateMany,
      },
    };
    const db = {
      ...tx,
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx)
      ),
    } as unknown as Parameters<typeof installContractDefaults>[1];

    const result = await installContractDefaults('target-contract', db);

    expect(result.exercises.installed).toBe(0);
    expect(result.exercises.skipped).toBe(defaults.length);
    expect(updateMany).not.toHaveBeenCalled();
    // One raw statement acquires the advisory lock and one updates every
    // eligible exercise, regardless of catalog size.
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    const [query] = tx.$executeRaw.mock.calls[1] as unknown as [{ strings: string[] }];
    expect(query.strings.join('')).toContain('"WorkoutExercise"');
    expect(query.strings.join('')).toContain('NOT EXISTS');
    expect(query.strings.join('')).toContain("'system_defaults_repair'");
    expect(query.strings.join('')).not.toContain('"videoUrl"');
  });
  it('#394 A-394-013: guards Prisma fallback against overwriting curated approvals', async () => {
    const defaults = loadProductExerciseDefaults();
    const approved = defaults.find((item) => item.name === 'Abdominal Canoa');
    const draft = defaults.find((item) => item.name === 'Abdominal Bicicleta');
    expect(approved).toBeDefined();
    expect(draft).toBeDefined();

    const createMany = jest.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
    const updateMany = jest.fn(async (_args: unknown) => ({ count: 1 }));
    const row = (name: string, status: 'approved' | 'draft', legacyGrandfathered: boolean) => ({
      name, curationStatus: status, legacyGrandfathered,
      videoUrl: null, loadType: null, movementType: null, countingType: null,
      category: status === 'approved' ? 'RESISTIDO' : null,
      muscleGroup: null, notes: null, workoutExercises: [],
    });
    const db = {
      trainingParameter: { findMany: jest.fn(async () => []), createMany },
      assessmentType: { findMany: jest.fn(async () => []), createMany },
      exerciseLibrary: {
        findMany: jest.fn(async () => [
          row('  Abdominal   Canoa  ', 'approved', false),
          row(draft!.name, 'draft', false),
        ]),
        createMany, updateMany,
      },
    } as unknown as Parameters<typeof installContractDefaults>[1];

    await installContractDefaults('contract-394', db);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        contractId: 'contract-394',
        name: draft!.name,
        NOT: { curationStatus: 'approved', legacyGrandfathered: false },
      }),
      data: expect.objectContaining({ lastCurationAction: 'system_defaults_repair' }),
    }));
  });

});

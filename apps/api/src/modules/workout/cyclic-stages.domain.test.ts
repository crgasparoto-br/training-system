import { normalizeCyclicStages, nestedCyclicStages, replaceCyclicStagesInTransaction, snapshotCyclicStages } from './cyclic-stages.domain';
import { validateWorkoutWeekEnvelope, ResistanceStructureValidationError } from './resistance-structure.domain';

const example = () => [
  { position: 1, kind: 'warmup', durationUnit: 'seconds', durationValue: 600, notes: 'Inicie leve' },
  { position: 2, kind: 'repeat', repeatCount: 4, children: [
    { position: 1, kind: 'work', durationUnit: 'seconds', durationValue: 90, targetKind: 'heart_rate_bpm', targetMin: 153, targetMax: 159 },
    { position: 2, kind: 'recovery', durationUnit: 'seconds', durationValue: 90, targetKind: 'speed_kmh', targetValue: 8.5 },
  ] },
  { position: 3, kind: 'cooldown', durationUnit: 'meters', durationValue: 800 },
];

describe('Issue #398 - domínio de etapas cíclicas', () => {
  it('mantém ordem, unidade, intervalo, repetições e campos opcionais sem zeros artificiais', () => {
    const stages = normalizeCyclicStages(example());
    expect(stages.map((stage) => stage.position)).toEqual([1, 2, 3]);
    expect(stages[1].children).toMatchObject([
      { kind: 'work', durationValue: 90, targetMin: 153, targetMax: 159 },
      { kind: 'recovery', targetValue: 8.5 },
    ]);
    expect(stages[2].targetValue).toBeUndefined();
    expect(normalizeCyclicStages([])).toEqual([]);
    const nested = nestedCyclicStages(stages, 'day-1');
    expect(nested[1].children?.create).toHaveLength(2);
    expect(nested[1].children?.create[0]).toMatchObject({ workoutDayId: 'day-1', position: 1, kind: 'work' });
  });

  it.each([
    [{ position: 2, kind: 'work', durationUnit: 'seconds', durationValue: 90 }],
    [{ position: 1, kind: 'work', durationUnit: 'seconds', durationValue: 0 }],
    [{ position: 1, kind: 'work', durationUnit: 'meters', durationValue: '90' }],
    [{ position: 1, kind: 'work', durationUnit: 'minutes', durationValue: 3 }],
    [{ position: 1, kind: 'work', durationUnit: 'seconds', durationValue: 30, targetKind: 'pse' }],
    [{ position: 1, kind: 'work', durationUnit: 'seconds', durationValue: 30, targetValue: 3 }],
    [{ position: 1, kind: 'work', durationUnit: 'seconds', durationValue: 30, targetKind: 'zone', targetValue: 6 }],
    [{ position: 1, kind: 'work', durationUnit: 'seconds', durationValue: 30, targetKind: 'heart_rate_bpm', targetMin: 180, targetMax: 160 }],
    [{ position: 1, kind: 'work', durationUnit: 'seconds', durationValue: 30, dangerous: { create: true } }],
    [{ position: 1, kind: 'work', durationUnit: 'seconds', durationValue: 30, children: [] }],
    [{ position: 1, kind: 'repeat', repeatCount: 4, children: [
      { position: 1, kind: 'work', durationUnit: 'seconds', durationValue: 30 },
      { position: 2, kind: 'work', durationUnit: 'seconds', durationValue: 30 },
    ] }],
    [{ position: 1, kind: 'repeat', repeatCount: 4, children: [
      { position: 1, kind: 'work', durationUnit: 'seconds', durationValue: 30 },
      { position: 2, kind: 'repeat', repeatCount: 2, children: [] },
    ] }],
  ])('rejeita entrada inválida ou maliciosa %#', (stages) => {
    expect(() => normalizeCyclicStages(stages)).toThrow(ResistanceStructureValidationError);
  });

  it('protege envelope semanal e distingue chave ausente de array vazio', () => {
    expect(() => validateWorkoutWeekEnvelope({ cyclicStages: { 0: [] } })).toThrow(ResistanceStructureValidationError);
    expect(() => validateWorkoutWeekEnvelope({ cyclicStages: { '01': [] } })).toThrow(ResistanceStructureValidationError);
    expect(() => validateWorkoutWeekEnvelope({ cyclicStages: { 1: { create: example() } } })).toThrow(ResistanceStructureValidationError);
    expect(() => validateWorkoutWeekEnvelope({ cyclicStages: { 1: example() } })).not.toThrow();
    expect(() => validateWorkoutWeekEnvelope({ workoutDays: [{ dayOfWeek: 1 }] })).not.toThrow();
  });

  it('preserva IDs em snapshot idêntico e os substitui em uma alteração real', async () => {
    const stages = normalizeCyclicStages(example());
    const persisted = stages.map((stage) => ({
      ...stage, id: `old-${stage.position}`,
      children: stage.children?.map((child) => ({ ...child, id: `child-${child.position}` })) ?? [],
    }));
    const tx: any = { workoutCyclicStage: {
      findMany: jest.fn().mockResolvedValue(persisted),
      deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      create: jest.fn().mockResolvedValue({}),
    } };
    await replaceCyclicStagesInTransaction(tx, 'day-1', stages);
    expect(tx.workoutCyclicStage.deleteMany).not.toHaveBeenCalled();
    await replaceCyclicStagesInTransaction(tx, 'day-1', [{ ...stages[0], durationValue: 750 }, ...stages.slice(1)]);
    expect(tx.workoutCyclicStage.deleteMany).toHaveBeenCalledWith({ where: { workoutDayId: 'day-1' } });
    expect(tx.workoutCyclicStage.create).toHaveBeenCalledTimes(3);
    expect(tx.workoutCyclicStage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workoutDayId: 'day-1', parentStageId: null },
    }));
  });

  it('cópias não carregam IDs ou metadados operacionais da origem', () => {
    const input = snapshotCyclicStages(normalizeCyclicStages(example()).map((stage, i) => ({
      ...stage, id: `source-${i}`, workoutDayId: 'source-day',
    })));
    expect(input[1].children).toHaveLength(2);
    expect(JSON.stringify(input)).not.toContain('source-');
  });
});

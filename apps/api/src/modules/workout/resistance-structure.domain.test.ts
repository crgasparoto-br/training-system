import { assertWorkoutParentIsImmutable, classifyResistanceWriteError, matchResistanceExerciseRows, normalizeResistanceBlocks, sanitizeWorkoutMutation, ResistanceStructureValidationError } from './resistance-structure.domain';
describe('Issue #399 - blocos e séries estruturadas', () => {
  const valid = () => [{ position: 1, kind: 'principal', plannedSets: [
    { position: 1, repsMin: 8, repsMax: 12, loadKg: 35.5, loadPercent: null, rir: 2, rpe: 8, tempo: '3-1-1-0', restSec: 90 },
    { position: 2, repsMin: null, repsMax: null, loadPercent: 70 },
  ] }];
  it('preserva valores, faixas, ordem e campos nulos sem inventar metas', () => {
    const [block] = normalizeResistanceBlocks(valid());
    expect(block.plannedSets[0]).toMatchObject({ repsMin: 8, repsMax: 12, loadKg: 35.5, rir: 2, rpe: 8, restSec: 90 });
    expect(block.plannedSets[1].loadPercent).toBe(70);
    expect(block.plannedSets[1].repsMin).toBeNull();
    expect(normalizeResistanceBlocks([])).toEqual([]);
  });
  it.each([
    [{ ...valid()[0], position: 2 }],
    [{ ...valid()[0], kind: 'incorrect' }],
    [{ ...valid()[0], plannedSets: [] }],
    [{ ...valid()[0], plannedSets: [{ position: 2 }] }],
    [{ ...valid()[0], plannedSets: [{ position: 1, repsMin: 12, repsMax: 8 }] }],
    [{ ...valid()[0], plannedSets: [{ position: 1, rir: -1 }] }],
    [{ ...valid()[0], plannedSets: [{ position: 1, loadKg: '35' }] }],
  ])('rejeita estrutura inválida %#', (block) => {
    expect(() => normalizeResistanceBlocks([block])).toThrow(ResistanceStructureValidationError);
  });
});

describe('Issue #399 - identidade estável e respostas públicas', () => {
  const current = [
    { id: 'saved-a', exerciseId: 'agachamento', section: 'sessao' },
    { id: 'saved-b', exerciseId: 'agachamento', section: 'sessao' },
    { id: 'saved-c', exerciseId: 'supino', section: 'sessao' },
  ];
  it('mantém ids por referência e reserva linhas explícitas contra duplicação', () => {
    expect(matchResistanceExerciseRows(current, [
      { workoutExerciseId: 'saved-b', exerciseId: 'agachamento', section: 'sessao' },
      { exerciseId: 'agachamento', section: 'sessao' },
      { workoutExerciseId: 'saved-c', exerciseId: 'supino', section: 'sessao' },
    ])).toEqual(['saved-b', 'saved-a', 'saved-c']);
    expect(matchResistanceExerciseRows(current, [
      { exerciseId: 'agachamento', section: 'sessao' },
      { exerciseId: 'agachamento', section: 'sessao' },
      { exerciseId: 'agachamento', section: 'sessao' },
    ])).toEqual(['saved-a', 'saved-b', null]);
  });
  it('rejeita ids inexistentes, de outro exercício e duplicados', () => {
    for (const requests of [
      [{ workoutExerciseId: 'foreign', exerciseId: 'agachamento', section: 'sessao' }],
      [{ workoutExerciseId: 'saved-c', exerciseId: 'agachamento', section: 'sessao' }],
      [{ workoutExerciseId: 'saved-a', exerciseId: 'agachamento', section: 'sessao' },
        { workoutExerciseId: 'saved-a', exerciseId: 'agachamento', section: 'sessao' }],
    ]) {
      expect(() => matchResistanceExerciseRows(current, requests)).toThrow(ResistanceStructureValidationError);
    }
  });
  it('não expõe mensagens internas no endpoint', () => {
    const sensitive = classifyResistanceWriteError(new Error('SQL password=secret at /private/path'));
    expect(sensitive).toEqual({ status: 500, body: {
      code: 'WORKOUT_SAVE_FAILED', error: 'Não foi possível salvar os exercícios.',
    } });
    expect(classifyResistanceWriteError(new ResistanceStructureValidationError('raw details'))).toMatchObject({
      status: 400, body: { code: 'INVALID_RESISTANCE_STRUCTURE' },
    });
    expect(classifyResistanceWriteError({ code: 'WORKOUT_PLANNING_LOCKED_AFTER_EXECUTION_START' })).toMatchObject({
      status: 409,
    });
    expect(classifyResistanceWriteError({ code: 'RESISTANCE_DAY_NOT_FOUND' })).toEqual({
      status: 404, body: { error: 'Treino não encontrado.', code: 'RESISTANCE_DAY_NOT_FOUND' },
    });
  });
});

describe('Issue #399 / AUD-399-12 - immutable ownership on edits', () => {
  it.each([
    ['planId', { planId: 'other-contract-plan' }],
    ['templateId', { templateId: 'other-contract-template' }],
    ['planId', { planId: undefined }],
    ['templateId', { templateId: null }],
    ['planId', { plan: { connect: { id: 'other-contract-plan' } } }],
    ['templateId', { template: { connect: { id: 'other-contract-template' } } }],
  ] as const)('rejects explicit %s reassignment, even with empty values', (field, data) => {
    expect(() => assertWorkoutParentIsImmutable(data, field))
      .toThrow(ResistanceStructureValidationError);
  });

  it('accepts ordinary edits and rejects invalid payload shapes', () => {
    expect(() => assertWorkoutParentIsImmutable({ observation1: 'ok' }, 'planId')).not.toThrow();
    expect(() => assertWorkoutParentIsImmutable({ detailNotes: 'ok' }, 'templateId')).not.toThrow();
    for (const invalid of [null, undefined, [], 'text']) {
      expect(() => assertWorkoutParentIsImmutable(invalid, 'templateId'))
        .toThrow(ResistanceStructureValidationError);
    }
  });
});

describe('AUD-399-14: strict HTTP and service write inputs', () => {
  it.each([
    ['template', 'create', { plan: { connect: { id: 'another-contract' } } }],
    ['template', 'update', { workoutDays: { create: [{ dayOfWeek: 1 }] } }],
    ['template', 'update', { resistanceFrequency: { increment: 20 } }],
    ['day', 'create', { template: { connect: { id: 'another-contract' } } }],
    ['day', 'update', { exercises: { create: [{ exerciseId: 'another-contract' }] } }],
    ['day', 'update', { workoutDate: { set: '2026-10-22' } }],
    ['exercise', 'create', { exercise: { connect: { id: 'another-contract' } } }],
    ['exercise', 'update', { executions: { create: [{ loadUsed: 100 }] } }],
    ['exercise', 'create', { resistanceBlocks: { create: [{ position: 1 }] } }],
    ['exercise', 'update', { resistanceBlocks: [{ position: 1, kind: 'principal', plannedSets: [] }] }],
    ['exercise', 'update', { resistanceBlocks: [{ position: 1, kind: 'principal',
      plannedSets: [{ position: 1, executionItems: { create: [{}] } }] }] }],
    ['exercise', 'update', { resistanceBlocks: [{ position: 1, kind: 'principal',
      plannedSets: [{ position: 1, repsMin: 8, unexpected: 1 }] }] }],
  ] as const)('rejects unknown or nested Prisma write %#', (resource, mode, input) => {
    expect(() => sanitizeWorkoutMutation(input, resource, mode))
      .toThrow(ResistanceStructureValidationError);
  });

  it('preserves legitimate optional metadata and validates block/set inputs', () => {
    const valid = { workoutDayId: 'day-1', exerciseId: 'exercise-1', section: 'sessao',
      exerciseOrder: 1, resistanceBlocks: [{
        position: 1, kind: 'principal' as const,
        plannedSets: [{ position: 1, repsMin: 8, repsMax: 12, loadKg: 32.5, rir: null }],
      }],
    };
    expect(sanitizeWorkoutMutation(valid, 'exercise', 'create')).toMatchObject(valid);
    expect(sanitizeWorkoutMutation({ cyclicTimeMin: 12, detailNotes: null }, 'day'))
      .toEqual({ cyclicTimeMin: 12, detailNotes: null });
    expect(sanitizeWorkoutMutation({ observation1: 'normal', coachGoal: undefined }, 'template'))
      .toEqual({ observation1: 'normal' });
  });

  it('rejects calendar dates that JavaScript would otherwise normalize', () => {
    expect(() => sanitizeWorkoutMutation({
      templateId: 'template-1', dayOfWeek: 1, workoutDate: '2026-02-31T00:00:00.000Z',
    }, 'day', 'create')).toThrow(ResistanceStructureValidationError);
    expect(() => sanitizeWorkoutMutation({
      templateId: 'template-1', dayOfWeek: 1, workoutDate: '2026-02-28T00:00:00.000Z',
    }, 'day', 'create')).not.toThrow();
  });

  it('rejects relation-shaped scalars and invalid primitives', () => {
    for (const invalid of [{ exerciseOrder: '1' }, { groupBreakBefore: 'false' }, { workoutDayId: [] }]) {
      expect(() => sanitizeWorkoutMutation(invalid, 'exercise')).toThrow(ResistanceStructureValidationError);
    }
  });

  it.each([
    ['template', 'create', { planId: 'plan-1', mesocycleNumber: null }],
    ['template', 'create', { planId: 'plan-1', weekNumber: null }],
    ['day', 'create', { templateId: 'template-1', dayOfWeek: null }],
    ['exercise', 'create', { workoutDayId: 'day-1', exerciseId: 'exercise-1', section: 'sessao', exerciseOrder: null }],
    ['exercise', 'create', { workoutDayId: 'day-1', exerciseId: 'exercise-1', section: 'sessao', exerciseOrder: 1, groupBreakBefore: null }],
  ] as const)('rejects null in required scalar input %#', (resource, mode, input) => {
    expect(() => sanitizeWorkoutMutation(input, resource, mode)).toThrow(ResistanceStructureValidationError);
  });
});

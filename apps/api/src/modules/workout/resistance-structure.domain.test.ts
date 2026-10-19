import { classifyResistanceWriteError, matchResistanceExerciseRows, normalizeResistanceBlocks, ResistanceStructureValidationError } from './resistance-structure.domain';
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
  });
});

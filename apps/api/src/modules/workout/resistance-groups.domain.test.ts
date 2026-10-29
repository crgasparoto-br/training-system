import { normalizeResistanceGroups } from './resistance-groups.domain';
import { ResistanceStructureValidationError, validateWorkoutWeekEnvelope } from './resistance-structure.domain';

const group = () => ({
  position: 1, kind: 'bi_set', rounds: 3, restBetweenExercisesSec: 15,
  restBetweenRoundsSec: 120, notes: 'Alternar exercícios',
  members: [
    { position: 1, section: 'sessao', exerciseOrder: 1 },
    { position: 2, section: 'sessao', exerciseOrder: 2 },
  ],
});

describe('#400 - agrupamentos explícitos de exercícios existentes', () => {
  it('preserva ordem, tipo, rodadas e intervalos sem criar séries ou IDs falsos', () => {
    const result = normalizeResistanceGroups([group()]);
    expect(result).toEqual([group()]);
    expect(result[0].members).toEqual([
      { position: 1, section: 'sessao', exerciseOrder: 1 },
      { position: 2, section: 'sessao', exerciseOrder: 2 },
    ]);
    expect(normalizeResistanceGroups([])).toEqual([]);
    expect(normalizeResistanceGroups([{ position: 1, kind: 'bloco_tecnico', members: [
      { position: 1, section: 'mobilidade', exerciseOrder: 1 },
    ] }])).toMatchObject([{ rounds: null, restBetweenRoundsSec: null, notes: null }]);
  });
  it.each([
    [[{ ...group(), kind: 'tri_set' }]],
    [[{ ...group(), kind: 'inferred-from-system' }]],
    [[{ ...group(), kind: 'bi_set', members: group().members.slice(0, 1) }]],
    [[{ ...group(), position: 2 }]],
    [[{ ...group(), rounds: 0 }]],
    [[{ ...group(), restBetweenExercisesSec: -1 }]],
    [[{ ...group(), restBetweenRoundsSec: 86401 }]],
    [[{ ...group(), notes: 'a'.repeat(501) }]],
    [[{ ...group(), fakeRelation: { create: [] } }]],
    [[{ ...group(), members: [{ ...group().members[0], workoutExerciseId: 'other-day' }, group().members[1] ] }]],
    [[{ ...group(), members: [{ ...group().members[0], section: 'fake-section' }, group().members[1] ] }]],
    [[group(), { ...group(), position: 2 }]],
  ])('rejeita tipo, forma, cardinalidade ou associação inválida %#', (invalid) => {
    expect(() => normalizeResistanceGroups(invalid)).toThrow(ResistanceStructureValidationError);
  });
  it('permite circuitos e blocos livres sem inferir tipo a partir do sistema', () => {
    expect(normalizeResistanceGroups([{ ...group(), kind: 'circuito' }])[0].kind).toBe('circuito');
    expect(normalizeResistanceGroups([{ ...group(), kind: 'superserie' }])[0].members).toHaveLength(2);
    expect(normalizeResistanceGroups([{ ...group(), kind: 'finalizacao', members: [
      { position: 1, section: 'resfriamento', exerciseOrder: 1 },
    ] }])[0].members).toHaveLength(1);
  });
  it('valida o envelope semanal inteiro sem permitir relações Prisma arbitrárias', () => {
    const valid = { resistanceGroups: { 1: [group()], 2: [] } };
    expect(() => validateWorkoutWeekEnvelope(valid)).not.toThrow();
    expect(() => validateWorkoutWeekEnvelope({ resistanceGroups: { 8: [] } }))
      .toThrow(ResistanceStructureValidationError);
    expect(() => validateWorkoutWeekEnvelope({ resistanceGroups: { 1: [{ ...group(), kind: 'legacy' }] } }))
      .toThrow(ResistanceStructureValidationError);
    expect(() => validateWorkoutWeekEnvelope({ resistanceGroups: { 1: [group()] }, exercises: { deleteMany: {} } }))
      .toThrow(ResistanceStructureValidationError);
    expect(() => validateWorkoutWeekEnvelope({ workoutDays: [], resistedExercises: {}, cyclicStages: {} }))
      .not.toThrow();
  });
});

import type { TrainingSessionExecutionView } from '@corrida/types';
import {
  approvedGuidedExerciseMediaUrl, deriveGuidedResistancePlan, matchesCurrentGuidedUnit, projectGuidedResistance,
  type GuidedResistancePlannedExercise,
} from './guided-resistance.domain.js';

function exercise(id: string, order: number, section = 'sessao'): GuidedResistancePlannedExercise {
  return {
    id, section, exerciseOrder: order, system: null, exercise: { name: 'Exercício ' + id },
    resistanceBlocks: [
      { position: 1, kind: 'principal', notes: null, plannedSets: [
        { id: id + '-set-1', position: 1, repsMin: 10, repsMax: 10, loadKg: 42, loadPercent: null, rir: 2, rpe: 8, tempo: '3-1-1', restSec: 60, notes: null },
        { id: id + '-set-2', position: 2, repsMin: 8, repsMax: 12, loadKg: null, loadPercent: null, rir: null, rpe: null, tempo: null, restSec: null, notes: null },
      ] },
    ],
  };
}
function execution(items: TrainingSessionExecutionView['items'] = [], status: TrainingSessionExecutionView['status'] = 'in_progress'): TrainingSessionExecutionView {
  return {
    sessionId: 'session', status, version: items.length + 1, startedAt: null, finishedAt: null,
    currentPauseStartedAt: null, pausedDurationMs: 0, interruptionReason: null,
    origin: { releaseId: 'release', workoutTemplateId: 'template', trainingPlanId: 'plan' },
    sessionValues: {}, items,
  };
}
describe('issue #487 - plano resistido canônico', () => {
  it('ordena por seção/exercício/bloco/série persistidos, preservando IDs e parâmetros opcionais', () => {
    const plan = deriveGuidedResistancePlan([exercise('b', 2), exercise('a', 1), exercise('warmup', 1, 'mobilidade')]);
    expect(plan.availability).toBe('available');
    expect(plan.units.map((unit) => unit.plannedSetId)).toEqual([
      'warmup-set-1', 'warmup-set-2', 'a-set-1', 'a-set-2', 'b-set-1', 'b-set-2',
    ]);
    expect(plan.units[2]).toMatchObject({ plannedUnitId: 'a', plannedSetId: 'a-set-1', setNumber: 1, repsMin: 10, loadKg: 42, rir: 2, rpe: 8 });
    expect(plan.units[3]).toMatchObject({ setNumber: 2, repsMin: 8, repsMax: 12, loadKg: null });
  });

  it('retoma pelo marcador persistido, não pelo índice renderizado ou valor realizado', () => {
    const plan = deriveGuidedResistancePlan([exercise('b', 2), exercise('a', 1)]);
    const before = projectGuidedResistance('session', execution([
      { plannedUnitId: 'a', plannedSetId: 'a-set-1', setNumber: 1, repetitions: 10, loadKg: 42, completedAt: '2026-10-28T12:00:00.000Z' },
      { plannedUnitId: 'a', plannedSetId: 'a-set-2', setNumber: 2, repetitions: 8, loadKg: null },
    ]), plan);
    expect(before.current?.plannedSetId).toBe('a-set-2');
    expect(before.completed).toBe(1);
    expect(before.next?.plannedSetId).toBe('b-set-1');
    const after = projectGuidedResistance('session', execution([
      { plannedUnitId: 'a', plannedSetId: 'a-set-1', setNumber: 1, completedAt: '2026-10-28T12:00:00.000Z' },
      { plannedUnitId: 'a', plannedSetId: 'a-set-2', setNumber: 2, repetitions: 6, completedAt: '2026-10-28T12:01:00.000Z' },
    ], 'paused'), plan);
    expect(after.current?.plannedSetId).toBe('b-set-1');
    expect(after.status).toBe('paused');
  });

  it('validates the entire planned exercise/set/ordinal identity, including paused state', () => {
    const plan = deriveGuidedResistancePlan([exercise('a', 1)]);
    const view = projectGuidedResistance('session', execution(), plan);
    expect(matchesCurrentGuidedUnit(view, { plannedUnitId: 'a', plannedSetId: 'a-set-1', setNumber: 1 })).toBe(true);
    expect(matchesCurrentGuidedUnit(view, { plannedUnitId: 'a', plannedSetId: 'a-set-1', setNumber: 2 })).toBe(false);
    expect(matchesCurrentGuidedUnit(view, { plannedUnitId: 'b', plannedSetId: 'a-set-1', setNumber: 1 })).toBe(false);
    expect(matchesCurrentGuidedUnit(view, { plannedUnitId: 'a', plannedSetId: 'a-set-2', setNumber: 1 })).toBe(false);
    const paused = projectGuidedResistance('session', execution([], 'paused'), plan);
    expect(matchesCurrentGuidedUnit(paused, { plannedUnitId: 'a', plannedSetId: 'a-set-1', setNumber: 1 })).toBe(false);
  });

  it('fails closed when a completed marker references an incorrect ordinal', () => {
    const plan = deriveGuidedResistancePlan([exercise('a', 1)]);
    const view = projectGuidedResistance('session', execution([
      { plannedUnitId: 'a', plannedSetId: 'a-set-1', setNumber: 2, completedAt: '2026-10-28T12:00:00.000Z' },
    ]), plan);
    expect(view.availability).toBe('legacy_read_only');
    expect(view.current).toBeNull();
  });

  it('não inventa séries legadas ou agrupamentos a partir de textos livres', () => {
    expect(deriveGuidedResistancePlan([{ ...exercise('a', 1), resistanceBlocks: [] }]).availability).toBe('legacy_read_only');
    expect(deriveGuidedResistancePlan([{ ...exercise('a', 1), system: 'Bi-set' }]).availability).toBe('grouping_pending');
    expect(deriveGuidedResistancePlan([{ ...exercise('a', 1), groupBreakBefore: true }]).availability).toBe('grouping_pending');
    expect(deriveGuidedResistancePlan([]).availability).toBe('no_structured_resistance');
  });

  it('bloqueia histórico fora de ordem em vez de avançar incorretamente', () => {
    const plan = deriveGuidedResistancePlan([exercise('a', 1)]);
    const projected = projectGuidedResistance('session', execution([
      { plannedUnitId: 'a', plannedSetId: 'a-set-2', setNumber: 2, completedAt: '2026-10-28T12:00:00.000Z' },
    ]), plan);
    expect(projected.availability).toBe('legacy_read_only');
    expect(projected.current).toBeNull();
  });

  it('uses authored set/block/exercise/catalog guidance, never invented instructions', () => {
    const base = exercise('a', 1);
    expect(deriveGuidedResistancePlan([base]).units[0].notes).toBeNull();
    const withCatalog = { ...base, exercise: { ...base.exercise, notes: 'Postura neutra' } };
    expect(deriveGuidedResistancePlan([withCatalog]).units[0].notes).toBe('Postura neutra');
    const withExercise = { ...withCatalog, exerciseNotes: 'Controle a amplitude' };
    expect(deriveGuidedResistancePlan([withExercise]).units[0].notes).toBe('Controle a amplitude');
  });

  it('exposes only configured HTTPS exercise guidance media', () => {
    expect(approvedGuidedExerciseMediaUrl('https://example.org/videos/exercise')).toBe('https://example.org/videos/exercise');
    for (const unsafe of [null, '', 'javascript:alert(1)', 'data:text/html,invalid', 'http://example.org/video', 'https://user:password@example.org']) {
      expect(approvedGuidedExerciseMediaUrl(unsafe)).toBeNull();
    }
    const original = exercise('a', 1);
    const approved = deriveGuidedResistancePlan([
      { ...original, exercise: { name: 'Agachamento', videoUrl: 'https://example.org/demo' } },
    ]);
    expect(approved.units[0].videoUrl).toBe('https://example.org/demo');
  });

  it('executa bi-set persistido por rodada e participante e aplica só intervalos explícitos', () => {
    const group = {
      id: 'group-1', position: 1, kind: 'bi_set', rounds: 2,
      restBetweenExercisesSec: null, restBetweenRoundsSec: 90, notes: null,
      members: [
        { position: 1, workoutExerciseId: 'a' },
        { position: 2, workoutExerciseId: 'b' },
      ],
    };
    const plan = deriveGuidedResistancePlan([exercise('b', 2), exercise('a', 1)], [group]);
    expect(plan.availability).toBe('available');
    expect(plan.units.map((unit) => [unit.plannedUnitId, unit.setNumber])).toEqual([
      ['a', 1], ['b', 1], ['a', 2], ['b', 2],
    ]);
    expect(plan.units[0]).toMatchObject({
      groupId: 'group-1', groupType: 'bi_set', groupPosition: 1, groupSize: 2,
      roundNumber: 1, roundTotal: 2, restSec: null,
    });
    expect(plan.units[1].restSec).toBe(90);
    expect(plan.units[3].restSec).toBeNull();
  });

  it('não prescreve intervalo entre rodadas após a última rodada em bi-set, tri-set ou circuito', () => {
    for (const [kind, size] of [['bi_set', 2], ['tri_set', 3], ['circuito', 3]] as const) {
      const members = Array.from({ length: size }, (_, index) => exercise(`${kind}-${index}`, index + 1));
      const plan = deriveGuidedResistancePlan(members, [{
        id: `${kind}-1`, position: 1, kind, rounds: 2,
        restBetweenExercisesSec: 15, restBetweenRoundsSec: 90, notes: null,
        members: members.map((member, index) => ({ position: index + 1, workoutExerciseId: member.id })),
      }]);
      expect(plan.availability).toBe('available');
      expect(plan.units).toHaveLength(size * 2);
      expect(plan.units[0].restSec).toBe(15);
      expect(plan.units[size - 1].restSec).toBe(90);
      expect(plan.units[size].roundNumber).toBe(2);
      expect(plan.units[plan.units.length - 1].restSec).toBeNull();
    }
  });

  it('preserva intervalo explicitamente planejado na última série do grupo sem inventar descanso entre rodadas', () => {
    const a = exercise('a', 1);
    const b = exercise('b', 2);
    const bWithRest = {
      ...b,
      resistanceBlocks: b.resistanceBlocks.map((block) => ({
        ...block,
        plannedSets: block.plannedSets.map((set) => (
          set.position === 2 ? { ...set, restSec: 45 } : set
        )),
      })),
    };
    const plan = deriveGuidedResistancePlan([a, bWithRest], [{
      id: 'group-1', position: 1, kind: 'bi_set', rounds: 2,
      restBetweenExercisesSec: null, restBetweenRoundsSec: 90, notes: null,
      members: [{ position: 1, workoutExerciseId: 'a' }, { position: 2, workoutExerciseId: 'b' }],
    }]);
    expect(plan.units[1].restSec).toBe(90);
    expect(plan.units[3].restSec).toBe(45);
  });

  it('respeita agrupamentos explícitos em supersérie, tri-set e circuito', () => {
    for (const [kind, size] of [
      ['superserie', 2],
      ['tri_set', 3],
      ['circuito', 3],
    ] as const) {
      const members = Array.from({ length: size }, (_, index) => exercise(kind + '-' + (index + 1), index + 1));
      const group = {
        id: 'group-' + kind, position: 1, kind, rounds: 2,
        restBetweenExercisesSec: 15, restBetweenRoundsSec: 60, notes: null,
        members: members.map((member, index) => ({ position: index + 1, workoutExerciseId: member.id })),
      };
      const plan = deriveGuidedResistancePlan([...members].reverse(), [group]);
      expect(plan.availability).toBe('available');
      expect(plan.units).toHaveLength(size * 2);
      expect(plan.units.slice(0, size).map((unit) => unit.plannedUnitId))
        .toEqual(members.map((member) => member.id));
      expect(plan.units.slice(0, size).every((unit) => unit.roundNumber === 1)).toBe(true);
      expect(plan.units.slice(size).every((unit) => unit.roundNumber === 2)).toBe(true);
      expect(plan.units[0].restSec).toBe(15);
      expect(plan.units[size - 1].restSec).toBe(60);
    }
  });

  it('respeita a posição canônica do grupo mesmo quando a ordem dos exercícios diverge', () => {
    const source = [
      exercise('a', 1), exercise('b', 2), exercise('solo', 3),
      exercise('c', 4), exercise('d', 5),
    ];
    const groups = [
      { id: 'group-2', position: 2, kind: 'bi_set', rounds: 2,
        restBetweenExercisesSec: null, restBetweenRoundsSec: null, notes: null,
        members: [
          { position: 1, workoutExerciseId: 'a' },
          { position: 2, workoutExerciseId: 'b' },
        ] },
      { id: 'group-1', position: 1, kind: 'bi_set', rounds: 2,
        restBetweenExercisesSec: null, restBetweenRoundsSec: null, notes: null,
        members: [
          { position: 1, workoutExerciseId: 'c' },
          { position: 2, workoutExerciseId: 'd' },
        ] },
    ];
    const plan = deriveGuidedResistancePlan(source, groups);
    expect(plan.availability).toBe('available');
    expect(plan.units.map((unit) => unit.plannedUnitId)).toEqual([
      'c', 'd', 'c', 'd', 'solo', 'solo', 'a', 'b', 'a', 'b',
    ]);
    expect(plan.units.filter((unit) => unit.groupId === 'group-1').map((unit) => unit.roundNumber))
      .toEqual([1, 1, 2, 2]);
  });

  it('não avança agrupamentos com participantes ou séries inconsistentes', () => {
    const first = exercise('a', 1);
    const second = exercise('b', 2);
    const group = {
      id: 'group-1', position: 1, kind: 'bi_set', rounds: 2,
      restBetweenExercisesSec: null, restBetweenRoundsSec: null, notes: null,
      members: [
        { position: 1, workoutExerciseId: 'a' },
        { position: 2, workoutExerciseId: 'b' },
      ],
    };
    expect(deriveGuidedResistancePlan([first, second], [group]).availability).toBe('available');
    expect(deriveGuidedResistancePlan([first, second], [{ ...group, rounds: 3 }]).availability).toBe('legacy_read_only');
    expect(deriveGuidedResistancePlan([first, second], [{ ...group, members: [group.members[0]] }]).availability).toBe('legacy_read_only');
    expect(deriveGuidedResistancePlan([first, second], [{
      ...group, members: [{ position: 1, workoutExerciseId: 'a' }, { position: 2, workoutExerciseId: 'a' }],
    }]).availability).toBe('legacy_read_only');
    expect(deriveGuidedResistancePlan([first, second], [{
      ...group, members: [{ position: 1, workoutExerciseId: 'a' }, { position: 2, workoutExerciseId: 'foreign' }],
    }]).availability).toBe('legacy_read_only');
  });

  it('mantém ausentes como nulos e não considera mera gravação de valores como conclusão', () => {
    const plan = deriveGuidedResistancePlan([exercise('a', 1)]);
    const projected = projectGuidedResistance('session', execution([
      { plannedUnitId: 'a', plannedSetId: 'a-set-1', setNumber: 1, repetitions: 0, loadKg: null },
    ]), plan);
    expect(projected.current?.plannedSetId).toBe('a-set-1');
    expect(projected.completed).toBe(0);
  });
  it('mantém fallback somente leitura para treino misto estruturado e legado', () => {
    const structured = exercise('structured', 1);
    const legacy = { ...exercise('legacy', 2), resistanceBlocks: [] };
    expect(deriveGuidedResistancePlan([structured, legacy])).toEqual({
      availability: 'legacy_read_only', units: [],
    });
    expect(deriveGuidedResistancePlan([structured]).availability).toBe('available');
  });

});

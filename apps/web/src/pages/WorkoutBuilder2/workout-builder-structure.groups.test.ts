import { describe, expect, it } from 'vitest';
import {
  buildResistanceGroupsFromTemplate,
  buildResistedExercisesFromTemplate,
  buildWorkoutWeekSavePayload,
  removeExerciseFromGroupDrafts,
} from './workout-builder-structure';

const exercise = (id: string, order: number) => ({
  id, exerciseId: 'library-' + id, exerciseOrder: order, section: 'sessao',
  exercise: { name: id, category: 'Resistido' },
  resistanceBlocks: [{ position: 1, kind: 'principal', plannedSets: [{ position: 1, repsMin: 8 }] }],
});
const template = {
  workoutDays: [{
    id: 'day-1', dayOfWeek: 1,
    exercises: [exercise('ex-a', 1), exercise('ex-b', 2)],
    resistanceGroups: [{
      id: 'persisted-group', position: 1, kind: 'bi_set', rounds: 3,
      restBetweenExercisesSec: 10, restBetweenRoundsSec: 60, notes: 'Manter cadência',
      members: [
        { id: 'mem-a', position: 1, workoutExerciseId: 'ex-b' },
        { id: 'mem-b', position: 2, workoutExerciseId: 'ex-a' },
      ],
    }],
  }],
};

describe('#400 - serialização e histórico de agrupamentos resistidos', () => {
  it('rehidrata identidades e serializa participantes conforme a posição atual do exercício', () => {
    const resistedExercises = buildResistedExercisesFromTemplate(template);
    const resistanceGroupsByDay = buildResistanceGroupsFromTemplate(template);
    const payload = buildWorkoutWeekSavePayload({ resistedExercises, resistanceGroupsByDay });
    expect(payload.resistanceGroups).toEqual({ 1: [{
      position: 1, kind: 'bi_set', rounds: 3, restBetweenExercisesSec: 10,
      restBetweenRoundsSec: 60, notes: 'Manter cadência',
      members: [{ position: 1, section: 'sessao', exerciseOrder: 2 }, { position: 2, section: 'sessao', exerciseOrder: 1 }],
    }] });
    expect(JSON.stringify(payload)).not.toContain('persisted-group');
    expect(JSON.stringify(payload)).not.toContain('mem-a');
    // Planned set is unaffected by group membership.
    expect(resistedExercises[1].sessao[0].resistanceBlocks[0].plannedSets[0].repsMin).toBe(8);
    expect(buildWorkoutWeekSavePayload({ resistedExercises })).not.toHaveProperty('resistanceGroups');
  });
  it('reconcilia referências no reordenamento de exercícios sem duplicá-los', () => {
    const resistedExercises = buildResistedExercisesFromTemplate(template);
    const resistanceGroupsByDay = buildResistanceGroupsFromTemplate(template);
    resistedExercises[1].sessao.reverse();
    const payload = buildWorkoutWeekSavePayload({ resistedExercises, resistanceGroupsByDay });
    expect(payload.resistanceGroups?.['1'][0].members).toEqual([
      { position: 1, section: 'sessao', exerciseOrder: 1 },
      { position: 2, section: 'sessao', exerciseOrder: 2 },
    ]);
    expect(resistedExercises[1].sessao).toHaveLength(2);
  });
  it('remove vínculos inválidos ao excluir exercício e rejeita referências já ausentes', () => {
    const groups = buildResistanceGroupsFromTemplate(template)[1];
    expect(removeExerciseFromGroupDrafts(groups, 'ex-a')).toEqual([]);
    expect(() => buildWorkoutWeekSavePayload({
      resistedExercises: { 1: { mobilidade: [], sessao: [exercise('ex-a', 1)], resfriamento: [] } },
      resistanceGroupsByDay: { 1: groups },
    })).toThrow(/exercício ausente/);
  });
});

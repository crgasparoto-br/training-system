import { describe, expect, it, vi } from 'vitest';
import {
  buildResistanceGroupsFromTemplate,
  buildResistedExercisesFromTemplate,
  buildWorkoutWeekSavePayload,
  persistPendingWorkoutWeekSnapshot,
  removeExerciseFromGroupDrafts,
  serializeWorkoutWeekSave,
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


describe('#551 - coalescência e revisão de rascunhos semanais', () => {
  const base = { id: 'template-1', baseTemplateUpdatedAt: 'v1', updatedAt: 'v1', observation1: 'original' };

  it('não reenvia um segundo flush agendado depois do primeiro sucesso', async () => {
    const pending = { week: { ...base } };
    const save = vi.fn(async () => ({ updatedAt: 'v2' }));
    expect((await persistPendingWorkoutWeekSnapshot(pending, 'week', save)).status).toBe('cleared');
    expect((await persistPendingWorkoutWeekSnapshot(pending, 'week', save)).status).toBe('empty');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('preserva alterações feitas durante o request e usa a nova revisão no próximo envio', async () => {
    const pending = { week: { ...base } };
    let resolveSave!: (result: { updatedAt: string }) => void;
    const save = vi.fn(() => new Promise<{ updatedAt: string }>((resolve) => { resolveSave = resolve; }));
    const first = persistPendingWorkoutWeekSnapshot(pending, 'week', save);
    pending.week = { ...pending.week, observation1: 'editado durante salvamento' };
    resolveSave({ updatedAt: 'v2' });
    expect((await first).status).toBe('rebased');
    expect(pending.week).toMatchObject({
      observation1: 'editado durante salvamento',
      updatedAt: 'v2',
      baseTemplateUpdatedAt: 'v2',
    });
    const secondSave = vi.fn(async (snapshot: typeof base) => {
      expect(snapshot.baseTemplateUpdatedAt).toBe('v2');
      return { updatedAt: 'v3' };
    });
    expect((await persistPendingWorkoutWeekSnapshot(pending, 'week', secondSave)).status).toBe('cleared');
    expect(secondSave).toHaveBeenCalledTimes(1);
  });

  it('mantém o rascunho em timeout e não assume a revisão de outro template', async () => {
    const original = { ...base };
    const pending = { week: original };
    const fail = vi.fn(async () => { throw new Error('timeout'); });
    await expect(persistPendingWorkoutWeekSnapshot(pending, 'week', fail)).rejects.toThrow('timeout');
    expect(pending.week).toBe(original);

    let resolveSave!: (result: { updatedAt: string }) => void;
    const first = persistPendingWorkoutWeekSnapshot(pending, 'week',
      () => new Promise<{ updatedAt: string }>((resolve) => { resolveSave = resolve; }));
    pending.week = { ...base, id: 'other-template' };
    resolveSave({ updatedAt: 'v2' });
    expect((await first).status).toBe('superseded');
    expect(pending.week).toMatchObject({ id: 'other-template', baseTemplateUpdatedAt: 'v1' });
  });

  it('preserva o mesmo draft em 503 e só o remove após retry confirmado', async () => {
    const draft = { ...base };
    const pending = { week: draft };
    const save = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('connection exhausted'), { code: 'P2024' }))
      .mockResolvedValueOnce({ updatedAt: 'v2' });
    await expect(persistPendingWorkoutWeekSnapshot(pending, 'week', save))
      .rejects.toMatchObject({ code: 'P2024' });
    expect(pending.week).toBe(draft);
    expect(pending.week.baseTemplateUpdatedAt).toBe('v1');
    const result = await persistPendingWorkoutWeekSnapshot(pending, 'week', save);
    expect(result).toEqual({ status: 'cleared', savedUpdatedAt: 'v2' });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[0][0]).toBe(draft);
    expect(save.mock.calls[1][0]).toBe(draft);
    expect('week' in pending).toBe(false);
  });

  it('serializa escritas de semanas diferentes e avança após falha anterior', async () => {
    let finish!: () => void;
    const firstTask = vi.fn(async () => new Promise<void>((resolve) => { finish = resolve; }));
    const secondTask = vi.fn(async () => undefined);
    const first = serializeWorkoutWeekSave(Promise.resolve(), firstTask);
    const second = serializeWorkoutWeekSave(first, secondTask);
    await Promise.resolve();
    await Promise.resolve();
    expect(firstTask).toHaveBeenCalledTimes(1);
    expect(secondTask).not.toHaveBeenCalled();
    finish();
    await Promise.all([first, second]);
    expect(secondTask).toHaveBeenCalledTimes(1);

    const afterError = serializeWorkoutWeekSave(Promise.reject(new Error('timeout')), secondTask);
    await expect(afterError).resolves.toBeUndefined();
    expect(secondTask).toHaveBeenCalledTimes(2);
  });
});

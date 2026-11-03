import { describe, expect, it } from 'vitest';
import { buildWorkoutWeekSavePayload, cyclicStagesForSave } from './workout-builder-structure';

describe('Issue #398 - serialização semanal de etapas cíclicas', () => {
  it('deixa um dia legado intocado quando a estrutura cíclica está ausente', () => {
    const payload = buildWorkoutWeekSavePayload({
      weekStartDate: '2026-10-26T12:00:00.000Z',
      workoutDays: { 1: { dayOfWeek: 1, detailNotes: 'Correr leve' } },
    });
    expect(payload).not.toHaveProperty('cyclicStages');
    expect(payload.workoutDays[0].detailNotes).toBe('Correr leve');
  });

  it('remove IDs persistidos e renumera grupos e filhos sem perder a prescrição', () => {
    const stages = [{ id: 'old-stage', kind: 'repeat', position: 9, repeatCount: 4, children: [
      { id: 'child-1', kind: 'work', position: 7, durationUnit: 'seconds', durationValue: 90, targetKind: 'heart_rate_bpm', targetMin: 153, targetMax: 159 },
      { id: 'child-2', kind: 'recovery', position: 8, durationUnit: 'seconds', durationValue: 60 },
    ] }];
    expect(cyclicStagesForSave(stages)).toEqual([{
      position: 1, kind: 'repeat', repeatCount: 4, children: [
        { position: 1, kind: 'work', durationUnit: 'seconds', durationValue: 90, targetKind: 'heart_rate_bpm', targetMin: 153, targetMax: 159 },
        { position: 2, kind: 'recovery', durationUnit: 'seconds', durationValue: 60 },
      ],
    }]);
    const payload = buildWorkoutWeekSavePayload({
      weekStartDate: '2026-10-26T12:00:00.000Z',
      workoutDays: { 1: { dayOfWeek: 1, cyclicStages: stages, detailNotes: 'Legado' } },
    });
    expect(JSON.stringify(payload.cyclicStages)).not.toContain('old-stage');
    expect(payload.workoutDays[0].detailNotes).toBe('Legado');
  });

  it('distingue remoção intencional de dias sem alteração de etapas', () => {
    const payload = buildWorkoutWeekSavePayload({
      workoutDays: [{ dayOfWeek: 1, cyclicStages: [] }, { dayOfWeek: 2 }],
    });
    expect(payload.cyclicStages).toEqual({ 1: [] });
  });
});

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WEEKS_PER_MESOCYCLE,
  resolveWorkoutBuilderWeekOptions,
} from './workout-builder-week-options';

describe('resolveWorkoutBuilderWeekOptions', () => {
  it('respeita uma matriz com 3 semanas sem criar a semana 4 provisoriamente', () => {
    expect(resolveWorkoutBuilderWeekOptions(3)).toEqual({
      weeksPerMesocycle: 3,
      weekOptions: [1, 2, 3],
    });
  });

  it('inclui todas as semanas quando a matriz possui 5 semanas', () => {
    expect(resolveWorkoutBuilderWeekOptions(5)).toEqual({
      weeksPerMesocycle: 5,
      weekOptions: [1, 2, 3, 4, 5],
    });
  });

  it('usa o fallback estrutural do builder para cardinalidade ausente ou inválida', () => {
    expect(resolveWorkoutBuilderWeekOptions(undefined)).toEqual({
      weeksPerMesocycle: DEFAULT_WEEKS_PER_MESOCYCLE,
      weekOptions: [1, 2, 3, 4],
    });
    expect(resolveWorkoutBuilderWeekOptions(0)).toEqual({
      weeksPerMesocycle: DEFAULT_WEEKS_PER_MESOCYCLE,
      weekOptions: [1, 2, 3, 4],
    });
  });
});

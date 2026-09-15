import { describe, expect, it } from 'vitest';
import { resolveWorkoutBuilderCyclicSummary } from './workout-builder-cyclic-summary';

describe('resolveWorkoutBuilderCyclicSummary', () => {
  it('deriva o resumo cíclico a partir do estímulo canônico da matriz', () => {
    expect(
      resolveWorkoutBuilderCyclicSummary({
        id: 'cyclic-1',
        matrixId: 'matrix-1',
        mesocycleNumber: 2,
        weekNumber: 3,
        totalVolumeMinutes: 240,
        totalVolumeKm: 32.5,
        minutesZ1: 60,
        minutesZ2: 96,
        minutesZ3: 48,
        minutesZ4: 24,
        minutesZ5: 12,
      })
    ).toEqual({
      totalVolumeMin: 240,
      totalVolumeKm: 32.5,
      distributionZ1: 25,
      distributionZ2: 40,
      distributionZ3: 20,
      distributionZ4: 10,
      distributionZ5: 5,
    });
  });

  it('preserva zeros válidos em vez de aplicar defaults artificiais', () => {
    expect(
      resolveWorkoutBuilderCyclicSummary({
        id: 'cyclic-2',
        matrixId: 'matrix-1',
        mesocycleNumber: 1,
        weekNumber: 1,
        totalVolumeMinutes: 0,
        totalVolumeKm: 0,
        minutesZ1: 0,
        minutesZ2: 0,
        minutesZ3: 0,
        minutesZ4: 0,
        minutesZ5: 0,
      })
    ).toEqual({
      totalVolumeMin: 0,
      totalVolumeKm: 0,
      distributionZ1: 0,
      distributionZ2: 0,
      distributionZ3: 0,
      distributionZ4: 0,
      distributionZ5: 0,
    });
  });

  it('retorna zeros quando não há estímulo para a semana', () => {
    expect(resolveWorkoutBuilderCyclicSummary(null)).toEqual({
      totalVolumeMin: 0,
      totalVolumeKm: 0,
      distributionZ1: 0,
      distributionZ2: 0,
      distributionZ3: 0,
      distributionZ4: 0,
      distributionZ5: 0,
    });
  });
});

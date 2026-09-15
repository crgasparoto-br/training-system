import type { CyclicStimulus } from '../services/periodization.service';

export type WorkoutBuilderCyclicSummary = {
  totalVolumeMin: number;
  totalVolumeKm: number;
  distributionZ1: number;
  distributionZ2: number;
  distributionZ3: number;
  distributionZ4: number;
  distributionZ5: number;
};

const DEFAULT_CYCLIC_SUMMARY: WorkoutBuilderCyclicSummary = {
  totalVolumeMin: 0,
  totalVolumeKm: 0,
  distributionZ1: 0,
  distributionZ2: 0,
  distributionZ3: 0,
  distributionZ4: 0,
  distributionZ5: 0,
};

const resolveDistribution = (
  totalVolumeMin: number,
  zoneMinutes: number | null | undefined
) => {
  if (!Number.isFinite(totalVolumeMin) || totalVolumeMin <= 0) {
    return 0;
  }

  const normalizedZoneMinutes =
    typeof zoneMinutes === 'number' && Number.isFinite(zoneMinutes) ? zoneMinutes : 0;

  return Math.round((normalizedZoneMinutes / totalVolumeMin) * 100);
};

export function resolveWorkoutBuilderCyclicSummary(
  stimulus: CyclicStimulus | null | undefined
): WorkoutBuilderCyclicSummary {
  if (!stimulus) {
    return DEFAULT_CYCLIC_SUMMARY;
  }

  const totalVolumeMin =
    typeof stimulus.totalVolumeMinutes === 'number' && Number.isFinite(stimulus.totalVolumeMinutes)
      ? stimulus.totalVolumeMinutes
      : 0;
  const totalVolumeKm =
    typeof stimulus.totalVolumeKm === 'number' && Number.isFinite(stimulus.totalVolumeKm)
      ? stimulus.totalVolumeKm
      : 0;

  return {
    totalVolumeMin,
    totalVolumeKm,
    distributionZ1: resolveDistribution(totalVolumeMin, stimulus.minutesZ1),
    distributionZ2: resolveDistribution(totalVolumeMin, stimulus.minutesZ2),
    distributionZ3: resolveDistribution(totalVolumeMin, stimulus.minutesZ3),
    distributionZ4: resolveDistribution(totalVolumeMin, stimulus.minutesZ4),
    distributionZ5: resolveDistribution(totalVolumeMin, stimulus.minutesZ5),
  };
}

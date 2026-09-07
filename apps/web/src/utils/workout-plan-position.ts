export type WorkoutBuilderPosition = {
  mesocycleNumber: number;
  weekNumber: number;
};

/**
 * Converte a semana global do plano para a posição usada pelo WorkoutBuilder2.
 *
 * Exemplo com 4 semanas por mesociclo:
 * semana global 1 -> meso 1 / micro 1
 * semana global 4 -> meso 1 / micro 4
 * semana global 5 -> meso 2 / micro 1
 */
export function resolveWorkoutBuilderPosition(
  globalWeekNumber: number,
  weeksPerMesocycle: number
): WorkoutBuilderPosition {
  const normalizedWeek = Number.isFinite(globalWeekNumber)
    ? Math.max(1, Math.trunc(globalWeekNumber))
    : 1;
  const normalizedWeeksPerMesocycle = Number.isFinite(weeksPerMesocycle)
    ? Math.max(1, Math.trunc(weeksPerMesocycle))
    : 4;
  const zeroBasedWeek = normalizedWeek - 1;

  return {
    mesocycleNumber: Math.floor(zeroBasedWeek / normalizedWeeksPerMesocycle) + 1,
    weekNumber: (zeroBasedWeek % normalizedWeeksPerMesocycle) + 1,
  };
}

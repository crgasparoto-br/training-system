export const DEFAULT_WEEKS_PER_MESOCYCLE = 4;

export function resolveWorkoutBuilderWeekOptions(
  weeksPerMesocycle: number | null | undefined,
  fallback = DEFAULT_WEEKS_PER_MESOCYCLE
): { weeksPerMesocycle: number; weekOptions: number[] } {
  const fallbackWeeks = Number.isInteger(fallback) && fallback > 0
    ? fallback
    : DEFAULT_WEEKS_PER_MESOCYCLE;
  const resolvedWeeks = Number.isInteger(weeksPerMesocycle) && Number(weeksPerMesocycle) > 0
    ? Number(weeksPerMesocycle)
    : fallbackWeeks;

  return {
    weeksPerMesocycle: resolvedWeeks,
    weekOptions: Array.from({ length: resolvedWeeks }, (_, index) => index + 1),
  };
}

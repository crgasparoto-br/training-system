/**
 * Apply only catalog properties already selected for this audience. A published
 * prescription reads its release-time catalog snapshot, never mutable library
 * fields; legacy pre-migration rows have a documented live-data fallback.
 */
export type ReleasedCatalogRecord = { catalog: unknown } | null | undefined;

const CATALOG_FIELDS = [
  'name', 'videoUrl', 'category', 'muscleGroup',
  'loadType', 'movementType', 'countingType', 'notes',
] as const;

export function projectReleasedExerciseCatalog<T extends { name: string }>(
  live: T, captured: ReleasedCatalogRecord,
): T {
  const raw = captured?.catalog;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return live;
  const snapshot = raw as Record<string, unknown>;
  if (typeof snapshot.name !== 'string') return live;

  const projected: Record<string, unknown> = { ...live };
  for (const field of CATALOG_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(live, field)) continue;
    const value = snapshot[field];
    if (typeof value === 'string' || value === null) projected[field] = value;
  }
  return projected as T;
}

export function projectWorkoutDayExerciseCatalog<T>(day: T, released: boolean): T {
  if (!day || typeof day !== 'object' || !('exercises' in day) ||
    !Array.isArray(day.exercises)) return day;
  const exercises = day.exercises.map((item: unknown) => {
    if (!item || typeof item !== 'object') return item;
    const { releasedCatalog, ...rest } = item as Record<string, unknown>;
    if (!released || !rest.exercise || typeof rest.exercise !== 'object' ||
      !('name' in rest.exercise) || typeof rest.exercise.name !== 'string') return rest;
    return { ...rest, exercise: projectReleasedExerciseCatalog(
      rest.exercise as { name: string }, releasedCatalog as ReleasedCatalogRecord,
    ) };
  });
  return { ...day, exercises } as T;
}

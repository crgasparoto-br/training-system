/**
 * Apply only catalog properties already selected for this audience. A published
 * prescription reads its release-time catalog snapshot, never mutable library
 * fields; legacy pre-migration rows have a documented live-data fallback.
 */
export type ReleasedCatalogRecord = { catalog: unknown } | null | undefined;

const CATALOG_FIELDS = [
  'name', 'videoUrl', 'category', 'muscleGroup',
  'loadType', 'movementType', 'countingType', 'notes',
  'mediaOrigin', 'mediaLicense',
] as const;

/** Historical exercise links remain intact; never expose unverifiable third-party videos. */
export function hideUnverifiedExerciseVideo<T extends { name: string }>(exercise: T): T {
  const row = exercise as Record<string, unknown>;
  if (typeof row.videoUrl !== 'string' || !row.videoUrl.trim()) return exercise;
  if (row.legacyGrandfathered === true ||
      typeof row.mediaOrigin !== 'string' || !row.mediaOrigin.trim() ||
      typeof row.mediaLicense !== 'string' || !row.mediaLicense.trim()) {
    return { ...exercise, videoUrl: null } as T;
  }
  return exercise;
}

export function projectReleasedExerciseCatalog<T extends { name: string }>(
  live: T, captured: ReleasedCatalogRecord,
): T {
  const raw = captured?.catalog;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return hideUnverifiedExerciseVideo(live);
  const snapshot = raw as Record<string, unknown>;
  if (typeof snapshot.name !== 'string') return hideUnverifiedExerciseVideo(live);

  const projected: Record<string, unknown> = { ...live };
  for (const field of CATALOG_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(live, field)) continue;
    const value = snapshot[field];
    if (typeof value === 'string' || value === null) projected[field] = value;
  }
  // Preserve the approval/legacy state from release, not a later live catalog edit.
  if (typeof snapshot.legacyGrandfathered === 'boolean') {
    projected.legacyGrandfathered = snapshot.legacyGrandfathered;
  }
  // A released video must carry provenance in its own historical snapshot.
  // Never pair an older URL with a new license stored on the live catalog.
  if (typeof snapshot.videoUrl === 'string' && snapshot.videoUrl.trim() &&
      (typeof snapshot.mediaOrigin !== 'string' || !snapshot.mediaOrigin.trim() ||
       typeof snapshot.mediaLicense !== 'string' || !snapshot.mediaLicense.trim())) {
    projected.videoUrl = null;
  }
  return hideUnverifiedExerciseVideo(projected as T);
}

export function projectWorkoutDayExerciseCatalog<T>(day: T, released: boolean): T {
  if (!day || typeof day !== 'object' || !('exercises' in day) ||
    !Array.isArray(day.exercises)) return day;
  const exercises = day.exercises.map((item: unknown) => {
    if (!item || typeof item !== 'object') return item;
    const { releasedCatalog, ...rest } = item as Record<string, unknown>;
    if (!rest.exercise || typeof rest.exercise !== 'object' ||
      !('name' in rest.exercise) || typeof rest.exercise.name !== 'string') return rest;
    if (!released) return { ...rest, exercise: hideUnverifiedExerciseVideo(rest.exercise as { name: string }) };
    return { ...rest, exercise: projectReleasedExerciseCatalog(
      rest.exercise as { name: string }, releasedCatalog as ReleasedCatalogRecord,
    ) };
  });
  return { ...day, exercises } as T;
}

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

function hideUncapturedReleaseVideo<T extends { name: string }>(exercise: T): T {
  if (!Object.prototype.hasOwnProperty.call(exercise, 'videoUrl')) return exercise;
  return { ...exercise, videoUrl: null } as T;
}

/** Filter media from library relations before returning HTTP responses. */
export function projectWorkoutExerciseMedia<T extends { exercise: { name: string } }>(row: T): T {
  return { ...row, exercise: hideUnverifiedExerciseVideo(row.exercise) };
}

export function projectWorkoutExecutionMedia<T extends { workoutExercise: { exercise: { name: string } } }>(row: T): T {
  return { ...row, workoutExercise: projectWorkoutExerciseMedia(row.workoutExercise) };
}

/** Present immutable release-time catalog data for historical executions. */
export function projectWorkoutExecutionHistory<T extends {
  workoutExercise: {
    exercise: { name: string };
    releasedCatalog: ReleasedCatalogRecord;
    workoutDay: { template: { released: boolean } };
  };
}>(row: T) {
  const { releasedCatalog, ...workoutExercise } = row.workoutExercise;
  return {
    ...row,
    workoutExercise: {
      ...workoutExercise,
      exercise: workoutExercise.workoutDay.template.released
        ? projectReleasedExerciseCatalog(workoutExercise.exercise, releasedCatalog)
        : hideUnverifiedExerciseVideo(workoutExercise.exercise),
    },
  };
}

export function projectReleasedExerciseCatalog<T extends { name: string }>(
  live: T, captured: ReleasedCatalogRecord,
): T {
  const raw = captured?.catalog;
  // Live catalog labels can be a historical fallback, but later licensing
  // must never retroactively grant rights to an uncaptured release video.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return hideUncapturedReleaseVideo(live);
  const snapshot = raw as Record<string, unknown>;
  if (typeof snapshot.name !== 'string') return hideUncapturedReleaseVideo(live);

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
  // Media must carry both verified provenance and non-legacy release status
  // in the same immutable snapshot, not in a later library revision.
  const licensedAtRelease = typeof snapshot.videoUrl === 'string' && !!snapshot.videoUrl.trim()
    && typeof snapshot.mediaOrigin === 'string' && !!snapshot.mediaOrigin.trim()
    && typeof snapshot.mediaLicense === 'string' && !!snapshot.mediaLicense.trim()
    && snapshot.legacyGrandfathered === false;
  if (!licensedAtRelease && Object.prototype.hasOwnProperty.call(projected, 'videoUrl')) {
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

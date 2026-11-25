import { hasAuthorizedExerciseMedia } from '../library/library-curation.domain.js';

/**
 * Apply only catalog properties already selected for this audience. A published
 * prescription reads its release-time catalog snapshot, never mutable library
 * fields; legacy pre-migration rows have a documented live-data fallback.
 */
export type ReleasedCatalogRecord = { catalog: unknown } | null | undefined;

const CATALOG_FIELDS = [
  'name', 'category', 'muscleGroup',
  'loadType', 'movementType', 'countingType', 'notes',
] as const;

/** Historical exercise links remain intact; never expose unverifiable third-party videos. */
export function hideUnverifiedExerciseVideo<T extends { name: string }>(exercise: T): T {
  const row = exercise as Record<string, unknown>;
  if (typeof row.videoUrl !== 'string' || !row.videoUrl.trim()) return exercise;
  if (row.legacyGrandfathered === true ||
      !hasAuthorizedExerciseMedia(row.mediaOrigin, row.mediaLicense)) {
    return { ...exercise, videoUrl: null } as T;
  }
  return exercise;
}

function hideUncapturedReleaseVideo<T extends { name: string }>(exercise: T): T {
  if (!Object.prototype.hasOwnProperty.call(exercise, 'videoUrl')) return exercise;
  return { ...exercise, videoUrl: null } as T;
}

/** Live catalog relations require current professional approval; snapshots use their own provenance. */
export function hideUnapprovedLiveExerciseVideo<T extends { name: string }>(exercise: T): T {
  const row = exercise as Record<string, unknown>;
  if (row.curationStatus !== 'approved' || row.legacyGrandfathered !== false) {
    return hideUncapturedReleaseVideo(exercise);
  }
  return hideUnverifiedExerciseVideo(exercise);
}

/** Filter media from library relations before returning HTTP responses. */
export function projectWorkoutExerciseMedia<T extends { exercise: { name: string } }>(row: T): T {
  // Historic scalar-only responses have no nested video URL to disclose.
  // Keep their public shape rather than throwing while sanitizing rich records.
  if (!row?.exercise || typeof row.exercise !== 'object' ||
      typeof row.exercise.name !== 'string') return row;
  return { ...row, exercise: hideUnapprovedLiveExerciseVideo(row.exercise) };
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
        : hideUnapprovedLiveExerciseVideo(workoutExercise.exercise),
    },
  };
}

export function projectReleasedExerciseCatalog<T extends { name: string }>(
  live: T, captured: ReleasedCatalogRecord,
): T {
  const raw = captured?.catalog;
  // Live labels may be a fallback; media provenance never is. Treat absent
  // or malformed captures as having no historical evidence of media rights.
  const snapshot = raw && typeof raw === 'object' && !Array.isArray(raw) &&
    typeof (raw as Record<string, unknown>).name === 'string'
    ? raw as Record<string, unknown> : {};

  const projected: Record<string, unknown> = { ...live };
  for (const field of CATALOG_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(live, field)) continue;
    const value = snapshot[field];
    if (typeof value === 'string' || value === null) projected[field] = value;
  }
  // Keep the selected response shape. Missing provenance is unknown, not the
  // current catalog's origin, license, or author. Missing legacy status is
  // treated conservatively as legacy for this projection only.
  for (const field of ['mediaOrigin', 'mediaLicense', 'mediaAuthor'] as const) {
    if (Object.prototype.hasOwnProperty.call(live, field)) {
      projected[field] = typeof snapshot[field] === 'string' ? snapshot[field] : null;
    }
  }
  if (Object.prototype.hasOwnProperty.call(live, 'legacyGrandfathered')) {
    projected.legacyGrandfathered = typeof snapshot.legacyGrandfathered === 'boolean'
      ? snapshot.legacyGrandfathered : true;
  }
  // The immutable snapshot must declare origin and, for third-party media,
  // license at release time. Later catalog edits cannot authorize old links.
  const authorizedAtRelease = typeof snapshot.videoUrl === 'string' && !!snapshot.videoUrl.trim()
    && hasAuthorizedExerciseMedia(snapshot.mediaOrigin, snapshot.mediaLicense)
    && snapshot.legacyGrandfathered === false;
  if (Object.prototype.hasOwnProperty.call(live, 'videoUrl')) {
    projected.videoUrl = authorizedAtRelease ? snapshot.videoUrl : null;
  }
  return projected as T;
}

export function projectWorkoutDayExerciseCatalog<T>(day: T, released: boolean): T {
  if (!day || typeof day !== 'object' || !('exercises' in day) ||
    !Array.isArray(day.exercises)) return day;
  const exercises = day.exercises.map((item: unknown) => {
    if (!item || typeof item !== 'object') return item;
    const { releasedCatalog, ...rest } = item as Record<string, unknown>;
    if (!rest.exercise || typeof rest.exercise !== 'object' ||
      !('name' in rest.exercise) || typeof rest.exercise.name !== 'string') return rest;
    if (!released) return { ...rest, exercise: hideUnapprovedLiveExerciseVideo(rest.exercise as { name: string }) };
    return { ...rest, exercise: projectReleasedExerciseCatalog(
      rest.exercise as { name: string }, releasedCatalog as ReleasedCatalogRecord,
    ) };
  });
  return { ...day, exercises } as T;
}

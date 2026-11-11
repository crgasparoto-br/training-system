import { hideUnverifiedExerciseVideo } from '../workout/workout-release-catalog.js';

/**
 * Output-only redaction of operational exercise snapshots, including legacy
 * nested substitution refs. Only provenance recorded WITH the historical URL
 * can authorize exposing it; current library rights cannot be inherited.
 * Never mutate or re-persist the stored assembly/version data.
 */
const SNAPSHOT_KEYS = new Set([
  'exerciseSnapshot',
  'operationalExerciseSnapshot',
  'originalExerciseSnapshot',
  'substituteExerciseSnapshot',
]);

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sanitizeSnapshot(value: Record<string, unknown>): Record<string, unknown> {
  // Invalid legacy shapes are not proof of license even when arbitrary fields claim it.
  if (typeof value.name !== 'string') {
    return typeof value.videoUrl === 'string' && value.videoUrl.trim()
      ? { ...value, videoUrl: null }
      : value;
  }
  return hideUnverifiedExerciseVideo(value as Record<string, unknown> & { name: string });
}

export function sanitizeConsolidatedOperationalMedia<T>(value: T): T {
  if (Array.isArray(value)) {
    const sanitized = value.map(sanitizeConsolidatedOperationalMedia);
    return (sanitized.some((item, index) => item !== value[index]) ? sanitized : value) as T;
  }
  if (!plainRecord(value)) return value;

  let result: Record<string, unknown> | null = null;
  for (const [key, entry] of Object.entries(value)) {
    const sanitized = SNAPSHOT_KEYS.has(key) && plainRecord(entry)
      ? sanitizeSnapshot(entry)
      : sanitizeConsolidatedOperationalMedia(entry);
    if (sanitized !== entry) {
      if (!result) result = { ...value };
      result[key] = sanitized;
    }
  }
  return (result ?? value) as T;
}

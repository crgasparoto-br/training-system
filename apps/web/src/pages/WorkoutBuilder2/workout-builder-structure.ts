import { isDateWithinRange, parseDateOnly, resolveDateForDayOfWeek, toDateInputValue, toIsoDateAtNoonUTC } from '../../utils/date';

export type ResistedSectionKey = 'mobilidade' | 'sessao' | 'resfriamento';

export const normalizeWorkoutDays = (workoutDays: any) => {
  if (Array.isArray(workoutDays)) {
    return workoutDays.reduce<Record<number, any>>((acc, day) => {
      acc[day.dayOfWeek] = day;
      return acc;
    }, {});
  }
  if (workoutDays && typeof workoutDays === 'object') {
    return Object.entries(workoutDays).reduce<Record<number, any>>((acc, [key, day]) => {
      const rawDay = (day ?? {}) as Record<string, any>;
      const dayOfWeek = Number(rawDay.dayOfWeek ?? key);
      acc[dayOfWeek] = { ...rawDay, dayOfWeek };
      return acc;
    }, {});
  }
  return {};
};

export const buildResistedExercisesFromTemplate = (template: any) => {
  const base: Record<number, Record<ResistedSectionKey, any[]>> = {};
  for (let day = 1; day <= 7; day += 1) {
    base[day] = { mobilidade: [], sessao: [], resfriamento: [] };
  }

  const workoutDays = Array.isArray(template?.workoutDays)
    ? template.workoutDays
    : Object.values(template?.workoutDays || {});

  workoutDays.forEach((day: any) => {
    const dayOfWeek = day?.dayOfWeek;
    if (!dayOfWeek) return;
    const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
    exercises.forEach((exercise: any) => {
      const section = (exercise.section as ResistedSectionKey) || 'sessao';
      if (!base[dayOfWeek]) {
        base[dayOfWeek] = { mobilidade: [], sessao: [], resfriamento: [] };
      }
      base[dayOfWeek][section] = base[dayOfWeek][section] || [];
      base[dayOfWeek][section].push({
        id: exercise.id,
        workoutExerciseId: exercise.id,
        exerciseId: exercise.exerciseId,
        name: exercise.exercise?.name ?? '',
        category: exercise.exercise?.category ?? exercise.exerciseCategory,
        system: exercise.system ?? null,
        groupBreakBefore: exercise.groupBreakBefore ?? false,
        groupId: exercise.groupId ?? null,
        groupType: exercise.groupType ?? null,
        groupPosition: exercise.groupPosition ?? null,
        groupRounds: exercise.groupRounds ?? null,
        sets: exercise.sets ?? null,
        reps: exercise.reps ?? null,
        interval: exercise.intervalSec ?? null,
        cParam: exercise.cParam ?? null,
        eParam: exercise.eParam ?? null,
        load: exercise.load ?? null,
        adjustment: exercise.exerciseNotes ?? null,
        resistanceBlocks: Array.isArray(exercise.resistanceBlocks) ? exercise.resistanceBlocks.map((block: any) => ({
          position: block.position, kind: block.kind, notes: block.notes,
          plannedSets: block.plannedSets?.map((set: any) => ({
            position: set.position, repsMin: set.repsMin, repsMax: set.repsMax,
            loadKg: set.loadKg, loadPercent: set.loadPercent,
            rir: set.rir, rpe: set.rpe, tempo: set.tempo, restSec: set.restSec, notes: set.notes,
          })) ?? [],
        })) : undefined,
      });
    });
  });

  return base;
};


export function buildWorkoutCacheKey(
  draftActorKey: string | undefined,
  planId: string | undefined,
  mesocycle: number,
  week: number,
  planUpdatedAt?: string,
  templateUpdatedAt?: string,
) {
  if (!planId || !draftActorKey) return null;
  const version = templateUpdatedAt || planUpdatedAt || 'unknown-version';
  return `workoutBuilder2:${draftActorKey}:${planId}:${mesocycle}:${week}:${version}`;
}

function buildWorkoutCachePrefix(draftActorKey: string | undefined, contextPlanId: string | undefined, mesocycle: number, week: number) {
  if (!contextPlanId || !draftActorKey) return null;
  return `workoutBuilder2:${draftActorKey}:${contextPlanId}:${mesocycle}:${week}:`;
}

export function clearWorkoutDraftCacheForWeek(draftActorKey: string | undefined, contextPlanId: string | undefined, mesocycle: number, week: number) {
  const prefix = buildWorkoutCachePrefix(draftActorKey, contextPlanId, mesocycle, week);
  if (!prefix) return;
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) localStorage.removeItem(key);
    }
  } catch {
    // localStorage is an optional recovery buffer.
  }
}

export const rehydrateDraftFromApi = (templateFromApi: any, candidate: any) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const allowedKeys = new Set([
      'id', 'planId', 'alunoId', 'mesocycleNumber', 'weekNumber', 'weekStartDate',
      'released', 'releasedAt', 'updatedAt', 'baseTemplateUpdatedAt', 'planUpdatedAt',
      'cyclicFrequency', 'resistanceFrequency', 'totalVolumeMin', 'totalVolumeKm',
      'loadPercentage', 'repZone', 'repReserve', 'trainingMethod', 'trainingDivision',
      'alunoGoal', 'coachGoal', 'observation1', 'observation2',
      'workoutDays', 'resistedExercises',
      'distributionZ1', 'distributionZ2', 'distributionZ3', 'distributionZ4', 'distributionZ5',
    ]);
    if (Object.keys(candidate).some((key) => !allowedKeys.has(key))) return null;
    if (candidate.id !== templateFromApi.id
      || candidate.planId !== templateFromApi.planId
      || Number(candidate.mesocycleNumber) !== Number(templateFromApi.mesocycleNumber)
      || Number(candidate.weekNumber) !== Number(templateFromApi.weekNumber)
      || candidate.baseTemplateUpdatedAt !== templateFromApi.updatedAt) return null;
    if (candidate.workoutDays !== undefined
      && !Array.isArray(candidate.workoutDays)
      && (!candidate.workoutDays || typeof candidate.workoutDays !== 'object')) return null;
    if (candidate.resistedExercises !== undefined
      && (!candidate.resistedExercises || typeof candidate.resistedExercises !== 'object'
        || Array.isArray(candidate.resistedExercises))) return null;

    const editableKeys = [
      'cyclicFrequency', 'resistanceFrequency', 'totalVolumeMin', 'totalVolumeKm',
      'loadPercentage', 'repZone', 'repReserve', 'trainingMethod', 'trainingDivision',
      'alunoGoal', 'coachGoal', 'observation1', 'observation2',
      'workoutDays', 'resistedExercises',
    ];
    const editable = Object.fromEntries(
      editableKeys.filter((key) => Object.prototype.hasOwnProperty.call(candidate, key))
        .map((key) => [key, candidate[key]]),
    );
    return {
      ...templateFromApi,
      ...editable,
      // Server lifecycle and identity fields always win over local storage.
      id: templateFromApi.id,
      planId: templateFromApi.planId,
      mesocycleNumber: templateFromApi.mesocycleNumber,
      weekNumber: templateFromApi.weekNumber,
      weekStartDate: templateFromApi.weekStartDate,
      released: templateFromApi.released,
      releasedAt: templateFromApi.releasedAt,
      updatedAt: templateFromApi.updatedAt,
      baseTemplateUpdatedAt: templateFromApi.updatedAt,
    };
  };

export const buildWorkoutSaveKey = (contextPlanId: string | undefined, mesocycle: number, week: number) =>
  `${contextPlanId || 'unknown-plan'}:${mesocycle}:${week}`;

export const parseWorkoutSaveKey = (key: string) => {
  const [contextPlanId, mesocycleValue, weekValue] = key.split(':');
  const mesocycle = Number(mesocycleValue);
  const week = Number(weekValue);
  return contextPlanId && Number.isInteger(mesocycle) && Number.isInteger(week)
    ? { planId: contextPlanId === 'unknown-plan' ? null : contextPlanId, mesocycle, week }
    : null;
};

export function resolveWorkoutWeekStartDate(planStartDate: string | undefined, weeksPerMesocycle: number, mesocycle: number, week: number) {
  if (!planStartDate) return null;
  const start = parseDateOnly(planStartDate);
  if (!start) return null;
  const weekIndex = (mesocycle - 1) * weeksPerMesocycle + (week - 1);
  const date = new Date(start);
  date.setDate(start.getDate() + weekIndex * 7);
  return toIsoDateAtNoonUTC(toDateInputValue(date));
}

export const resolveWorkoutWeekDate = (weekStartDate: string | Date, dayOfWeek: number) =>
  resolveDateForDayOfWeek(weekStartDate, dayOfWeek) ?? new Date(Number.NaN);

export function buildWorkoutWeekDayEditability(weekStartDate: string | null, planStartDate?: string, planEndDate?: string) {
  if (!weekStartDate || !planStartDate || !planEndDate) return Array.from({ length: 7 }, () => true);
  return Array.from({ length: 7 }, (_, idx) =>
    isDateWithinRange(resolveWorkoutWeekDate(weekStartDate, idx + 1), planStartDate, planEndDate));
}

export function buildWorkoutWeekSavePayload(snapshot: any) {
  const daysArray = Array.isArray(snapshot?.workoutDays)
    ? snapshot.workoutDays
    : Object.values(snapshot?.workoutDays ?? {});
  const weekStart = snapshot?.weekStartDate ? parseDateOnly(snapshot.weekStartDate) : null;
  const workoutDays = daysArray
    .filter((day: any) => Number.isInteger(Number(day?.dayOfWeek)) && Number(day.dayOfWeek) >= 1 && Number(day.dayOfWeek) <= 7)
    .map((day: any) => {
      const date = day.workoutDate
        ? parseDateOnly(day.workoutDate)
        : weekStart ? resolveWorkoutWeekDate(weekStart, Number(day.dayOfWeek)) : null;
      return {
        dayOfWeek: Number(day.dayOfWeek),
        workoutDate: date && Number.isFinite(date.getTime())
          ? toIsoDateAtNoonUTC(toDateInputValue(date))
          : undefined,
        sessionDurationMin: day.sessionDurationMin,
        cyclicTimeMin: day.cyclicTimeMin,
        resistanceTimeMin: day.resistanceTimeMin,
        stimulusDurationMin: day.stimulusDurationMin,
        location: day.location,
        method: day.method,
        intensity1: day.intensity1,
        intensity2: day.intensity2,
        numSessions: day.numSessions,
        numSets: day.numSets,
        sessionTime: day.sessionTime,
        restTime: day.restTime,
        vo2maxIntervalPct: day.vo2maxIntervalPct,
        iextIintTime: day.iextIintTime,
        vo2maxPct: day.vo2maxPct,
        targetHrMin: day.targetHrMin,
        targetHrMax: day.targetHrMax,
        targetSpeedMin: day.targetSpeedMin,
        targetSpeedMax: day.targetSpeedMax,
        detailNotes: day.detailNotes,
        complementNotes: day.complementNotes,
        generalGuidelines: day.generalGuidelines,
      };
    });

  const resistedExercises: Record<string, Record<string, Array<Record<string, unknown>>>> = {};
  for (const [dayKey, sections] of Object.entries(snapshot?.resistedExercises ?? {})) {
    resistedExercises[dayKey] = {};
    for (const section of ['mobilidade', 'sessao', 'resfriamento'] as const) {
      const exercises = (sections as any)?.[section];
      if (!Array.isArray(exercises)) continue;
      resistedExercises[dayKey][section] = exercises
        .filter((exercise: any) => Boolean(exercise?.exerciseId))
        .map((exercise: any, index: number) => ({
          workoutExerciseId: exercise.workoutExerciseId,
          exerciseId: exercise.exerciseId,
          section,
          exerciseOrder: index + 1,
          system: exercise.system ?? undefined,
          groupBreakBefore: exercise.groupBreakBefore ?? false,
          groupType: exercise.groupType ?? null,
          sets: exercise.sets ?? undefined,
          reps: exercise.reps ?? undefined,
          intervalSec: exercise.interval ?? exercise.intervalSec ?? undefined,
          cParam: exercise.cParam ?? undefined,
          eParam: exercise.eParam ?? undefined,
          load: exercise.load ?? undefined,
          exerciseNotes: exercise.adjustment ?? exercise.exerciseNotes ?? undefined,
          resistanceBlocks: exercise.resistanceBlocks ?? undefined,
        }));
    }
  }

  return {
    baseUpdatedAt: snapshot?.baseTemplateUpdatedAt ?? snapshot?.updatedAt,
    template: {
      cyclicFrequency: snapshot?.cyclicFrequency,
      resistanceFrequency: snapshot?.resistanceFrequency,
      totalVolumeMin: snapshot?.totalVolumeMin,
      totalVolumeKm: snapshot?.totalVolumeKm,
      loadPercentage: snapshot?.loadPercentage,
      repZone: snapshot?.repZone,
      repReserve: snapshot?.repReserve,
      trainingMethod: snapshot?.trainingMethod,
      trainingDivision: snapshot?.trainingDivision,
      alunoGoal: snapshot?.alunoGoal,
      coachGoal: snapshot?.coachGoal,
      observation1: snapshot?.observation1,
      observation2: snapshot?.observation2,
    },
    workoutDays,
    resistedExercises,
  };
}

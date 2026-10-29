import api from './api';

export interface WorkoutTemplate {
  id: string;
  planId: string;
  mesocycleNumber: number;
  weekNumber: number;
  weekStartDate: string;
  cyclicFrequency?: number;
  resistanceFrequency?: number;
  totalVolumeMin?: number;
  totalVolumeKm?: number;
  loadPercentage?: number;
  repZone?: number;
  repReserve?: number;
  trainingMethod?: string;
  trainingDivision?: string;
  alunoGoal?: string;
  coachGoal?: string;
  observation1?: string;
  observation2?: string;
  released?: boolean;
  releasedAt?: string | null;
  workoutDays?: WorkoutDay[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutDay {
  id: string;
  templateId: string;
  dayOfWeek: number;
  workoutDate: string;
  sessionDurationMin?: number;
  stimulusDurationMin?: number;
  location?: string;
  method?: string;
  intensity1?: number | null;
  intensity2?: number | null;
  numSessions?: number;
  numSets?: number;
  sessionTime?: number;
  restTime?: number;
  targetHrMin?: string | null;
  targetHrMax?: string | null;
  targetSpeedMin?: string | null;
  targetSpeedMax?: string | null;
  detailNotes?: string;
  complementNotes?: string;
  generalGuidelines?: string;
  psrQuestion?: string;
  psrResponse?: number;
  exercises?: WorkoutExercise[];
  createdAt: string;
  updatedAt: string;
}

export type ResistanceBlockKind = 'aquecimento' | 'principal' | 'tecnica' | 'complementar' | 'finalizacao';
export interface ResistancePlannedSet {
  position: number;
  repsMin?: number | null;
  repsMax?: number | null;
  loadKg?: number | null;
  loadPercent?: number | null;
  rir?: number | null;
  rpe?: number | null;
  tempo?: string | null;
  restSec?: number | null;
  notes?: string | null;
}
export interface ResistanceBlock {
  position: number;
  kind: ResistanceBlockKind;
  notes?: string | null;
  plannedSets: ResistancePlannedSet[];
}

export type ResistanceExerciseGroupType =
  | 'superset' | 'biset' | 'triset' | 'circuit' | 'technical_block' | 'mobility' | 'finisher';

export interface WorkoutExercise {
  id: string;
  workoutDayId: string;
  exerciseId: string;
  section: string;
  exerciseOrder: number;
  system?: string;
  groupBreakBefore?: boolean;
  groupId?: string | null;
  groupType?: ResistanceExerciseGroupType | null;
  groupPosition?: number | null;
  groupRounds?: number | null;
  sets?: number;
  reps?: number;
  intervalSec?: number;
  cParam?: number;
  eParam?: number;
  load?: number;
  exerciseNotes?: string;
  resistanceBlocks?: ResistanceBlock[];
  exercise?: {
    id: string;
    name: string;
    videoUrl?: string;
    category?: string;
    muscleGroup?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkoutTemplateDTO {
  planId: string;
  mesocycleNumber: number;
  weekNumber: number;
  weekStartDate: string;
  cyclicFrequency?: number;
  resistanceFrequency?: number;
}

export interface UpdateWorkoutTemplateDTO {
  cyclicFrequency?: number | null;
  resistanceFrequency?: number | null;
  totalVolumeMin?: number | null;
  totalVolumeKm?: number | null;
  loadPercentage?: number | null;
  repZone?: number | null;
  repReserve?: number | null;
  trainingMethod?: string | null;
  trainingDivision?: string | null;
  alunoGoal?: string | null;
  coachGoal?: string | null;
  observation1?: string | null;
  observation2?: string | null;
}

export interface SaveWorkoutWeekDTO {
  baseUpdatedAt?: string;
  template?: Record<string, unknown>;
  workoutDays?: Array<Record<string, unknown>>;
  resistedExercises?: Record<string, Record<string, Array<Record<string, unknown>>>>;
}

export interface CreateWorkoutDayDTO {
  templateId: string;
  dayOfWeek: number;
  workoutDate: string;
  sessionDurationMin?: number;
  location?: string;
  method?: string;
}

export interface UpdateWorkoutDayDTO {
  workoutDate?: string;
  sessionDurationMin?: number;
  cyclicTimeMin?: number;
  resistanceTimeMin?: number;
  stimulusDurationMin?: number;
  location?: string;
  method?: string;
  intensity1?: number | null;
  intensity2?: number | null;
  numSessions?: number;
  numSets?: number;
  sessionTime?: number;
  restTime?: number;
  vo2maxIntervalPct?: number | null;
  iextIintTime?: number | null;
  vo2maxPct?: number | null;
  targetHrMin?: string | null;
  targetHrMax?: string | null;
  targetSpeedMin?: string | null;
  targetSpeedMax?: string | null;
  detailNotes?: string;
  complementNotes?: string;
  generalGuidelines?: string;
}

export interface AddExerciseDTO {
  workoutExerciseId?: string;
  workoutDayId: string;
  exerciseId: string;
  section: string;
  exerciseOrder: number;
  system?: string;
  groupBreakBefore?: boolean;
  groupType?: ResistanceExerciseGroupType | null;
  sets?: number;
  reps?: number;
  intervalSec?: number;
  cParam?: number;
  eParam?: number;
  load?: number;
  exerciseNotes?: string;
  resistanceBlocks?: ResistanceBlock[];
}

export interface UpdateExerciseDTO {
  section?: string;
  exerciseOrder?: number;
  system?: string;
  groupBreakBefore?: boolean;
  groupType?: ResistanceExerciseGroupType | null;
  sets?: number;
  reps?: number;
  intervalSec?: number;
  load?: number;
  exerciseNotes?: string;
  resistanceBlocks?: ResistanceBlock[];
}

export interface ReorderExercisesDTO {
  workoutDayId: string;
  section: string;
  exercises: Array<{ id: string; order: number }>;
}

class WorkoutService {
  // ============================================================================
  // WORKOUT TEMPLATE
  // ============================================================================

  async getOrCreateTemplate(data: CreateWorkoutTemplateDTO): Promise<WorkoutTemplate> {
    const response = await api.post<WorkoutTemplate>('/workout/templates/get-or-create', data);
    return response.data;
  }

  async getTemplate(id: string): Promise<WorkoutTemplate> {
    const response = await api.get<WorkoutTemplate>(`/workout/templates/${id}`);
    return response.data;
  }

  async updateTemplate(id: string, data: UpdateWorkoutTemplateDTO): Promise<WorkoutTemplate> {
    const response = await api.put<WorkoutTemplate>(`/workout/templates/${id}`, data);
    return response.data;
  }

  async saveTemplateWeek(id: string, data: SaveWorkoutWeekDTO): Promise<WorkoutTemplate> {
    const response = await api.put<WorkoutTemplate>(`/workout/templates/${id}/save-week`, data);
    return response.data;
  }

  /**
   * Best-effort unload persistence. This is deliberately separate from the
   * acknowledged Axios queue: keepalive lets the browser finish the latest
   * snapshot after pagehide without making navigation synchronous.
   */
  saveTemplateWeekKeepalive(id: string, data: SaveWorkoutWeekDTO): void {
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    const baseUrl = api.defaults.baseURL || '/api/v1';
    const url = `${baseUrl.replace(/\/+$/, '')}/workout/templates/${encodeURIComponent(id)}/save-week`;
    const token = window.localStorage.getItem('token');
    void window.fetch(url, {
      method: 'PUT',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    }).catch(() => undefined);
  }

  async releaseTemplate(id: string): Promise<WorkoutTemplate> {
    const response = await api.post<WorkoutTemplate>(`/workout/templates/${id}/release`);
    return response.data;
  }

  async deleteTemplate(id: string): Promise<void> {
    await api.delete(`/workout/templates/${id}`);
  }

  async copyTemplate(id: string, targetWeekNumber: number, targetWeekStartDate: string): Promise<WorkoutTemplate> {
    const response = await api.post<WorkoutTemplate>(`/workout/templates/${id}/copy`, {
      targetWeekNumber,
      targetWeekStartDate,
    });
    return response.data;
  }

  async copyTemplateSections(
    id: string,
    targetWeekNumber: number,
    targetWeekStartDate: string,
    mode: 'cyclic' | 'resistance',
  ): Promise<WorkoutTemplate> {
    const response = await api.post<WorkoutTemplate>(`/workout/templates/${id}/copy-sections`, {
      targetWeekNumber,
      targetWeekStartDate,
      mode,
    });
    return response.data;
  }

  // ============================================================================
  // WORKOUT DAY
  // ============================================================================

  async getOrCreateDay(data: CreateWorkoutDayDTO): Promise<WorkoutDay> {
    const response = await api.post<WorkoutDay>('/workout/days/get-or-create', data);
    return response.data;
  }

  async getDay(id: string): Promise<WorkoutDay> {
    const response = await api.get<WorkoutDay>(`/workout/days/${id}`);
    return response.data;
  }

  async updateDay(id: string, data: UpdateWorkoutDayDTO): Promise<WorkoutDay> {
    const response = await api.put<WorkoutDay>(`/workout/days/${id}`, data);
    return response.data;
  }

  async deleteDay(id: string): Promise<void> {
    await api.delete(`/workout/days/${id}`);
  }

  async copyDay(id: string, targetDayOfWeek: number, targetDate: string): Promise<WorkoutDay> {
    const response = await api.post<WorkoutDay>(`/workout/days/${id}/copy`, {
      targetDayOfWeek,
      targetDate,
    });
    return response.data;
  }

  // ============================================================================
  // WORKOUT EXERCISE
  // ============================================================================

  async getExercises(workoutDayId: string): Promise<WorkoutExercise[]> {
    const response = await api.get<WorkoutExercise[]>(`/workout/exercises`, {
      params: { workoutDayId },
    });
    return response.data;
  }

  async replaceDayResistanceExercises(workoutDayId: string, exercises: AddExerciseDTO[]): Promise<WorkoutExercise[]> {
    const response = await api.put<WorkoutExercise[]>(`/workout/days/${workoutDayId}/resistance-exercises`, { exercises });
    return response.data;
  }

  async addExercise(data: AddExerciseDTO): Promise<WorkoutExercise> {
    const response = await api.post<WorkoutExercise>('/workout/exercises', data);
    return response.data;
  }

  async updateExercise(id: string, data: UpdateExerciseDTO): Promise<WorkoutExercise> {
    const response = await api.put<WorkoutExercise>(`/workout/exercises/${id}`, data);
    return response.data;
  }

  async deleteExercise(id: string): Promise<void> {
    await api.delete(`/workout/exercises/${id}`);
  }

  async reorderExercises(data: ReorderExercisesDTO): Promise<void> {
    await api.put('/workout/exercises/reorder', data);
  }
}

export const workoutService = new WorkoutService();

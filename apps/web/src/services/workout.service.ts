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

export interface WorkoutExercise {
  id: string;
  workoutDayId: string;
  exerciseId: string;
  section: string;
  exerciseOrder: number;
  system?: string;
  sets?: number;
  reps?: number;
  intervalSec?: number;
  cParam?: number;
  eParam?: number;
  load?: number;
  exerciseNotes?: string;
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
  workoutDayId: string;
  exerciseId: string;
  section: string;
  exerciseOrder: number;
  system?: string;
  sets?: number;
  reps?: number;
  intervalSec?: number;
  cParam?: number;
  eParam?: number;
  load?: number;
  exerciseNotes?: string;
}

export interface UpdateExerciseDTO {
  section?: string;
  exerciseOrder?: number;
  system?: string;
  sets?: number;
  reps?: number;
  intervalSec?: number;
  load?: number;
  exerciseNotes?: string;
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


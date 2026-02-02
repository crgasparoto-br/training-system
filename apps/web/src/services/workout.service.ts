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
  studentGoal?: string;
  coachGoal?: string;
  observation1?: string;
  observation2?: string;
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
  intensity1?: string;
  intensity2?: string;
  numSessions?: number;
  numSets?: number;
  sessionTime?: number;
  restTime?: number;
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
  cyclicFrequency?: number;
  resistanceFrequency?: number;
  totalVolumeMin?: number;
  totalVolumeKm?: number;
  loadPercentage?: number;
  repZone?: number;
  repReserve?: number;
  trainingMethod?: string;
  trainingDivision?: string;
  studentGoal?: string;
  coachGoal?: string;
  observation1?: string;
  observation2?: string;
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
  sessionDurationMin?: number;
  stimulusDurationMin?: number;
  location?: string;
  method?: string;
  intensity1?: string;
  intensity2?: string;
  numSessions?: number;
  numSets?: number;
  sessionTime?: number;
  restTime?: number;
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
    const response = await api.post<WorkoutTemplate>('/api/v1/workout/templates/get-or-create', data);
    return response.data;
  }

  async getTemplate(id: string): Promise<WorkoutTemplate> {
    const response = await api.get<WorkoutTemplate>(`/api/v1/workout/templates/${id}`);
    return response.data;
  }

  async updateTemplate(id: string, data: UpdateWorkoutTemplateDTO): Promise<WorkoutTemplate> {
    const response = await api.put<WorkoutTemplate>(`/api/v1/workout/templates/${id}`, data);
    return response.data;
  }

  async deleteTemplate(id: string): Promise<void> {
    await api.delete(`/api/v1/workout/templates/${id}`);
  }

  async copyTemplate(id: string, targetWeekNumber: number, targetWeekStartDate: string): Promise<WorkoutTemplate> {
    const response = await api.post<WorkoutTemplate>(`/api/v1/workout/templates/${id}/copy`, {
      targetWeekNumber,
      targetWeekStartDate,
    });
    return response.data;
  }

  // ============================================================================
  // WORKOUT DAY
  // ============================================================================

  async getOrCreateDay(data: CreateWorkoutDayDTO): Promise<WorkoutDay> {
    const response = await api.post<WorkoutDay>('/api/v1/workout/days/get-or-create', data);
    return response.data;
  }

  async getDay(id: string): Promise<WorkoutDay> {
    const response = await api.get<WorkoutDay>(`/api/v1/workout/days/${id}`);
    return response.data;
  }

  async updateDay(id: string, data: UpdateWorkoutDayDTO): Promise<WorkoutDay> {
    const response = await api.put<WorkoutDay>(`/api/v1/workout/days/${id}`, data);
    return response.data;
  }

  async deleteDay(id: string): Promise<void> {
    await api.delete(`/api/v1/workout/days/${id}`);
  }

  async copyDay(id: string, targetDayOfWeek: number, targetDate: string): Promise<WorkoutDay> {
    const response = await api.post<WorkoutDay>(`/api/v1/workout/days/${id}/copy`, {
      targetDayOfWeek,
      targetDate,
    });
    return response.data;
  }

  // ============================================================================
  // WORKOUT EXERCISE
  // ============================================================================

  async getExercises(workoutDayId: string): Promise<WorkoutExercise[]> {
    const response = await api.get<WorkoutExercise[]>(`/api/v1/workout/exercises`, {
      params: { workoutDayId },
    });
    return response.data;
  }

  async addExercise(data: AddExerciseDTO): Promise<WorkoutExercise> {
    const response = await api.post<WorkoutExercise>('/api/v1/workout/exercises', data);
    return response.data;
  }

  async updateExercise(id: string, data: UpdateExerciseDTO): Promise<WorkoutExercise> {
    const response = await api.put<WorkoutExercise>(`/api/v1/workout/exercises/${id}`, data);
    return response.data;
  }

  async deleteExercise(id: string): Promise<void> {
    await api.delete(`/api/v1/workout/exercises/${id}`);
  }

  async reorderExercises(data: ReorderExercisesDTO): Promise<void> {
    await api.put('/api/v1/workout/exercises/reorder', data);
  }
}

export const workoutService = new WorkoutService();

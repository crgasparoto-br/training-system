import api from './api';

export type WorkoutDayStatus = 'planned' | 'in_progress' | 'completed';

export interface WorkoutExecutionRecord {
  id: string;
  workoutExerciseId: string;
  alunoId: string;
  executionDate: string;
  setNumber?: number | null;
  setsCompleted?: number | null;
  repsCompleted?: number | null;
  loadUsed?: number | null;
  difficultyRating?: number | null;
  repsInReserve?: number | null;
  notes?: string | null;
}

export interface WorkoutDayExercise {
  id: string;
  workoutDayId: string;
  exerciseId: string;
  section: string;
  exerciseOrder: number;
  system?: string | null;
  sets?: number | null;
  reps?: number | null;
  intervalSec?: number | null;
  cParam?: number | null;
  eParam?: number | null;
  load?: number | null;
  exerciseNotes?: string | null;
  exercise?: {
    id: string;
    name: string;
    category?: string | null;
    notes?: string | null;
  };
  executions?: WorkoutExecutionRecord[];
}

export interface WorkoutDayDetail {
  id: string;
  templateId: string;
  dayOfWeek: number;
  workoutDate: string;
  status?: WorkoutDayStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  sessionDurationMin?: number | null;
  stimulusDurationMin?: number | null;
  location?: string | null;
  method?: string | null;
  detailNotes?: string | null;
  complementNotes?: string | null;
  generalGuidelines?: string | null;
  psrQuestion?: string | null;
  psrResponse?: number | null;
  pseResponse?: number | null;
  exercises: WorkoutDayExercise[];
  template?: {
    mesocycleNumber?: number | null;
    weekNumber?: number | null;
    weekStartDate?: string | null;
    plan?: {
      id: string;
      alunoId: string;
      name: string;
    };
  };
}

export const executionsService = {
  async getWorkoutDayByDate(date: string): Promise<WorkoutDayDetail> {
    const response = await api.get<WorkoutDayDetail>(`/executions/workout-day`, {
      params: { date },
    });
    return response.data;
  },

  async getWorkoutDayByDateForProfessor(date: string, alunoId: string): Promise<WorkoutDayDetail> {
    const response = await api.get<WorkoutDayDetail>(`/executions/professor/workout-day`, {
      params: { date, alunoId },
    });
    return response.data;
  },

  async listWorkoutDays(startDate: string, endDate: string): Promise<WorkoutDayDetail[]> {
    const response = await api.get<WorkoutDayDetail[]>(`/executions/workout-days`, {
      params: { startDate, endDate },
    });
    return response.data;
  },

  async listWorkoutDaysForProfessor(
    startDate: string,
    endDate: string,
    alunoId: string
  ): Promise<WorkoutDayDetail[]> {
    const response = await api.get<WorkoutDayDetail[]>(`/executions/professor/workout-days`, {
      params: { startDate, endDate, alunoId },
    });
    return response.data;
  },

  async getWorkoutDay(id: string): Promise<WorkoutDayDetail> {
    const response = await api.get<WorkoutDayDetail>(`/executions/workout-day/${id}`);
    return response.data;
  },

  async getWorkoutDayForProfessor(id: string): Promise<WorkoutDayDetail> {
    const response = await api.get<WorkoutDayDetail>(`/executions/professor/workout-day/${id}`);
    return response.data;
  },

  async updateWorkoutDayStatus(
    id: string,
    data: {
      status?: WorkoutDayStatus;
      psrResponse?: number | null;
      pseResponse?: number | null;
    }
  ): Promise<WorkoutDayDetail> {
    const response = await api.put<WorkoutDayDetail>(`/executions/workout-day/${id}/status`, data);
    return response.data;
  },

  async recordExecution(
    workoutExerciseId: string,
    data: {
      setNumber?: number | null;
      setsCompleted?: number | null;
      repsCompleted?: number | null;
      loadUsed?: number | null;
      difficultyRating?: number | null;
      repsInReserve?: number | null;
      notes?: string | null;
    }
  ): Promise<WorkoutExecutionRecord> {
    const response = await api.post<WorkoutExecutionRecord>(
      `/executions/workout-exercise/${workoutExerciseId}/records`,
      data
    );
    return response.data;
  },
};


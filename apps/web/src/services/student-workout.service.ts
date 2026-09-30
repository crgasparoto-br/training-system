import api from './api';

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export interface StudentWorkoutListDay {
  id: string;
  dayOfWeek: number;
  workoutDate: string;
  sessionDurationMin: number | null;
  location: string | null;
  method: string | null;
  status: string;
}

export interface StudentWorkoutSummary {
  id: string;
  planId: string;
  mesocycleNumber: number;
  weekNumber: number;
  weekStartDate: string;
  releasedAt: string | null;
  plan: {
    id: string;
    name: string;
  };
  workoutDays: StudentWorkoutListDay[];
}

export interface StudentWorkoutExercise {
  id: string;
  section: string;
  system: string | null;
  sets: number | null;
  reps: number | null;
  intervalSec: number | null;
  load: number | null;
  exerciseNotes: string | null;
  exercise: {
    name: string;
  };
}

export interface StudentWorkoutDetailDay extends StudentWorkoutListDay {
  restTime: number | null;
  targetHrMin: string | null;
  targetHrMax: string | null;
  targetSpeedMin: string | null;
  targetSpeedMax: string | null;
  detailNotes: string | null;
  complementNotes: string | null;
  generalGuidelines: string | null;
  exercises: StudentWorkoutExercise[];
}

export interface StudentWorkoutDetail extends Omit<StudentWorkoutSummary, 'workoutDays'> {
  trainingMethod: string | null;
  trainingDivision: string | null;
  studentGoal: string | null;
  observation1: string | null;
  workoutDays: StudentWorkoutDetailDay[];
}

const withContractHeader = (contractId?: string) =>
  contractId
    ? {
        headers: {
          'x-contract-id': contractId,
        },
      }
    : undefined;

export const studentWorkoutService = {
  async list(contractId?: string): Promise<StudentWorkoutSummary[]> {
    const response = await api.get<ApiEnvelope<StudentWorkoutSummary[]>>(
      '/student/me/workouts',
      withContractHeader(contractId)
    );
    return response.data.data;
  },

  async getDetail(workoutTemplateId: string, contractId?: string): Promise<StudentWorkoutDetail> {
    const response = await api.get<ApiEnvelope<StudentWorkoutDetail>>(
      `/student/me/workouts/${workoutTemplateId}`,
      withContractHeader(contractId)
    );
    return response.data.data;
  },
};

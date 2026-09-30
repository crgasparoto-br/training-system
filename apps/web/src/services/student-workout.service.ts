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
  exerciseId: string;
  section: string;
  exerciseOrder: number;
  system: string | null;
  groupBreakBefore: boolean;
  sets: number | null;
  reps: number | null;
  intervalSec: number | null;
  cParam: number | null;
  eParam: number | null;
  load: number | null;
  exerciseNotes: string | null;
  exercise: {
    id: string;
    name: string;
    videoUrl: string | null;
    category: string | null;
    muscleGroup: string | null;
  };
}

export interface StudentWorkoutDetailDay extends StudentWorkoutListDay {
  stimulusDurationMin: number | null;
  intensity1: number | null;
  intensity2: number | null;
  numSessions: number | null;
  numSets: number | null;
  sessionTime: number | null;
  restTime: number | null;
  targetHrMin: string | null;
  targetHrMax: string | null;
  targetSpeedMin: string | null;
  targetSpeedMax: string | null;
  detailNotes: string | null;
  complementNotes: string | null;
  generalGuidelines: string | null;
  cyclicTimeMin: number | null;
  resistanceTimeMin: number | null;
  paceMax: number | null;
  paceMin: number | null;
  startedAt: string | null;
  finishedAt: string | null;
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

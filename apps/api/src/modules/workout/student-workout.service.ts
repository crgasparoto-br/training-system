import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

function releasedStudentWorkoutWhere(
  alunoId: string,
  contractId: string
): Prisma.WorkoutTemplateWhereInput {
  return {
    released: true,
    plan: {
      alunoId,
      aluno: {
        contractId,
      },
    },
  };
}

const listSelect = {
  id: true,
  planId: true,
  mesocycleNumber: true,
  weekNumber: true,
  weekStartDate: true,
  releasedAt: true,
  plan: {
    select: {
      id: true,
      name: true,
    },
  },
  workoutDays: {
    orderBy: [{ workoutDate: 'asc' as const }, { dayOfWeek: 'asc' as const }],
    select: {
      id: true,
      dayOfWeek: true,
      workoutDate: true,
      sessionDurationMin: true,
      location: true,
      method: true,
      status: true,
    },
  },
} satisfies Prisma.WorkoutTemplateSelect;

const detailSelect = {
  id: true,
  planId: true,
  mesocycleNumber: true,
  weekNumber: true,
  weekStartDate: true,
  releasedAt: true,
  trainingMethod: true,
  trainingDivision: true,
  studentGoal: true,
  observation1: true,
  plan: {
    select: {
      id: true,
      name: true,
    },
  },
  workoutDays: {
    orderBy: [{ workoutDate: 'asc' as const }, { dayOfWeek: 'asc' as const }],
    select: {
      id: true,
      dayOfWeek: true,
      workoutDate: true,
      sessionDurationMin: true,
      location: true,
      method: true,
      restTime: true,
      targetHrMin: true,
      targetHrMax: true,
      targetSpeedMin: true,
      targetSpeedMax: true,
      detailNotes: true,
      complementNotes: true,
      generalGuidelines: true,
      status: true,
      exercises: {
        orderBy: [{ section: 'asc' as const }, { exerciseOrder: 'asc' as const }],
        select: {
          id: true,
          section: true,
          system: true,
          sets: true,
          reps: true,
          intervalSec: true,
          load: true,
          exerciseNotes: true,
          exercise: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.WorkoutTemplateSelect;

export function createStudentWorkoutService(client: PrismaClient = prisma) {
  return {
    async listReleasedForStudent(alunoId: string, contractId: string) {
      return client.workoutTemplate.findMany({
        where: releasedStudentWorkoutWhere(alunoId, contractId),
        orderBy: [{ weekStartDate: 'asc' }, { id: 'asc' }],
        select: listSelect,
      });
    },

    async getReleasedForStudent(
      workoutTemplateId: string,
      alunoId: string,
      contractId: string
    ) {
      return client.workoutTemplate.findFirst({
        where: {
          id: workoutTemplateId,
          ...releasedStudentWorkoutWhere(alunoId, contractId),
        },
        select: detailSelect,
      });
    },
  };
}

export const studentWorkoutService = createStudentWorkoutService();

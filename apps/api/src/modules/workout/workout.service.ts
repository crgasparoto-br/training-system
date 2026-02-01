import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreateWorkoutTemplateDTO {
  planId: string;
  mesocycleNumber: number;
  weekNumber: number;
  weekStartDate: Date;
  cyclicFrequency?: number;
  totalVolumeMin?: number;
  totalVolumeKm?: number;
  resistanceFrequency?: number;
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
  workoutDate: Date;
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
  vo2maxIntervalPct?: number;
  iextIintTime?: number;
  vo2maxPct?: number;
  targetHrMin?: number;
  targetHrMax?: number;
  targetSpeedMin?: number;
  targetSpeedMax?: number;
  detailNotes?: string;
  complementNotes?: string;
  generalGuidelines?: string;
}

export interface CreateWorkoutExerciseDTO {
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

export interface RecordExecutionDTO {
  workoutExerciseId: string;
  athleteId: string;
  executionDate: Date;
  setsCompleted?: number;
  repsCompleted?: number;
  loadUsed?: number;
  difficultyRating?: number;
  repsInReserve?: number;
  notes?: string;
}

/**
 * Service de Montagem e Execução de Treinos
 */
export const workoutService = {
  /**
   * Criar template semanal de treino
   */
  async createTemplate(data: CreateWorkoutTemplateDTO) {
    return await prisma.workoutTemplate.create({
      data,
      include: {
        plan: true,
        workoutDays: true,
      },
    });
  },

  /**
   * Obter template por plano, mesociclo e semana
   */
  async getTemplate(planId: string, mesocycleNumber: number, weekNumber: number) {
    return await prisma.workoutTemplate.findUnique({
      where: {
        planId_mesocycleNumber_weekNumber: {
          planId,
          mesocycleNumber,
          weekNumber,
        },
      },
      include: {
        plan: true,
        workoutDays: {
          include: {
            exercises: {
              include: {
                exercise: true,
              },
              orderBy: [
                { section: 'asc' },
                { exerciseOrder: 'asc' },
              ],
            },
          },
          orderBy: { dayOfWeek: 'asc' },
        },
      },
    });
  },

  /**
   * Listar todos os templates de um plano
   */
  async listTemplatesByPlan(planId: string) {
    return await prisma.workoutTemplate.findMany({
      where: { planId },
      include: {
        workoutDays: {
          include: {
            exercises: {
              include: {
                exercise: true,
              },
            },
          },
        },
      },
      orderBy: [
        { mesocycleNumber: 'asc' },
        { weekNumber: 'asc' },
      ],
    });
  },

  /**
   * Atualizar template
   */
  async updateTemplate(id: string, data: Partial<CreateWorkoutTemplateDTO>) {
    return await prisma.workoutTemplate.update({
      where: { id },
      data,
    });
  },

  /**
   * Deletar template
   */
  async deleteTemplate(id: string) {
    return await prisma.workoutTemplate.delete({
      where: { id },
    });
  },

  /**
   * Criar dia de treino
   */
  async createWorkoutDay(data: CreateWorkoutDayDTO) {
    return await prisma.workoutDay.create({
      data,
      include: {
        template: true,
        exercises: {
          include: {
            exercise: true,
          },
        },
      },
    });
  },

  /**
   * Obter dia de treino por ID
   */
  async getWorkoutDay(id: string) {
    return await prisma.workoutDay.findUnique({
      where: { id },
      include: {
        template: {
          include: {
            plan: true,
          },
        },
        exercises: {
          include: {
            exercise: true,
            executions: true,
          },
          orderBy: [
            { section: 'asc' },
            { exerciseOrder: 'asc' },
          ],
        },
      },
    });
  },

  /**
   * Atualizar dia de treino
   */
  async updateWorkoutDay(id: string, data: Partial<CreateWorkoutDayDTO>) {
    return await prisma.workoutDay.update({
      where: { id },
      data,
    });
  },

  /**
   * Deletar dia de treino
   */
  async deleteWorkoutDay(id: string) {
    return await prisma.workoutDay.delete({
      where: { id },
    });
  },

  /**
   * Adicionar exercício ao dia de treino
   */
  async addExerciseToDay(data: CreateWorkoutExerciseDTO) {
    return await prisma.workoutExercise.create({
      data,
      include: {
        exercise: true,
        workoutDay: true,
      },
    });
  },

  /**
   * Atualizar exercício do treino
   */
  async updateWorkoutExercise(id: string, data: Partial<CreateWorkoutExerciseDTO>) {
    return await prisma.workoutExercise.update({
      where: { id },
      data,
    });
  },

  /**
   * Remover exercício do treino
   */
  async removeExerciseFromDay(id: string) {
    return await prisma.workoutExercise.delete({
      where: { id },
    });
  },

  /**
   * Reordenar exercícios de uma seção
   */
  async reorderExercises(
    workoutDayId: string,
    section: string,
    exerciseIds: string[]
  ) {
    const updates = exerciseIds.map((id, index) =>
      prisma.workoutExercise.update({
        where: { id },
        data: { exerciseOrder: index + 1 },
      })
    );

    return await prisma.$transaction(updates);
  },

  /**
   * Registrar execução de exercício
   */
  async recordExecution(data: RecordExecutionDTO) {
    // Registrar execução
    const execution = await prisma.workoutExecution.create({
      data,
    });

    // Atualizar progresso do aluno se houver carga
    if (data.loadUsed) {
      const workoutExercise = await prisma.workoutExercise.findUnique({
        where: { id: data.workoutExerciseId },
      });

      if (workoutExercise) {
        const progress = await prisma.studentExerciseProgress.findUnique({
          where: {
            athleteId_exerciseId: {
              athleteId: data.athleteId,
              exerciseId: workoutExercise.exerciseId,
            },
          },
        });

        const newMaxLoad =
          !progress?.maxLoad || data.loadUsed > progress.maxLoad
            ? data.loadUsed
            : progress.maxLoad;

        await prisma.studentExerciseProgress.upsert({
          where: {
            athleteId_exerciseId: {
              athleteId: data.athleteId,
              exerciseId: workoutExercise.exerciseId,
            },
          },
          create: {
            athleteId: data.athleteId,
            exerciseId: workoutExercise.exerciseId,
            lastLoad: data.loadUsed,
            maxLoad: newMaxLoad,
          },
          update: {
            lastLoad: data.loadUsed,
            maxLoad: newMaxLoad,
            lastUpdated: new Date(),
          },
        });
      }
    }

    return execution;
  },

  /**
   * Obter execuções de um aluno em um período
   */
  async getExecutionsByAthlete(
    athleteId: string,
    startDate: Date,
    endDate: Date
  ) {
    return await prisma.workoutExecution.findMany({
      where: {
        athleteId,
        executionDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        workoutExercise: {
          include: {
            exercise: true,
            workoutDay: {
              include: {
                template: true,
              },
            },
          },
        },
      },
      orderBy: { executionDate: 'desc' },
    });
  },

  /**
   * Obter treinos de uma semana específica
   */
  async getWeekWorkouts(planId: string, mesocycleNumber: number, weekNumber: number) {
    const template = await this.getTemplate(planId, mesocycleNumber, weekNumber);
    
    if (!template) {
      return null;
    }

    return {
      template,
      days: template.workoutDays,
    };
  },
};

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
  alunoGoal?: string;
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
  intensity1?: number;
  intensity2?: number;
  numSessions?: number;
  numSets?: number;
  sessionTime?: number;
  restTime?: number;
  vo2maxIntervalPct?: number;
  iextIintTime?: number;
  vo2maxPct?: number;
  targetHrMin?: string;
  targetHrMax?: string;
  targetSpeedMin?: string;
  targetSpeedMax?: string;
  detailNotes?: string;
  complementNotes?: string;
  generalGuidelines?: string;
}

type WorkoutDayCreateData = CreateWorkoutDayDTO;
type WorkoutDayUpdateData = Partial<Omit<CreateWorkoutDayDTO, 'templateId'>>;

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
  alunoId: string;
  executionDate: Date;
  setNumber?: number;
  setsCompleted?: number;
  repsCompleted?: number;
  loadUsed?: number;
  difficultyRating?: number;
  repsInReserve?: number;
  notes?: string;
}

const resolveUtcDate = (input: string | Date, endOfDay: boolean) => {
  if (typeof input === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (endOfDay) {
        return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
      }
      return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    }
  }

  const date = input instanceof Date ? input : new Date(input);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  if (endOfDay) {
    return new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
  }
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
};

/**
 * Service de Montagem e ExecuÃ§Ã£o de Treinos
 */
export const workoutService = {
  /**
   * Get or create template (busca ou cria se nÃ£o existir)
   */
  async getOrCreateTemplate(data: CreateWorkoutTemplateDTO) {
    const existing = await prisma.workoutTemplate.findUnique({
      where: {
        planId_mesocycleNumber_weekNumber: {
          planId: data.planId,
          mesocycleNumber: data.mesocycleNumber,
          weekNumber: data.weekNumber,
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

    if (existing) {
      const existingStart = existing.weekStartDate?.getTime?.() ?? null;
      const incomingStart = data.weekStartDate?.getTime?.() ?? null;

      if (existingStart && incomingStart && existingStart !== incomingStart) {
        const weekStartDate = data.weekStartDate;
        await prisma.$transaction(async (tx) => {
          await tx.workoutTemplate.update({
            where: { id: existing.id },
            data: { weekStartDate },
          });

          if (existing.workoutDays?.length) {
            for (const day of existing.workoutDays) {
              const offset = Math.max(0, (day.dayOfWeek || 1) - 1);
              const workoutDate = new Date(weekStartDate);
              workoutDate.setDate(workoutDate.getDate() + offset);
              await tx.workoutDay.update({
                where: { id: day.id },
                data: { workoutDate },
              });
            }
          }
        });

        return await prisma.workoutTemplate.findUnique({
          where: {
            planId_mesocycleNumber_weekNumber: {
              planId: data.planId,
              mesocycleNumber: data.mesocycleNumber,
              weekNumber: data.weekNumber,
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
      }

      return existing;
    }

    return await this.createTemplate(data);
  },

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
   * Obter template por ID
   */
  async getTemplateById(id: string) {
    return await prisma.workoutTemplate.findUnique({
      where: { id },
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
   * Liberar template para o aluno
   */
  async releaseTemplate(id: string) {
    return await prisma.workoutTemplate.update({
      where: { id },
      data: {
        released: true,
        releasedAt: new Date(),
      },
    });
  },

  /**
   * Get or create workout day (busca ou cria se nÃ£o existir)
   */
  async getOrCreateDay(data: CreateWorkoutDayDTO) {
    const existing = await prisma.workoutDay.findUnique({
      where: {
        templateId_dayOfWeek: {
          templateId: data.templateId,
          dayOfWeek: data.dayOfWeek,
        },
      },
      include: {
        template: true,
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
    });

    if (existing) {
      return existing;
    }

    return await this.createWorkoutDay(data);
  },

  /**
   * Criar dia de treino
   */
  async createWorkoutDay(data: WorkoutDayCreateData) {
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
  async updateWorkoutDay(id: string, data: WorkoutDayUpdateData) {
    return await prisma.workoutDay.update({
      where: { id },
      data,
    });
  },

  async updateWorkoutDayStatus(
    id: string,
    data: { status?: 'planned' | 'in_progress' | 'completed'; psrResponse?: number | null; pseResponse?: number | null }
  ) {
    const payload: any = { ...data };

    if (data.status === 'in_progress') {
      payload.startedAt = new Date();
    }

    if (data.status === 'completed') {
      payload.finishedAt = new Date();
    }

    await prisma.workoutDay.update({
      where: { id },
      data: payload,
    });

    return await this.getWorkoutDay(id);
  },

  async getWorkoutDayByDate(alunoId: string, dateInput: string | Date) {
    const start = resolveUtcDate(dateInput, false);
    const end = resolveUtcDate(dateInput, true);

    return await prisma.workoutDay.findFirst({
      where: {
        workoutDate: {
          gte: start,
          lte: end,
        },
        template: {
          released: true,
          plan: {
            alunoId,
          },
        },
      },
      include: {
        template: {
          include: { plan: true },
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

  async getDay(id: string) {
    return await this.getWorkoutDay(id);
  },

  async updateDay(id: string, data: Partial<CreateWorkoutDayDTO>) {
    return await this.updateWorkoutDay(id, data);
  },

  async deleteDay(id: string) {
    return await this.deleteWorkoutDay(id);
  },

  async addExercise(data: CreateWorkoutExerciseDTO) {
    return await this.addExerciseToDay(data);
  },

  async updateExercise(id: string, data: Partial<CreateWorkoutExerciseDTO>) {
    return await this.updateWorkoutExercise(id, data);
  },

  async deleteExercise(id: string) {
    return await this.removeExerciseFromDay(id);
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
   * Listar exercÃ­cios de um dia
   */
  async getExercises(workoutDayId: string) {
    return await prisma.workoutExercise.findMany({
      where: { workoutDayId },
      include: {
        exercise: true,
      },
      orderBy: [
        { section: 'asc' },
        { exerciseOrder: 'asc' },
      ],
    });
  },

  /**
   * Adicionar exercÃ­cio ao dia de treino
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
   * Atualizar exercÃ­cio do treino
   */
  async updateWorkoutExercise(id: string, data: Partial<CreateWorkoutExerciseDTO>) {
    return await prisma.workoutExercise.update({
      where: { id },
      data,
    });
  },

  /**
   * Copiar template para outra semana
   */
  async copyTemplate(id: string, targetWeekNumber: number, targetWeekStartDate: Date) {
    if (!Number.isFinite(targetWeekNumber) || targetWeekNumber <= 0) {
      throw new Error('Invalid targetWeekNumber');
    }
    const source = await prisma.workoutTemplate.findUnique({
      where: { id },
      include: {
        workoutDays: {
          include: {
            exercises: true,
          },
        },
      },
    });

    if (!source) {
      throw new Error('Template not found');
    }

    if (source.weekNumber === targetWeekNumber) {
      throw new Error('Target week must be different from source week');
    }

    const existingTarget = await prisma.workoutTemplate.findUnique({
      where: {
        planId_mesocycleNumber_weekNumber: {
          planId: source.planId,
          mesocycleNumber: source.mesocycleNumber,
          weekNumber: targetWeekNumber,
        },
      },
      select: { id: true },
    });

    if (existingTarget && existingTarget.id !== source.id) {
      await prisma.workoutTemplate.delete({
        where: { id: existingTarget.id },
      });
    }

    // Criar novo template
    const newTemplate = await prisma.workoutTemplate.create({
      data: {
        planId: source.planId,
        mesocycleNumber: source.mesocycleNumber,
        weekNumber: targetWeekNumber,
        weekStartDate: targetWeekStartDate,
        cyclicFrequency: source.cyclicFrequency,
        resistanceFrequency: source.resistanceFrequency,
        totalVolumeMin: source.totalVolumeMin,
        totalVolumeKm: source.totalVolumeKm,
        loadPercentage: source.loadPercentage,
        repZone: source.repZone,
        repReserve: source.repReserve,
        trainingMethod: source.trainingMethod,
        trainingDivision: source.trainingDivision,
        alunoGoal: source.alunoGoal,
        coachGoal: source.coachGoal,
        observation1: source.observation1,
        observation2: source.observation2,
      },
    });

    // Copiar dias e exercÃ­cios
    for (const day of source.workoutDays) {
      const newDay = await prisma.workoutDay.create({
        data: {
          templateId: newTemplate.id,
          dayOfWeek: day.dayOfWeek,
          workoutDate: day.workoutDate,
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
        },
      });

      for (const exercise of day.exercises) {
        await prisma.workoutExercise.create({
          data: {
            workoutDayId: newDay.id,
            exerciseId: exercise.exerciseId,
            section: exercise.section,
            exerciseOrder: exercise.exerciseOrder,
            system: exercise.system,
            sets: exercise.sets,
            reps: exercise.reps,
            intervalSec: exercise.intervalSec,
            cParam: exercise.cParam,
            eParam: exercise.eParam,
            load: exercise.load,
            exerciseNotes: exercise.exerciseNotes,
          },
        });
      }
    }

    return await prisma.workoutTemplate.findUnique({
      where: { id: newTemplate.id },
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

  async getWorkoutDaysByRange(
    alunoId: string,
    startInput: string | Date,
    endInput: string | Date,
    options?: { releasedOnly?: boolean }
  ) {
    const start = resolveUtcDate(startInput, false);
    const end = resolveUtcDate(endInput, true);
    const releasedOnly = options?.releasedOnly ?? true;

    return await prisma.workoutDay.findMany({
      where: {
        workoutDate: {
          gte: start,
          lte: end,
        },
        template: {
          ...(releasedOnly ? { released: true } : {}),
          plan: {
            alunoId,
          },
        },
      },
      include: {
        template: {
          include: { plan: true },
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
      orderBy: { workoutDate: 'asc' },
    });
  },

  /**
   * Copiar dia de treino
   */
  async copyDay(id: string, targetDayOfWeek: number, targetDate: Date) {
    const source = await this.getWorkoutDay(id);

    if (!source) {
      throw new Error('Workout day not found');
    }

    const newDay = await prisma.workoutDay.create({
      data: {
        templateId: source.templateId,
        dayOfWeek: targetDayOfWeek,
        workoutDate: targetDate,
        sessionDurationMin: source.sessionDurationMin,
        cyclicTimeMin: source.cyclicTimeMin,
        resistanceTimeMin: source.resistanceTimeMin,
        stimulusDurationMin: source.stimulusDurationMin,
        location: source.location,
        method: source.method,
        intensity1: source.intensity1,
        intensity2: source.intensity2,
        numSessions: source.numSessions,
        numSets: source.numSets,
        sessionTime: source.sessionTime,
        restTime: source.restTime,
        vo2maxIntervalPct: source.vo2maxIntervalPct,
        iextIintTime: source.iextIintTime,
        vo2maxPct: source.vo2maxPct,
        targetHrMin: source.targetHrMin,
        targetHrMax: source.targetHrMax,
        targetSpeedMin: source.targetSpeedMin,
        targetSpeedMax: source.targetSpeedMax,
        detailNotes: source.detailNotes,
        complementNotes: source.complementNotes,
        generalGuidelines: source.generalGuidelines,
      },
    });

    for (const exercise of source.exercises) {
      await prisma.workoutExercise.create({
        data: {
          workoutDayId: newDay.id,
          exerciseId: exercise.exerciseId,
          section: exercise.section,
        exerciseOrder: exercise.exerciseOrder,
        system: exercise.system,
        sets: exercise.sets,
        reps: exercise.reps,
        intervalSec: exercise.intervalSec,
        cParam: exercise.cParam,
        eParam: exercise.eParam,
        load: exercise.load,
        exerciseNotes: exercise.exerciseNotes,
      },
    });
    }

    return await this.getWorkoutDay(newDay.id);
  },

  /**
   * Remover exercÃ­cio do treino
   */
  async removeExerciseFromDay(id: string) {
    return await prisma.workoutExercise.delete({
      where: { id },
    });
  },

  /**
   * Reordenar exercÃ­cios de uma seÃ§Ã£o
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
   * Registrar execuÃ§Ã£o de exercÃ­cio
   */
  async recordExecution(data: RecordExecutionDTO) {
    // Registrar execuÃ§Ã£o
    const execution = await prisma.workoutExecution.create({
      data,
    });

    // Atualizar progresso do aluno se houver carga
    if (data.loadUsed) {
      const workoutExercise = await prisma.workoutExercise.findUnique({
        where: { id: data.workoutExerciseId },
      });

      if (workoutExercise) {
        const progress = await prisma.alunoExerciseProgress.findUnique({
          where: {
            alunoId_exerciseId: {
              alunoId: data.alunoId,
              exerciseId: workoutExercise.exerciseId,
            },
          },
        });

        const newMaxLoad =
          !progress?.maxLoad || data.loadUsed > progress.maxLoad
            ? data.loadUsed
            : progress.maxLoad;

        await prisma.alunoExerciseProgress.upsert({
          where: {
            alunoId_exerciseId: {
              alunoId: data.alunoId,
              exerciseId: workoutExercise.exerciseId,
            },
          },
          create: {
            alunoId: data.alunoId,
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
   * Obter execuÃ§Ãµes de um aluno em um perÃ­odo
   */
  async getExecutionsByAluno(
    alunoId: string,
    startDate: Date,
    endDate: Date
  ) {
    return await prisma.workoutExecution.findMany({
      where: {
        alunoId,
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
   * Obter treinos de uma semana especÃ­fica
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


import { PrismaClient } from '@prisma/client';

import { Prisma } from '@prisma/client';
import { assertWorkoutParentIsImmutable, normalizeResistanceBlocks, sanitizeWorkoutMutation, ResistanceStructureNotFoundError, ResistanceStructureValidationError, type ResistanceBlockInput } from './resistance-structure.domain.js';
import { assertDayContract, isWorkoutTemplateUniqueConflict, lockWorkoutDayPlanningMutable, nestedResistanceBlocks, normalizeWorkoutTemplateUpdateData, resistanceBlockInclude, serializeWorkoutTemplate, touchWorkoutTemplateRevision, withWorkoutDayPlanningMutation, withWorkoutTemplatePlanningMutation, workoutDateInTargetWeek, WorkoutPlanningLockedError } from './workout-planning.helpers.js';
import { copyTemplate as copyTemplateStructured, copyTemplateSections as copyTemplateSectionsStructured } from './workout-copy.service.js';
import { replaceDayResistanceExercises as replaceDayResistanceExercisesStructured, saveTemplateWeek as saveTemplateWeekStructured } from './workout-week-structure.service.js';
import { cyclicStageInclude, nestedCyclicStages, normalizeCyclicStages, replaceCyclicStagesInTransaction, snapshotCyclicStages } from './cyclic-stages.domain.js';
export { WorkoutPlanningLockedError } from './workout-planning.helpers.js';

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

function normalizeWorkoutTemplateCreateData(
  data: CreateWorkoutTemplateDTO
): Prisma.WorkoutTemplateUncheckedCreateInput {
  const { alunoGoal, ...rest } = data;

  return {
    ...rest,
    ...(alunoGoal !== undefined ? { studentGoal: alunoGoal } : {}),
  };
}

export interface CreateWorkoutDayDTO {
  templateId: string;
  dayOfWeek: number;
  workoutDate: Date;
  sessionDurationMin?: number;
  stimulusDurationMin?: number;
  cyclicTimeMin?: number;
  resistanceTimeMin?: number;
  paceMin?: number;
  paceMax?: number;
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
  /** Existing WorkoutExercise identity, not the exercise library id. */
  workoutExerciseId?: string;
  workoutDayId: string;
  exerciseId: string;
  section: string;
  exerciseOrder: number;
  system?: string;
  groupBreakBefore?: boolean;
  sets?: number;
  reps?: number;
  intervalSec?: number;
  cParam?: number;
  eParam?: number;
  load?: number;
  exerciseNotes?: string;
  resistanceBlocks?: ResistanceBlockInput[];
}

export interface SaveWorkoutWeekDTO {
  baseUpdatedAt?: string;
  template?: Record<string, unknown>;
  workoutDays?: Array<Record<string, unknown>>;
  resistedExercises?: Record<string, Record<string, Array<Record<string, unknown>>>>;
  cyclicStages?: Record<string, unknown[]>;
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
      const midnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      if (
        midnight.getUTCFullYear() !== year
        || midnight.getUTCMonth() !== month - 1
        || midnight.getUTCDate() !== day
      ) {
        throw new ResistanceStructureValidationError('Data civil inválida.');
      }
      if (endOfDay) {
        return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
      }
      return midnight;
    }
  }

  const date = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(date.getTime())) {
    throw new ResistanceStructureValidationError('Data civil inválida.');
  }
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  if (endOfDay) {
    return new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
  }
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
};


export class LegacyWorkoutLifecycleDisabledError extends Error {
  readonly statusCode = 409;
  readonly code = 'WORKOUT_SESSION_EXECUTION_CANONICAL_ENDPOINT_REQUIRED';

  constructor() {
    super('Use o contrato canônico de execução da sessão para alterar o estado do treino.');
  }
}

/**
 * Service de Montagem e ExecuÃ§Ã£o de Treinos
 */
export const workoutService = {
  /**
   * Get or create template (busca ou cria se nÃ£o existir)
   */
  async getOrCreateTemplate(data: CreateWorkoutTemplateDTO) {
    data = sanitizeWorkoutMutation(data, 'template', 'create');
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
            cyclicStages: cyclicStageInclude,
            exercises: {
              include: {
                exercise: true,
                resistanceBlocks: resistanceBlockInclude,
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
        if (existing.released) {
          return serializeWorkoutTemplate(existing);
        }

        const weekStartDate = data.weekStartDate;
        await withWorkoutTemplatePlanningMutation(prisma, existing.id, async (tx) => {
          await tx.workoutTemplate.update({
            where: { id: existing.id },
            data: { weekStartDate },
          });

          if (existing.workoutDays?.length) {
            for (const day of existing.workoutDays) {
              // weekStartDate may be any weekday. Keep every persisted WorkoutDay
              // aligned to its canonical ISO weekday in UTC, as in copyTemplate.
              const workoutDate = workoutDateInTargetWeek(weekStartDate, day.dayOfWeek);
              await tx.workoutDay.update({
                where: { id: day.id },
                data: { workoutDate },
              });
            }
          }
        });

        const updatedTemplate = await prisma.workoutTemplate.findUnique({
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
                cyclicStages: cyclicStageInclude,
                exercises: {
                  include: {
                    exercise: true,
                    resistanceBlocks: resistanceBlockInclude,
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

        return serializeWorkoutTemplate(updatedTemplate);
      }

      return serializeWorkoutTemplate(existing);
    }

    try {
      return await this.createTemplate(data);
    } catch (error) {
      if (!isWorkoutTemplateUniqueConflict(error)) {
        throw error;
      }

      const concurrentlyCreated = await this.getTemplate(
        data.planId,
        data.mesocycleNumber,
        data.weekNumber
      );
      if (!concurrentlyCreated) {
        throw error;
      }

      return concurrentlyCreated;
    }
  },

  /**
   * Criar template semanal de treino
   */
  async createTemplate(data: CreateWorkoutTemplateDTO) {
    data = sanitizeWorkoutMutation(data, 'template', 'create');
    const template = await prisma.workoutTemplate.create({
      data: normalizeWorkoutTemplateCreateData(data),
      include: {
        plan: true,
        workoutDays: {
          include: {
            cyclicStages: cyclicStageInclude,
            exercises: {
              include: {
                exercise: true,
                resistanceBlocks: resistanceBlockInclude,
              },
              orderBy: [{ section: 'asc' }, { exerciseOrder: 'asc' }],
            },
          },
          orderBy: { dayOfWeek: 'asc' },
        },
      },
    });

    return serializeWorkoutTemplate(template);
  },

  /**
   * Obter template por plano, mesociclo e semana
   */
  async getTemplate(planId: string, mesocycleNumber: number, weekNumber: number) {
    const template = await prisma.workoutTemplate.findUnique({
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
            cyclicStages: cyclicStageInclude,
            exercises: {
              include: {
                exercise: true,
                resistanceBlocks: resistanceBlockInclude,
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

    return serializeWorkoutTemplate(template);
  },

  /**
   * Listar todos os templates de um plano
   */
  async listTemplatesByPlan(planId: string) {
    const templates = await prisma.workoutTemplate.findMany({
      where: { planId },
      include: {
        workoutDays: {
          include: {
            cyclicStages: cyclicStageInclude,
            exercises: {
              include: {
                exercise: true,
                resistanceBlocks: resistanceBlockInclude,
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

    return templates.map(serializeWorkoutTemplate);
  },

  /**
   * Atualizar template
   */
  async updateTemplate(id: string, data: Partial<CreateWorkoutTemplateDTO>) {
    assertWorkoutParentIsImmutable(data, 'planId');
    data = sanitizeWorkoutMutation(data, 'template');
    const template = await withWorkoutTemplatePlanningMutation(prisma, id, (tx) =>
      tx.workoutTemplate.update({
        where: { id },
        data: normalizeWorkoutTemplateUpdateData(data),
      })
    );

    return serializeWorkoutTemplate(template);
  },

  /**
   * Deletar template
   */
  async deleteTemplate(id: string) {
    return withWorkoutTemplatePlanningMutation(prisma, id, (tx) =>
      tx.workoutTemplate.delete({
        where: { id },
      })
    );
  },

  /**
   * Obter template por ID
   */
  async getTemplateById(id: string) {
    const template = await prisma.workoutTemplate.findUnique({
      where: { id },
      include: {
        plan: true,
        workoutDays: {
          include: {
            cyclicStages: cyclicStageInclude,
            exercises: {
              include: {
                exercise: true,
                resistanceBlocks: resistanceBlockInclude,
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

    return serializeWorkoutTemplate(template);
  },

  /**
   * Liberar template para o aluno
   */
  async releaseTemplate(id: string) {
    const previous = await prisma.workoutTemplate.findUnique({ where: { id } });
    if (previous?.released) return serializeWorkoutTemplate(previous);
    const template = await withWorkoutTemplatePlanningMutation(prisma, id, (tx) =>
      tx.workoutTemplate.update({
        where: { id },
        data: {
          released: true,
          releasedAt: new Date(),
        },
      })
    );

    return serializeWorkoutTemplate(template);
  },

  /**
   * Get or create workout day (busca ou cria se nÃ£o existir)
   */
  async getOrCreateDay(data: CreateWorkoutDayDTO) {
    data = sanitizeWorkoutMutation(data, 'day', 'create');
    const template = await prisma.workoutTemplate.findUnique({
      where: { id: data.templateId },
      select: { weekStartDate: true },
    });
    if (!template) throw new ResistanceStructureNotFoundError();
    data = {
      ...data,
      workoutDate: workoutDateInTargetWeek(template.weekStartDate, data.dayOfWeek),
    };
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
            resistanceBlocks: resistanceBlockInclude,
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
    data = sanitizeWorkoutMutation(data, 'day', 'create');
    const template = await prisma.workoutTemplate.findUnique({
      where: { id: data.templateId },
      select: { weekStartDate: true },
    });
    if (!template) throw new ResistanceStructureNotFoundError();
    data = {
      ...data,
      workoutDate: workoutDateInTargetWeek(template.weekStartDate, data.dayOfWeek),
    };
    return withWorkoutTemplatePlanningMutation(prisma, data.templateId, async (tx) => {
      const created = await tx.workoutDay.create({
        data,
        include: {
          template: true,
          cyclicStages: cyclicStageInclude,
          exercises: {
            include: {
              exercise: true,
              resistanceBlocks: resistanceBlockInclude,
            },
          },
        },
      });
      await touchWorkoutTemplateRevision(tx, data.templateId);
      return created;
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
        cyclicStages: cyclicStageInclude,
        exercises: {
          include: {
            exercise: true,
            executions: true,
            resistanceBlocks: resistanceBlockInclude,
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
    assertWorkoutParentIsImmutable(data, 'templateId');
    data = sanitizeWorkoutMutation(data, 'day');
    if (data.workoutDate !== undefined) {
      const current = await prisma.workoutDay.findUnique({
        where: { id },
        select: { dayOfWeek: true, template: { select: { weekStartDate: true } } },
      });
      if (!current) throw new ResistanceStructureNotFoundError();
      data = {
        ...data,
        workoutDate: workoutDateInTargetWeek(current.template.weekStartDate, current.dayOfWeek),
      };
    }
    return withWorkoutDayPlanningMutation(prisma, id, (tx) =>
      tx.workoutDay.update({
        where: { id },
        data,
      })
    );
  },

  /**
   * Persist a complete builder week as one serializable transaction. The web
   * builder may still queue snapshots per week, but readers never observe a
   * template updated without its days or resistance structure.
   */
  async saveTemplateWeek(id: string, data: SaveWorkoutWeekDTO, contractId?: string) {
    return saveTemplateWeekStructured(prisma, id, data, contractId);
  },

  /** Replace only structured cyclic stages, leaving legacy day fields unchanged. */
  async replaceDayCyclicStages(workoutDayId: string, stages: unknown, contractId: string) {
    const normalized = normalizeCyclicStages(stages);
    return withWorkoutDayPlanningMutation(prisma, workoutDayId, async (tx) => {
      await assertDayContract(tx, workoutDayId, contractId);
      return replaceCyclicStagesInTransaction(tx, workoutDayId, normalized);
    });
  },

  async updateWorkoutDayStatus(
    id: string,
    data: { status?: 'planned' | 'in_progress' | 'completed'; psrResponse?: number | null; pseResponse?: number | null }
  ) {
    if (data.status !== undefined) {
      throw new LegacyWorkoutLifecycleDisabledError();
    }

    await withWorkoutDayPlanningMutation(prisma, id, (tx) => tx.workoutDay.update({
      where: { id },
      data: {
        ...(data.psrResponse !== undefined ? { psrResponse: data.psrResponse } : {}),
        ...(data.pseResponse !== undefined ? { pseResponse: data.pseResponse } : {}),
      },
    }));

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
        cyclicStages: cyclicStageInclude,
        exercises: {
          include: {
            exercise: true,
            executions: true,
            resistanceBlocks: resistanceBlockInclude,
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

  async addExercise(data: CreateWorkoutExerciseDTO, contractId?: string) {
    return await this.addExerciseToDay(data, contractId);
  },

  async updateExercise(id: string, data: Partial<CreateWorkoutExerciseDTO>, contractId?: string) {
    return await this.updateWorkoutExercise(id, data, contractId);
  },

  async deleteExercise(id: string, contractId?: string) {
    return await this.removeExerciseFromDay(id, contractId);
  },

  /**
   * Deletar dia de treino
   */
  async deleteWorkoutDay(id: string) {
    return withWorkoutDayPlanningMutation(prisma, id, (tx) =>
      tx.workoutDay.delete({
        where: { id },
      })
    );
  },

  /**
   * Listar exercÃ­cios de um dia
   */
  async getExercises(workoutDayId: string) {
    return await prisma.workoutExercise.findMany({
      where: { workoutDayId },
      include: {
        exercise: true,
        resistanceBlocks: resistanceBlockInclude,
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
  async addExerciseToDay(data: CreateWorkoutExerciseDTO, contractId?: string) {
    data = sanitizeWorkoutMutation(data, 'exercise', 'create');
    const { resistanceBlocks, workoutExerciseId: _existingRowId, ...exercise } = data;
    const blocks = resistanceBlocks === undefined ? undefined : normalizeResistanceBlocks(resistanceBlocks);
    return withWorkoutDayPlanningMutation(prisma, data.workoutDayId, async (tx) => {
      if (contractId) await assertDayContract(tx, data.workoutDayId, contractId, data.exerciseId);
      return tx.workoutExercise.create({
        data: {
          ...exercise,
          ...(blocks ? { resistanceBlocks: nestedResistanceBlocks(blocks) } : {}),
        },
        include: {
          exercise: true,
          workoutDay: true,
          resistanceBlocks: resistanceBlockInclude,
        },
      });
    });
  },

  /**
   * Reconcile a day atomically without re-keying its exercises on every save.
   * Historical rows are never deleted or silently rewritten.
   */
  async replaceDayResistanceExercises(workoutDayId: string, exercises: CreateWorkoutExerciseDTO[], contractId?: string) {
    return replaceDayResistanceExercisesStructured(prisma, workoutDayId, exercises, contractId);
  },

  async updateWorkoutExercise(id: string, data: Partial<CreateWorkoutExerciseDTO>, contractId?: string) {
    data = sanitizeWorkoutMutation(data, 'exercise');
    const current = await prisma.workoutExercise.findUnique({ where: { id }, select: { workoutDayId: true, exerciseId: true } });
    if (!current) throw new Error('Workout exercise not found');

    if (data.workoutDayId !== undefined && data.workoutDayId !== current.workoutDayId) {
      throw new ResistanceStructureValidationError('Não é permitido mover um exercício entre dias.');
    }

    const workoutDayIds = [current.workoutDayId];

    const { resistanceBlocks, workoutExerciseId: _existingRowId, ...exercise } = data;
    const blocks = resistanceBlocks === undefined ? undefined : normalizeResistanceBlocks(resistanceBlocks);
    return prisma.$transaction(async (tx) => {
      for (const workoutDayId of workoutDayIds) {
        await lockWorkoutDayPlanningMutable(tx, workoutDayId);
        if (contractId) await assertDayContract(tx, workoutDayId, contractId, data.exerciseId ?? current.exerciseId);
      }
      return tx.workoutExercise.update({
        where: { id },
        data: {
          ...exercise,
          ...(blocks !== undefined ? {
            resistanceBlocks: { deleteMany: {}, ...nestedResistanceBlocks(blocks) },
          } : {}),
        },
        include: { exercise: true, resistanceBlocks: resistanceBlockInclude },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },

  /**
   * Copiar template para outra semana
   */
  async copyTemplateSections(id: string, targetWeekNumber: number, targetWeekStartDate: Date, mode: 'cyclic' | 'resistance') {
    return copyTemplateSectionsStructured(prisma, id, targetWeekNumber, targetWeekStartDate, mode);
  },

  async copyTemplate(id: string, targetWeekNumber: number, targetWeekStartDate: Date) {
    return copyTemplateStructured(prisma, id, targetWeekNumber, targetWeekStartDate);
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
            resistanceBlocks: resistanceBlockInclude,
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
    if (!Number.isInteger(targetDayOfWeek) || targetDayOfWeek < 1 || targetDayOfWeek > 7
      || !(targetDate instanceof Date) || !Number.isFinite(targetDate.getTime())) {
      throw new ResistanceStructureValidationError('Dados de cópia inválidos.');
    }
    const source = await this.getWorkoutDay(id);

    if (!source) {
      throw new Error('Workout day not found');
    }

    // `targetDate` is retained in the legacy contract for compatibility, but
    // the persisted date is always derived from the template anchor and the
    // canonical weekday. This prevents a valid date from being paired with a
    // different dayOfWeek.
    const canonicalTargetDate = workoutDateInTargetWeek(source.template.weekStartDate, targetDayOfWeek);

    const newDay = await withWorkoutTemplatePlanningMutation(prisma, source.templateId, async (tx) => {
      const created = await tx.workoutDay.create({
        data: {
          templateId: source.templateId,
          dayOfWeek: targetDayOfWeek,
          workoutDate: canonicalTargetDate,
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

      for (const stage of nestedCyclicStages(snapshotCyclicStages(source.cyclicStages), created.id)) {
        await tx.workoutCyclicStage.create({ data: stage });
      }

      for (const exercise of source.exercises) {
        await tx.workoutExercise.create({
          data: {
            workoutDayId: created.id,
            exerciseId: exercise.exerciseId,
            section: exercise.section,
            exerciseOrder: exercise.exerciseOrder,
            system: exercise.system,
            groupBreakBefore: exercise.groupBreakBefore,
            sets: exercise.sets,
            reps: exercise.reps,
            intervalSec: exercise.intervalSec,
            cParam: exercise.cParam,
            eParam: exercise.eParam,
            load: exercise.load,
            exerciseNotes: exercise.exerciseNotes,
            resistanceBlocks: nestedResistanceBlocks(exercise.resistanceBlocks.map((block) => ({
              position: block.position, kind: block.kind, notes: block.notes,
              plannedSets: block.plannedSets.map((set) => ({ position: set.position, repsMin: set.repsMin,
                repsMax: set.repsMax, loadKg: set.loadKg, loadPercent: set.loadPercent,
                rir: set.rir, rpe: set.rpe, tempo: set.tempo, restSec: set.restSec, notes: set.notes })),
            }))),
          },
        });
      }

      await touchWorkoutTemplateRevision(tx, source.templateId);
      return created;
    });

    return await this.getWorkoutDay(newDay.id);
  },

  /**
   * Remover exercÃ­cio do treino
   */
  async removeExerciseFromDay(id: string, contractId?: string) {
    const current = await prisma.workoutExercise.findUnique({ where: { id }, select: { workoutDayId: true } });
    if (!current) throw new Error('Workout exercise not found');
    return withWorkoutDayPlanningMutation(prisma, current.workoutDayId, async (tx) => {
      if (contractId) await assertDayContract(tx, current.workoutDayId, contractId);
      return tx.workoutExercise.delete({ where: { id } });
    });
  },

  /**
   * Reordenar exercÃ­cios de uma seÃ§Ã£o
   */
  async reorderExercises(
    workoutDayId: string,
    section: string,
    exerciseIds: string[],
    contractId?: string,
  ) {
    const uniqueIds = [...new Set(exerciseIds)];
    if (uniqueIds.length !== exerciseIds.length) {
      throw new ResistanceStructureValidationError('Exercício duplicado na ordenação.');
    }

    // Preserve the public validation contract for mismatched IDs even when
    // a template is released. Recheck after the lock to avoid TOCTOU.
    const candidateRows = await prisma.workoutExercise.findMany({
      where: { id: { in: uniqueIds }, workoutDayId, section },
      select: { id: true },
    });
    if (candidateRows.length !== uniqueIds.length) {
      throw new ResistanceStructureValidationError('One or more exercises do not belong to the requested day/section.');
    }

    return withWorkoutDayPlanningMutation(prisma, workoutDayId, async (tx) => {
      if (contractId) await assertDayContract(tx, workoutDayId, contractId);
      const owned = await tx.workoutExercise.findMany({
        where: { id: { in: uniqueIds }, workoutDayId, section },
        select: { id: true },
      });
      if (owned.length !== uniqueIds.length) {
        throw new ResistanceStructureValidationError('One or more exercises do not belong to the requested day/section.');
      }

      return Promise.all(
        exerciseIds.map((id, index) =>
          tx.workoutExercise.update({
            where: { id },
            data: { exerciseOrder: index + 1 },
          })
        )
      );
    });
  },

  /**
   * Registrar execuÃ§Ã£o de exercÃ­cio
   */
  async recordExecution(data: RecordExecutionDTO) {
    return prisma.$transaction(async (tx) => {
      const workoutExercise = await tx.workoutExercise.findFirst({
        where: {
          id: data.workoutExerciseId,
          workoutDay: {
            template: {
              released: true,
              plan: { alunoId: data.alunoId },
            },
          },
        },
        select: { id: true, exerciseId: true },
      });
      if (!workoutExercise) throw new ResistanceStructureNotFoundError();

      const execution = await tx.workoutExecution.create({ data });

      // Atualizar progresso do aluno se houver carga, na mesma transação.
      if (data.loadUsed !== undefined && data.loadUsed !== null) {
        const progress = await tx.alunoExerciseProgress.findUnique({
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

        await tx.alunoExerciseProgress.upsert({
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

      return execution;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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

import { PrismaClient } from '@prisma/client';

import { Prisma } from '@prisma/client';
import { matchResistanceExerciseRows, normalizeResistanceBlocks, ResistanceStructureValidationError, type ResistanceBlockInput, type ResistancePlannedSetInput } from './resistance-structure.domain.js';

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

function normalizeWorkoutTemplateUpdateData(
  data: Partial<CreateWorkoutTemplateDTO>
): Prisma.WorkoutTemplateUncheckedUpdateInput {
  const { alunoGoal, ...rest } = data;

  return {
    ...rest,
    ...(alunoGoal !== undefined ? { studentGoal: alunoGoal } : {}),
  };
}

function serializeWorkoutTemplate<T extends { studentGoal?: string | null } | null>(template: T) {
  if (!template) {
    return template;
  }

  return {
    ...template,
    alunoGoal: template.studentGoal,
  };
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


export class WorkoutPlanningLockedError extends Error {
  readonly statusCode = 409;
  readonly code = 'WORKOUT_PLANNING_LOCKED_AFTER_EXECUTION_START';

  constructor() {
    super('O planejamento desta sessão não pode ser alterado depois que a execução foi iniciada.');
  }
}

/** Preserve the released version as an immutable source of truth. */
async function rejectFrozenPlanning(tx: Prisma.TransactionClient, workoutDayId: string) {
  const day = await tx.workoutDay.findUnique({
    where: { id: workoutDayId },
    select: { template: { select: { released: true } } },
  });
  if (!day) throw new Error('Workout day not found');
  if (day.template.released) throw new WorkoutPlanningLockedError();
}

function nestedResistanceBlocks(blocks: Array<Omit<ResistanceBlockInput, 'kind'> & { kind: string }>) {
  return {
    create: blocks.map((block) => ({
      position: block.position,
      kind: block.kind,
      notes: block.notes,
      plannedSets: {
        create: block.plannedSets.map((set) => ({
          position: set.position,
          repsMin: set.repsMin,
          repsMax: set.repsMax,
          loadKg: set.loadKg,
          loadPercent: set.loadPercent,
          rir: set.rir,
          rpe: set.rpe,
          tempo: set.tempo,
          restSec: set.restSec,
          notes: set.notes,
        })),
      },
    })),
  };
}
function comparableResistanceBlocks(blocks: ReadonlyArray<{
  position: number;
  kind: string;
  notes?: string | null;
  plannedSets: ReadonlyArray<ResistancePlannedSetInput>;
}>) {
  return JSON.stringify(blocks.map((block) => ({
    position: block.position,
    kind: block.kind,
    notes: block.notes ?? null,
    plannedSets: block.plannedSets.map((set) => ({
      position: set.position,
      repsMin: set.repsMin ?? null,
      repsMax: set.repsMax ?? null,
      loadKg: set.loadKg ?? null,
      loadPercent: set.loadPercent ?? null,
      rir: set.rir ?? null,
      rpe: set.rpe ?? null,
      tempo: set.tempo ?? null,
      restSec: set.restSec ?? null,
      notes: set.notes ?? null,
    })),
  })));
}

const resistanceBlockInclude = {
  orderBy: { position: 'asc' as const },
  include: { plannedSets: { orderBy: { position: 'asc' as const } } },
};

export class LegacyWorkoutLifecycleDisabledError extends Error {
  readonly statusCode = 409;
  readonly code = 'WORKOUT_SESSION_EXECUTION_CANONICAL_ENDPOINT_REQUIRED';

  constructor() {
    super('Use o contrato canônico de execução da sessão para alterar o estado do treino.');
  }
}

function isSerializableTransactionConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2034') return true;
  if (error.code !== 'P2010') return false;

  const meta = error.meta as { code?: unknown; message?: unknown } | undefined;
  return meta?.code === '40001'
    || (typeof meta?.message === 'string'
      && /could not serialize access|serialization failure/i.test(meta.message));
}

async function lockWorkoutDayPlanningMutable(
  tx: Prisma.TransactionClient,
  workoutDayId: string
) {
  await tx.$queryRaw(Prisma.sql`
    SELECT wd."id"
    FROM "WorkoutDay" wd
    WHERE wd."id" = ${workoutDayId}
    FOR UPDATE
  `);

  await rejectFrozenPlanning(tx, workoutDayId);
  const execution = await tx.workoutSessionExecution.findUnique({
    where: { workoutDayId },
    select: { status: true },
  });
  if (execution && execution.status !== 'not_started') throw new WorkoutPlanningLockedError();
}

async function lockWorkoutTemplatePlanningMutable(
  tx: Prisma.TransactionClient,
  templateId: string
) {
  await tx.$queryRaw(Prisma.sql`
    SELECT wd."id"
    FROM "WorkoutDay" wd
    WHERE wd."templateId" = ${templateId}
    ORDER BY wd."id"
    FOR UPDATE
  `);

  const template = await tx.workoutTemplate.findUnique({ where: { id: templateId }, select: { released: true } });
  if (template?.released) throw new WorkoutPlanningLockedError();
  const started = await tx.workoutSessionExecution.findFirst({
    where: {
      workoutDay: { templateId },
      status: { not: 'not_started' },
    },
    select: { id: true },
  });
  if (started) throw new WorkoutPlanningLockedError();
}

async function withWorkoutDayPlanningMutation<T>(
  workoutDayId: string,
  mutation: (tx: Prisma.TransactionClient) => Promise<T>
) {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockWorkoutDayPlanningMutable(tx, workoutDayId);
      return mutation(tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isSerializableTransactionConflict(error)) {
      const execution = await prisma.workoutSessionExecution.findUnique({
        where: { workoutDayId },
        select: { status: true },
      });
      if (execution && execution.status !== 'not_started') throw new WorkoutPlanningLockedError();
    }
    throw error;
  }
}

async function withWorkoutTemplatePlanningMutation<T>(
  templateId: string,
  mutation: (tx: Prisma.TransactionClient) => Promise<T>
) {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockWorkoutTemplatePlanningMutable(tx, templateId);
      return mutation(tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isSerializableTransactionConflict(error)) {
      const started = await prisma.workoutSessionExecution.findFirst({
        where: {
          workoutDay: { templateId },
          status: { not: 'not_started' },
        },
        select: { id: true },
      });
      if (started) throw new WorkoutPlanningLockedError();
    }
    throw error;
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
        const weekStartDate = data.weekStartDate;
        await withWorkoutTemplatePlanningMutation(existing.id, async (tx) => {
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

        return serializeWorkoutTemplate(updatedTemplate);
      }

      return serializeWorkoutTemplate(existing);
    }

    return await this.createTemplate(data);
  },

  /**
   * Criar template semanal de treino
   */
  async createTemplate(data: CreateWorkoutTemplateDTO) {
    const template = await prisma.workoutTemplate.create({
      data: normalizeWorkoutTemplateCreateData(data),
      include: {
        plan: true,
        workoutDays: true,
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
    const template = await withWorkoutTemplatePlanningMutation(id, (tx) =>
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
    return withWorkoutTemplatePlanningMutation(id, (tx) =>
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
    const template = await withWorkoutTemplatePlanningMutation(id, (tx) =>
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
    return withWorkoutTemplatePlanningMutation(data.templateId, (tx) =>
      tx.workoutDay.create({
        data,
        include: {
          template: true,
          exercises: {
            include: {
              exercise: true,
              resistanceBlocks: resistanceBlockInclude,
            },
          },
        },
      })
    );
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
    return withWorkoutDayPlanningMutation(id, (tx) =>
      tx.workoutDay.update({
        where: { id },
        data,
      })
    );
  },

  async updateWorkoutDayStatus(
    id: string,
    data: { status?: 'planned' | 'in_progress' | 'completed'; psrResponse?: number | null; pseResponse?: number | null }
  ) {
    if (data.status !== undefined) {
      throw new LegacyWorkoutLifecycleDisabledError();
    }

    await prisma.workoutDay.update({
      where: { id },
      data: {
        ...(data.psrResponse !== undefined ? { psrResponse: data.psrResponse } : {}),
        ...(data.pseResponse !== undefined ? { pseResponse: data.pseResponse } : {}),
      },
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
    return withWorkoutDayPlanningMutation(id, (tx) =>
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
  async addExerciseToDay(data: CreateWorkoutExerciseDTO) {
    const { resistanceBlocks, workoutExerciseId: _existingRowId, ...exercise } = data;
    const blocks = resistanceBlocks === undefined ? undefined : normalizeResistanceBlocks(resistanceBlocks);
    return withWorkoutDayPlanningMutation(data.workoutDayId, (tx) =>
      tx.workoutExercise.create({
        data: {
          ...exercise,
          ...(blocks ? { resistanceBlocks: nestedResistanceBlocks(blocks) } : {}),
        },
        include: {
          exercise: true,
          workoutDay: true,
          resistanceBlocks: resistanceBlockInclude,
        },
      })
    );
  },

  /**
   * Reconcile a day atomically without re-keying its exercises on every save.
   * Historical rows are never deleted or silently rewritten.
   */
  async replaceDayResistanceExercises(workoutDayId: string, exercises: CreateWorkoutExerciseDTO[]) {
    if (!Array.isArray(exercises) || exercises.length > 200) {
      throw new ResistanceStructureValidationError('Lista de exercícios inválida.');
    }
    const perSection = new Map<string, number>();
    const prepared = exercises.map((input) => {
      if (!input || typeof input.exerciseId !== 'string' || !input.exerciseId.trim()
        || input.workoutDayId !== workoutDayId
        || (input.workoutExerciseId !== undefined
          && (typeof input.workoutExerciseId !== 'string' || !input.workoutExerciseId.trim()))
        || !['mobilidade', 'sessao', 'resfriamento'].includes(input.section)) {
        throw new ResistanceStructureValidationError('Exercício inválido.');
      }
      const expected = (perSection.get(input.section) ?? 0) + 1;
      if (input.exerciseOrder !== expected) throw new ResistanceStructureValidationError('Ordem de exercício inválida.');
      perSection.set(input.section, expected);
      const { resistanceBlocks, workoutExerciseId, ...exercise } = input;
      const blocks = resistanceBlocks === undefined ? undefined : normalizeResistanceBlocks(resistanceBlocks);
      return { workoutExerciseId, exercise, blocks };
    });

    return withWorkoutDayPlanningMutation(workoutDayId, async (tx) => {
      const current = await tx.workoutExercise.findMany({
        where: { workoutDayId },
        include: {
          resistanceBlocks: resistanceBlockInclude,
          _count: { select: { executions: true, executionItems: true } },
        },
        orderBy: [{ section: 'asc' }, { exerciseOrder: 'asc' }],
      });
      const identity = matchResistanceExerciseRows(current, prepared.map((item) => ({
        workoutExerciseId: item.workoutExerciseId,
        exerciseId: item.exercise.exerciseId,
        section: item.exercise.section,
      })));
      const preserved = new Set(identity.filter((id): id is string => id !== null));

      // Validate removals before any writes to protect historical execution rows.
      for (const prior of current) {
        if (!preserved.has(prior.id)
          && (prior._count.executions > 0 || prior._count.executionItems > 0)) {
          throw new WorkoutPlanningLockedError();
        }
      }
      for (let index = 0; index < prepared.length; index += 1) {
        const input = prepared[index];
        const rowId = identity[index];
        if (!rowId) {
          await tx.workoutExercise.create({
            data: {
              ...input.exercise,
              ...(input.blocks ? { resistanceBlocks: nestedResistanceBlocks(input.blocks) } : {}),
            },
          });
          continue;
        }
        const prior = current.find((row) => row.id === rowId)!;
        const changedColumns = Object.entries(input.exercise).some(([key, value]) =>
          value !== undefined && value !== prior[key as keyof typeof prior]);
        const blocksChanged = input.blocks !== undefined
          && comparableResistanceBlocks(prior.resistanceBlocks) !== comparableResistanceBlocks(input.blocks);
        if ((prior._count.executions > 0 || prior._count.executionItems > 0)
          && (changedColumns || blocksChanged)) {
          throw new WorkoutPlanningLockedError();
        }
        if (!changedColumns && !blocksChanged) continue;
        await tx.workoutExercise.update({
          where: { id: rowId },
          data: {
            ...input.exercise,
            ...(blocksChanged && input.blocks
              ? { resistanceBlocks: { deleteMany: {}, ...nestedResistanceBlocks(input.blocks) } }
              : {}),
          },
        });
      }
      for (const prior of current) {
        if (!preserved.has(prior.id)) {
          await tx.workoutExercise.delete({ where: { id: prior.id } });
        }
      }
      return tx.workoutExercise.findMany({
        where: { workoutDayId },
        include: { exercise: true, resistanceBlocks: resistanceBlockInclude },
        orderBy: [{ section: 'asc' }, { exerciseOrder: 'asc' }],
      });
    });
  },

  /**
   * Atualizar exercÃ­cio do treino
   */
  async updateWorkoutExercise(id: string, data: Partial<CreateWorkoutExerciseDTO>) {
    const current = await prisma.workoutExercise.findUnique({ where: { id }, select: { workoutDayId: true } });
    if (!current) throw new Error('Workout exercise not found');

    const targetWorkoutDayId = data.workoutDayId ?? current.workoutDayId;
    const workoutDayIds = [...new Set([current.workoutDayId, targetWorkoutDayId])].sort();

    const { resistanceBlocks, workoutExerciseId: _existingRowId, ...exercise } = data;
    const blocks = resistanceBlocks === undefined ? undefined : normalizeResistanceBlocks(resistanceBlocks);
    return prisma.$transaction(async (tx) => {
      for (const workoutDayId of workoutDayIds) {
        await lockWorkoutDayPlanningMutable(tx, workoutDayId);
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
  async copyTemplate(id: string, targetWeekNumber: number, targetWeekStartDate: Date) {
    if (!Number.isFinite(targetWeekNumber) || targetWeekNumber <= 0) {
      throw new Error('Invalid targetWeekNumber');
    }
    const source = await prisma.workoutTemplate.findUnique({
      where: { id },
      include: {
        workoutDays: {
          include: {
            exercises: { include: { resistanceBlocks: resistanceBlockInclude } },
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
      await withWorkoutTemplatePlanningMutation(existingTarget.id, (tx) =>
        tx.workoutTemplate.delete({
          where: { id: existingTarget.id },
        })
      );
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
        studentGoal: source.studentGoal,
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
    }

    const copiedTemplate = await prisma.workoutTemplate.findUnique({
      where: { id: newTemplate.id },
      include: {
        plan: true,
        workoutDays: {
          include: {
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

    return serializeWorkoutTemplate(copiedTemplate);
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
    const source = await this.getWorkoutDay(id);

    if (!source) {
      throw new Error('Workout day not found');
    }

    const newDay = await withWorkoutTemplatePlanningMutation(source.templateId, async (tx) => {
      const created = await tx.workoutDay.create({
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

      return created;
    });

    return await this.getWorkoutDay(newDay.id);
  },

  /**
   * Remover exercÃ­cio do treino
   */
  async removeExerciseFromDay(id: string) {
    const current = await prisma.workoutExercise.findUnique({ where: { id }, select: { workoutDayId: true } });
    if (!current) throw new Error('Workout exercise not found');
    return withWorkoutDayPlanningMutation(current.workoutDayId, (tx) =>
      tx.workoutExercise.delete({
        where: { id },
      })
    );
  },

  /**
   * Reordenar exercÃ­cios de uma seÃ§Ã£o
   */
  async reorderExercises(
    workoutDayId: string,
    section: string,
    exerciseIds: string[]
  ) {
    const uniqueIds = [...new Set(exerciseIds)];
    if (uniqueIds.length !== exerciseIds.length) {
      throw new Error('Duplicate workout exercise id');
    }

    return withWorkoutDayPlanningMutation(workoutDayId, async (tx) => {
      const owned = await tx.workoutExercise.findMany({
        where: { id: { in: uniqueIds }, workoutDayId, section },
        select: { id: true },
      });
      if (owned.length !== uniqueIds.length) {
        throw new Error('One or more workout exercises do not belong to the requested day/section');
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


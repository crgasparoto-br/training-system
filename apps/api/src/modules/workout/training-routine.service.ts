import { Prisma, PrismaClient } from '@prisma/client';
import type {
  TrainingRoutineAudience,
  TrainingRoutineBlock,
  TrainingRoutineBlockKey,
  TrainingRoutineConsolidatedRelease,
  TrainingRoutineCyclicTargets,
  TrainingRoutineDay,
  TrainingRoutineModality,
  TrainingRoutineRange,
  TrainingRoutineSessionDetail,
  TrainingRoutineSessionStatus,
  TrainingRoutineSessionSummary,
  TrainingRoutineView,
} from '@corrida/types';
import { DEFAULT_CONTRACT_TIME_ZONE } from '../contracts/contract-date-input.js';

/**
 * Leitura da rotina semanal e do Treino de hoje (issue #387).
 *
 * Somente leitura sobre o grafo operacional liberado. Este serviço não cria,
 * atualiza nem simula estado de execução: o lifecycle da sessão pertence à #389.
 */

const prisma = new PrismaClient();
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DAY_MS = 24 * 60 * 60 * 1000;

export class TrainingRoutineInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrainingRoutineInputError';
  }
}

export type TrainingRoutineQuery = {
  alunoId: string;
  contractId: string;
  audience: TrainingRoutineAudience;
  /** Data local `YYYY-MM-DD`; quando ausente usa a data atual no fuso do produto. */
  date?: string;
  now?: Date;
};

const sessionSelect = {
  id: true,
  dayOfWeek: true,
  workoutDate: true,
  sessionDurationMin: true,
  stimulusDurationMin: true,
  cyclicTimeMin: true,
  resistanceTimeMin: true,
  location: true,
  method: true,
  status: true,
  targetHrMin: true,
  targetHrMax: true,
  targetSpeedMin: true,
  targetSpeedMax: true,
  paceMin: true,
  paceMax: true,
  vo2maxPct: true,
  generalGuidelines: true,
  detailNotes: true,
  complementNotes: true,
  template: {
    select: {
      id: true,
      planId: true,
      mesocycleNumber: true,
      weekNumber: true,
      releasedAt: true,
      studentGoal: true,
      coachGoal: true,
      trainingMethod: true,
      trainingDivision: true,
      repReserve: true,
      plan: { select: { id: true, name: true } },
    },
  },
  exercises: {
    orderBy: [{ section: 'asc' as const }, { exerciseOrder: 'asc' as const }, { id: 'asc' as const }],
    select: {
      id: true,
      section: true,
      exerciseOrder: true,
      system: true,
      sets: true,
      reps: true,
      load: true,
      intervalSec: true,
      exerciseNotes: true,
      exercise: { select: { name: true } },
    },
  },
} satisfies Prisma.WorkoutDaySelect;

type SessionRow = Prisma.WorkoutDayGetPayload<{ select: typeof sessionSelect }>;

type CapacityBlockRow = { workoutDayId: string; capacity: string };

type ReleaseRow = {
  id: string;
  assemblyId: string;
  workoutTemplateId: string;
  sourceAssemblyVersion: number;
  releasedAssemblyVersion: number;
};

const SECTION_BLOCK: Record<string, TrainingRoutineBlockKey> = {
  mobilidade: 'warmup',
  aquecimento: 'warmup',
  sessao: 'main',
  principal: 'main',
  resfriamento: 'cooldown',
  finalizacao: 'cooldown',
};
const BLOCK_ORDER: TrainingRoutineBlockKey[] = ['warmup', 'main', 'cooldown', 'other'];

export function parseDateOnly(value: string): Date {
  const match = DATE_ONLY_PATTERN.exec(value.trim());
  if (!match) throw new TrainingRoutineInputError('Data inválida. Use o formato AAAA-MM-DD.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new TrainingRoutineInputError('Data inválida. Use o formato AAAA-MM-DD.');
  }
  return date;
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Data civil atual no fuso informado, sem depender do fuso do processo. */
export function todayInTimeZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Semana civil segunda-feira a domingo que contém a data de referência. */
export function resolveRoutineWeek(reference: Date) {
  const offset = (reference.getUTCDay() + 6) % 7;
  const start = new Date(reference.getTime() - offset * DAY_MS);
  const days = Array.from({ length: 7 }, (_, index) => new Date(start.getTime() + index * DAY_MS));
  const endExclusive = new Date(start.getTime() + 7 * DAY_MS);
  return { start, days, endExclusive };
}

const cleanText = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const toRange = (
  min: string | number | null | undefined,
  max: string | number | null | undefined
): TrainingRoutineRange | null => {
  const normalizedMin = min === null || min === undefined ? null : cleanText(String(min));
  const normalizedMax = max === null || max === undefined ? null : cleanText(String(max));
  return normalizedMin || normalizedMax ? { min: normalizedMin, max: normalizedMax } : null;
};

function buildCyclicTargets(row: SessionRow): TrainingRoutineCyclicTargets | null {
  const targets: TrainingRoutineCyclicTargets = {
    durationMin: row.cyclicTimeMin ?? row.stimulusDurationMin ?? null,
    heartRate: toRange(row.targetHrMin, row.targetHrMax),
    speed: toRange(row.targetSpeedMin, row.targetSpeedMax),
    pace: toRange(row.paceMin, row.paceMax),
  };
  const hasTargets =
    targets.durationMin !== null || targets.heartRate || targets.speed || targets.pace || row.vo2maxPct !== null;
  return hasTargets ? targets : null;
}

function resolveModalities(row: SessionRow, capacities: string[]): TrainingRoutineModality[] {
  const modalities: TrainingRoutineModality[] = [];
  if (row.exercises.length > 0) modalities.push('resistance');
  if (buildCyclicTargets(row)) modalities.push('cyclic');
  if (capacities.includes('flexibility')) modalities.push('flexibility');
  if (capacities.includes('balance')) modalities.push('balance');
  return modalities;
}

function resolveDuration(row: SessionRow): number | null {
  if (row.sessionDurationMin !== null) return row.sessionDurationMin;
  if (row.cyclicTimeMin === null && row.resistanceTimeMin === null) return null;
  return (row.cyclicTimeMin ?? 0) + (row.resistanceTimeMin ?? 0);
}

function buildBlocks(row: SessionRow): TrainingRoutineBlock[] {
  const grouped = new Map<TrainingRoutineBlockKey, TrainingRoutineBlock['exercises']>();
  for (const item of row.exercises) {
    const key = SECTION_BLOCK[item.section.trim().toLowerCase()] ?? 'other';
    const list = grouped.get(key) ?? [];
    list.push({
      id: item.id,
      order: item.exerciseOrder,
      name: item.exercise.name,
      system: cleanText(item.system),
      sets: item.sets,
      reps: item.reps,
      loadKg: item.load,
      intervalSec: item.intervalSec,
      notes: cleanText(item.exerciseNotes),
    });
    grouped.set(key, list);
  }
  return BLOCK_ORDER.filter((key) => grouped.has(key)).map((key) => ({
    key,
    exercises: grouped.get(key)!,
  }));
}

function toSummary(
  row: SessionRow,
  audience: TrainingRoutineAudience,
  capacities: string[],
  release: ReleaseRow | undefined
): TrainingRoutineSessionSummary {
  const consolidatedRelease: TrainingRoutineConsolidatedRelease | undefined = release
    ? {
        releaseId: release.id,
        assemblyId: release.assemblyId,
        sourceAssemblyVersion: release.sourceAssemblyVersion,
        releasedAssemblyVersion: release.releasedAssemblyVersion,
      }
    : undefined;

  return {
    sessionId: row.id,
    workoutTemplateId: row.template.id,
    trainingPlanId: row.template.plan.id,
    planName: row.template.plan.name,
    date: toDateOnly(row.workoutDate),
    dayOfWeek: row.dayOfWeek,
    mesocycleNumber: row.template.mesocycleNumber,
    weekNumber: row.template.weekNumber,
    modalities: resolveModalities(row, capacities),
    durationMin: resolveDuration(row),
    location: cleanText(row.location),
    method: cleanText(row.method),
    status: row.status as TrainingRoutineSessionStatus,
    origin: {
      kind: release ? 'consolidated' : 'manual',
      releasedAt: row.template.releasedAt?.toISOString() ?? null,
      ...(audience === 'professor' && consolidatedRelease ? { consolidatedRelease } : {}),
    },
  };
}

function toDetail(
  row: SessionRow,
  audience: TrainingRoutineAudience,
  capacities: string[],
  release: ReleaseRow | undefined
): TrainingRoutineSessionDetail {
  const detail: TrainingRoutineSessionDetail = {
    ...toSummary(row, audience, capacities, release),
    objective: cleanText(row.template.studentGoal),
    guidelines: [row.generalGuidelines, row.detailNotes, row.complementNotes]
      .map(cleanText)
      .filter((value): value is string => value !== null),
    cyclic: buildCyclicTargets(row),
    blocks: buildBlocks(row),
  };

  if (audience === 'professor') {
    detail.technical = {
      coachGoal: cleanText(row.template.coachGoal),
      trainingMethod: cleanText(row.template.trainingMethod),
      trainingDivision: cleanText(row.template.trainingDivision),
      repReserve: row.template.repReserve,
      vo2maxPct: row.vo2maxPct,
    };
  }

  return detail;
}

export function createTrainingRoutineService(client: PrismaClient = prisma) {
  return {
    async getRoutine(query: TrainingRoutineQuery): Promise<TrainingRoutineView> {
      const timeZone = DEFAULT_CONTRACT_TIME_ZONE;
      const today = todayInTimeZone(query.now ?? new Date(), timeZone);
      const referenceDate = query.date ? toDateOnly(parseDateOnly(query.date)) : today;
      const week = resolveRoutineWeek(parseDateOnly(referenceDate));
      const studentScope = { alunoId: query.alunoId, aluno: { contractId: query.contractId } };
      const todayStart = parseDateOnly(today);
      // Hoje pode estar fora da semana consultada (navegação entre semanas).
      const workoutDateWindow: Prisma.WorkoutDayWhereInput[] = [
        { workoutDate: { gte: week.start, lt: week.endExclusive } },
        { workoutDate: { gte: todayStart, lt: new Date(todayStart.getTime() + DAY_MS) } },
      ];

      const [rows, pendingRows] = await Promise.all([
        client.workoutDay.findMany({
          where: { OR: workoutDateWindow, template: { released: true, plan: studentScope } },
          orderBy: [{ workoutDate: 'asc' }, { dayOfWeek: 'asc' }, { id: 'asc' }],
          select: sessionSelect,
        }),
        client.workoutDay.findMany({
          where: { OR: workoutDateWindow, template: { released: false, plan: studentScope } },
          select: { workoutDate: true },
        }),
      ]);

      const dayIds = rows.map((row) => row.id);
      const templateIds = [...new Set(rows.map((row) => row.template.id))];
      const [capacityRows, releaseRows] = await Promise.all([
        dayIds.length
          ? client.$queryRaw<CapacityBlockRow[]>`
              SELECT "workoutDayId", "capacity"
              FROM "WorkoutDayCapacityOperationalBlock"
              WHERE "workoutDayId" IN (${Prisma.join(dayIds)})
            `
          : Promise.resolve([] as CapacityBlockRow[]),
        templateIds.length
          ? client.$queryRaw<ReleaseRow[]>`
              SELECT "id", "assemblyId", "workoutTemplateId", "sourceAssemblyVersion", "releasedAssemblyVersion"
              FROM "ConsolidatedPrescriptionOperationalRelease"
              WHERE "workoutTemplateId" IN (${Prisma.join(templateIds)})
                AND "contractId" = ${query.contractId}
                AND "alunoId" = ${query.alunoId}
            `
          : Promise.resolve([] as ReleaseRow[]),
      ]);

      const capacitiesByDay = new Map<string, string[]>();
      for (const block of capacityRows) {
        capacitiesByDay.set(block.workoutDayId, [...(capacitiesByDay.get(block.workoutDayId) ?? []), block.capacity]);
      }
      const releaseByTemplate = new Map(releaseRows.map((release) => [release.workoutTemplateId, release]));
      const pendingByDate = new Map<string, number>();
      for (const pending of pendingRows) {
        const key = toDateOnly(pending.workoutDate);
        pendingByDate.set(key, (pendingByDate.get(key) ?? 0) + 1);
      }
      const rowsOn = (key: string) => rows.filter((row) => toDateOnly(row.workoutDate) === key);
      const context = (row: SessionRow) =>
        [query.audience, capacitiesByDay.get(row.id) ?? [], releaseByTemplate.get(row.template.id)] as const;

      const days: TrainingRoutineDay[] = week.days.map((date) => {
        const key = toDateOnly(date);
        return {
          date: key,
          isToday: key === today,
          sessions: rowsOn(key).map((row) => toSummary(row, ...context(row))),
          pendingReleaseCount: pendingByDate.get(key) ?? 0,
        };
      });
      const todayRows = rowsOn(today);
      const todayPending = pendingByDate.get(today) ?? 0;

      return {
        alunoId: query.alunoId,
        audience: query.audience,
        referenceDate,
        timeZone,
        week: { startDate: toDateOnly(week.start), endDate: toDateOnly(week.days[6]) },
        days,
        today: {
          date: today,
          state: todayRows.length > 0 ? 'released' : todayPending > 0 ? 'not_released' : 'none',
          sessions: todayRows.map((row) => toDetail(row, ...context(row))),
        },
        // O contrato mutável canônico da #389 ainda não existe; nenhuma ação pode ser habilitada.
        execution: { available: false, reason: 'execution_contract_pending' },
      };
    },
  };
}

export const trainingRoutineService = createTrainingRoutineService();

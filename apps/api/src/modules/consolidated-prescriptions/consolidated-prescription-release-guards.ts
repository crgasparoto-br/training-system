import type { Prisma } from '@prisma/client';
import {
  CAPACITY_SOURCE_TYPES,
  type CapacityPrescriptionSourceRef,
  type ReleaseConsolidatedOperationalWorkoutCommand,
} from '@corrida/types';
import {
  assertCapacitySourceIntegrity,
  CapacitySourceIntegrityError,
} from '../capacity-prescriptions/capacity-prescription-source-integrity.service.js';

const UTC_DAY_MS = 24 * 60 * 60 * 1000;
const capacitySourceTypes = new Set<string>(CAPACITY_SOURCE_TYPES);

export type ConsolidatedReleaseDataRefLike = {
  role: string;
  sourceType: string;
  sourceId: string;
  label: string | null;
  assessedAt: Date | null;
  origin: string | null;
  sourceVersion: string | null;
  responsibleProfessorId: string | null;
};

type ExistingOperationalTargetLike = {
  weekStartDate: Date;
  workoutDays: Array<{
    dayOfWeek: number;
    workoutDate: Date;
  }>;
};

function utcDay(value: Date) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function parsedDate(value: string) {
  const parsed = new Date(value);
  return value.trim() && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function expectedWorkoutDay(weekStartDate: Date, dayOfWeek: number) {
  return utcDay(weekStartDate) + (dayOfWeek - 1) * UTC_DAY_MS;
}

export function getReleaseTargetTemporalIssue(
  command: ReleaseConsolidatedOperationalWorkoutCommand,
  now: Date
): string | null {
  const weekStartDate = parsedDate(command.target.weekStartDate);
  if (!weekStartDate) return null;

  for (const placement of command.target.placements) {
    if (!Number.isInteger(placement.dayOfWeek) || placement.dayOfWeek < 1 || placement.dayOfWeek > 7) {
      continue;
    }
    const workoutDate = parsedDate(placement.workoutDate);
    if (!workoutDate) continue;
    if (utcDay(workoutDate) !== expectedWorkoutDay(weekStartDate, placement.dayOfWeek)) {
      return `A data do treino do dia ${placement.dayOfWeek} não pertence à semana operacional selecionada`;
    }
    if (utcDay(workoutDate) <= utcDay(now)) {
      return 'A nova liberação deve apontar somente para treino futuro explicitamente selecionado';
    }
  }
  return null;
}

export function getExistingReleaseTargetTemporalIssue(
  existing: ExistingOperationalTargetLike,
  requestedWeekStartDate: Date,
  now: Date
): string | null {
  if (utcDay(existing.weekStartDate) !== utcDay(requestedWeekStartDate)) {
    return 'O treino alvo existente pertence a outro período e não pode ter sua semana reescrita';
  }

  for (const day of existing.workoutDays) {
    if (
      !Number.isInteger(day.dayOfWeek) ||
      day.dayOfWeek < 1 ||
      day.dayOfWeek > 7 ||
      utcDay(day.workoutDate) !== expectedWorkoutDay(requestedWeekStartDate, day.dayOfWeek)
    ) {
      return 'O treino alvo existente possui datas incompatíveis com o período selecionado';
    }
    if (utcDay(day.workoutDate) <= utcDay(now)) {
      return 'O treino alvo existente não é integralmente futuro e não pode ser reconciliado';
    }
  }
  return null;
}

export async function assertConsolidatedReleaseSourceLiveness(input: {
  client: Prisma.TransactionClient;
  contractId: string;
  alunoId: string;
  refs: ConsolidatedReleaseDataRefLike[];
}) {
  const canonicalRefs: CapacityPrescriptionSourceRef[] = [];
  for (const ref of input.refs) {
    const isCanonical = capacitySourceTypes.has(ref.sourceType);
    if (ref.role === 'capacity_source' && !isCanonical) {
      throw new CapacitySourceIntegrityError(
        'A montagem aprovada contém referência de capacidade com origem canônica desconhecida.'
      );
    }
    if (!isCanonical) continue;
    canonicalRefs.push({
      type: ref.sourceType as CapacityPrescriptionSourceRef['type'],
      id: ref.sourceId,
      label: ref.label ?? ref.sourceId,
      assessedAt: ref.assessedAt?.toISOString() ?? null,
      origin: ref.origin,
      version: ref.sourceVersion,
      responsibleProfessorId: ref.responsibleProfessorId,
    });
  }

  await assertCapacitySourceIntegrity({
    client: input.client,
    contractId: input.contractId,
    alunoId: input.alunoId,
    sourceRefs: canonicalRefs,
  });
}

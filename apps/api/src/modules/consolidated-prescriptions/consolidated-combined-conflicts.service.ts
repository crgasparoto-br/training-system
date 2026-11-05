import { Prisma, PrismaClient } from '@prisma/client';
import type { ConsolidatedCombinedReview } from '@corrida/types';
import {
  ACTIVE_COMBINED_CONFLICT_RULES_V1,
  evaluateCombinedTrainingConflicts,
  type ConflictCapacity,
  type ConflictObservation,
  type ConflictRule,
} from '../workout/combined-training-conflicts.domain.js';
import {
  parseDateOnly,
  resolveRoutineWeek,
  todayInTimeZone,
} from '../workout/training-routine.service.js';
import { DEFAULT_CONTRACT_TIME_ZONE } from '../contracts/contract-date-input.js';
import {
  ConsolidatedPrescriptionDomainError,
  type ConsolidatedPrescriptionContext,
} from './consolidated-prescription.service.js';

const prisma = new PrismaClient();

type Release = {
  id: string;
  assemblyId: string;
  contractId: string;
  alunoId: string;
  workoutTemplateId: string;
  releasedAssemblyVersion: number;
};
type CapacitySnapshot = {
  workoutDayId: string;
  capacity: 'flexibility' | 'balance';
  capacityPrescriptionVersionId: string;
  contractVersion: number;
};
const sessionSelect = {
  id: true,
  templateId: true,
  workoutDate: true,
  cyclicTimeMin: true,
  resistanceTimeMin: true,
  exercises: { take: 1, select: { id: true } },
  cyclicStages: { take: 1, select: { id: true } },
  execution: {
    select: {
      id: true,
      status: true,
      originReleaseId: true,
      originWorkoutTemplateId: true,
      version: true,
      startedAt: true,
    },
  },
} satisfies Prisma.WorkoutDaySelect;
type Session = Prisma.WorkoutDayGetPayload<{ select: typeof sessionSelect }>;
type CheckIn = {
  id: string;
  workoutDayId: string;
  alunoId: string;
  contractId: string;
  psr: number | null;
  fatigue: number | null;
  sleepQuality: number | null;
  painLevel: number | null;
  updatedAt: Date;
};
type Feedback = {
  id: string;
  workoutDayId: string;
  alunoId: string;
  contractId: string;
  executionId: string;
  originReleaseId: string;
  scopeKey: string;
  capacity: string | null;
  revisionNumber: number;
  values: Prisma.JsonValue;
};

export interface CombinedReviewOptions {
  date?: string;
  now?: Date;
  includePreWorkoutCheckIn: boolean;
  includePostWorkoutFeedback: boolean;
}
const source = (kind: 'check_in' | 'feedback', recordId: string, version: string) =>
  ({ kind, recordId, version } as const);

function numeric(value: number | null, recordId: string, version: string) {
  return value === null || !Number.isFinite(value)
    ? undefined
    : { value, source: source('check_in', recordId, version) };
}
function validFeedbackFor(row: Feedback | undefined, session: Session, release: Release): row is Feedback {
  return Boolean(
    row && session.execution &&
    session.execution.originReleaseId === release.id &&
    session.execution.originWorkoutTemplateId === session.templateId &&
    row.executionId === session.execution.id &&
    row.originReleaseId === release.id
  );
}

/**
 * Read-only adapter: same assembly, released graph, contract, professor and grants
 * as the canonical Montagem Consolidada report. Never accepts client-supplied rules.
 */
export function createConsolidatedCombinedConflictService(
  client: PrismaClient = prisma,
  trustedRules: readonly ConflictRule[] = ACTIVE_COMBINED_CONFLICT_RULES_V1
) {
  return {
    async getWeeklyReview(
      context: ConsolidatedPrescriptionContext,
      expectedAssemblyVersion: number,
      options: CombinedReviewOptions
    ): Promise<ConsolidatedCombinedReview> {
      const date = options.date ?? todayInTimeZone(options.now ?? new Date(), DEFAULT_CONTRACT_TIME_ZONE);
      const week = resolveRoutineWeek(parseDateOnly(date));
      const weekInfo = {
        startDate: week.start.toISOString().slice(0, 10),
        endDate: week.days[6].toISOString().slice(0, 10),
      };
      const [aluno, professor] = await Promise.all([
        client.aluno.findFirst({ where: { id: context.alunoId, contractId: context.contractId }, select: { id: true } }),
        client.professor.findFirst({ where: { id: context.actorProfessorId, contractId: context.contractId }, select: { id: true } }),
      ]);
      if (!aluno || !professor) {
        throw new ConsolidatedPrescriptionDomainError('NOT_FOUND', 'Recurso não encontrado');
      }
      const assembly = await client.consolidatedPrescription.findFirst({
        where: { alunoId: context.alunoId, contractId: context.contractId },
        select: { id: true, currentVersion: true },
      });
      if (!assembly || assembly.currentVersion !== expectedAssemblyVersion) {
        throw new ConsolidatedPrescriptionDomainError('CONFLICT', 'A montagem foi alterada. Atualize a consulta antes de revisar conflitos.');
      }
      const version = await client.consolidatedPrescriptionVersion.findFirst({
        where: {
          assemblyId: assembly.id, contractId: context.contractId,
          alunoId: context.alunoId, version: expectedAssemblyVersion,
        },
        select: {
          capacityBlocks: {
            select: { capacity: true, capacityVersion: true, capacityPrescriptionVersionId: true },
          },
        },
      });
      if (!version) throw new ConsolidatedPrescriptionDomainError('CONFLICT', 'Versão da montagem indisponível');
      const planningCapacities = version.capacityBlocks.map((block) => ({
        capacity: block.capacity as ConflictCapacity,
        capacityPrescriptionVersionId: block.capacityPrescriptionVersionId,
        version: block.capacityVersion,
      }));

      // This immutable #320 release table is not present in Prisma's schema.
      // Bind contract, student, assembly and the actual WorkoutPlan lineage in SQL.
      const releases = await client.$queryRaw<Release[]>(Prisma.sql`
        SELECT rel."id", rel."assemblyId", rel."contractId", rel."alunoId",
               rel."workoutTemplateId", rel."releasedAssemblyVersion"
        FROM "ConsolidatedPrescriptionOperationalRelease" rel
        JOIN "WorkoutTemplate" template
          ON template."id" = rel."workoutTemplateId" AND template."released" = true
        JOIN "TrainingPlan" plan
          ON plan."id" = template."planId" AND plan."alunoId" = rel."alunoId"
        JOIN "Aluno" student
          ON student."id" = plan."alunoId" AND student."contractId" = rel."contractId"
        WHERE rel."contractId" = ${context.contractId}
          AND rel."alunoId" = ${context.alunoId}
          AND rel."assemblyId" = ${assembly.id}
          AND EXISTS (
            SELECT 1 FROM "WorkoutDay" day
            WHERE day."templateId" = rel."workoutTemplateId"
              AND day."workoutDate" >= ${week.start}
              AND day."workoutDate" < ${week.endExclusive}
          )
        ORDER BY rel."workoutTemplateId"
      `);
      if (releases.some((rel) => rel.alunoId !== context.alunoId ||
        rel.contractId !== context.contractId || rel.assemblyId !== assembly.id)) {
        throw new ConsolidatedPrescriptionDomainError('NOT_FOUND', 'Origem operacional fora do contrato');
      }
      const templateIds = releases.map((rel) => rel.workoutTemplateId);
      const sessions = templateIds.length
        ? await client.workoutDay.findMany({
            where: {
              templateId: { in: templateIds },
              workoutDate: { gte: week.start, lt: week.endExclusive },
              template: {
                released: true,
                plan: { alunoId: context.alunoId, aluno: { contractId: context.contractId } },
              },
            },
            select: sessionSelect,
            orderBy: [{ workoutDate: 'asc' }, { id: 'asc' }],
          })
        : [] as Session[];
      const sessionIds = sessions.map((session) => session.id);
      const [capacityBlocks, checkIns, feedbackRevisions] = await Promise.all([
        sessionIds.length
          ? client.$queryRaw<CapacitySnapshot[]>(Prisma.sql`
              SELECT block."workoutDayId", block."capacity",
                     block."capacityPrescriptionVersionId", block."contractVersion"
              FROM "WorkoutDayCapacityOperationalBlock" block
              JOIN "CapacityPrescriptionVersion" cpv
                ON cpv."id" = block."capacityPrescriptionVersionId"
              WHERE block."workoutDayId" IN (${Prisma.join(sessionIds)})
                AND cpv."contractId" = ${context.contractId}
                AND cpv."alunoId" = ${context.alunoId}
              ORDER BY block."workoutDayId", block."capacity"
            `)
          : Promise.resolve([] as CapacitySnapshot[]),
        options.includePreWorkoutCheckIn && sessionIds.length
          ? client.preWorkoutCheckIn.findMany({
              where: {
                workoutDayId: { in: sessionIds }, alunoId: context.alunoId, contractId: context.contractId,
              },
              select: {
                id: true, workoutDayId: true, alunoId: true, contractId: true,
                psr: true, fatigue: true, sleepQuality: true,
                painLevel: true, updatedAt: true,
              },
            })
          : Promise.resolve([] as CheckIn[]),
        options.includePostWorkoutFeedback && sessionIds.length
          ? client.postWorkoutFeedbackRevision.findMany({
              where: {
                workoutDayId: { in: sessionIds }, alunoId: context.alunoId, contractId: context.contractId,
              },
              orderBy: [{ workoutDayId: 'asc' }, { scopeKey: 'asc' }, { revisionNumber: 'desc' }],
              select: {
                id: true, workoutDayId: true, alunoId: true, contractId: true,
                executionId: true, originReleaseId: true, scopeKey: true,
                capacity: true, revisionNumber: true, values: true,
              },
            })
          : Promise.resolve([] as Feedback[]),
      ]);
      for (const row of [...checkIns, ...feedbackRevisions]) {
        if (row.alunoId !== context.alunoId || row.contractId !== context.contractId ||
            !sessionIds.includes(row.workoutDayId)) {
          throw new ConsolidatedPrescriptionDomainError('NOT_FOUND', 'Evidência clínica fora do contrato');
        }
      }
      const releaseByTemplate = new Map(releases.map((rel) => [rel.workoutTemplateId, rel]));
      const blocksBySession = new Map<string, CapacitySnapshot[]>();
      for (const block of capacityBlocks) {
        if (!sessionIds.includes(block.workoutDayId) || !['flexibility', 'balance'].includes(block.capacity)) {
          throw new ConsolidatedPrescriptionDomainError('NOT_FOUND', 'Bloco operacional sem origem válida');
        }
        blocksBySession.set(block.workoutDayId, [...(blocksBySession.get(block.workoutDayId) ?? []), block]);
      }
      const checkInBySession = new Map(checkIns.map((row) => [row.workoutDayId, row]));
      const feedbackByScope = new Map<string, Feedback>();
      for (const row of feedbackRevisions) {
        const key = row.workoutDayId + ':' + row.scopeKey;
        if (!feedbackByScope.has(key)) feedbackByScope.set(key, row);
      }
      const observations: ConflictObservation[] = [];
      const sourceSnapshots: ConsolidatedCombinedReview['sourceSnapshots'] = [];
      const reasons = new Set<string>();
      if (!releases.length || !sessions.length) reasons.add('no_canonical_release_for_week');
      if (!options.includePreWorkoutCheckIn) reasons.add('check_in_access_not_granted');
      if (!options.includePostWorkoutFeedback) reasons.add('feedback_access_not_granted');
      if (!trustedRules.some((rule) => rule.status === 'active')) reasons.add('rules_pending_professional_homologation');

      for (const session of sessions) {
        const release = releaseByTemplate.get(session.templateId);
        if (!release) { reasons.add('release_provenance_missing'); continue; }
        const validExecution = session.execution &&
          session.execution.originReleaseId === release.id &&
          session.execution.originWorkoutTemplateId === session.templateId
            ? session.execution : null;
        if (session.execution && !validExecution) reasons.add('execution_origin_mismatch');
        const capacities = new Map<ConflictCapacity, CapacitySnapshot | null>();
        if (session.exercises.length || session.resistanceTimeMin !== null) capacities.set('resisted', null);
        if (session.cyclicStages.length || session.cyclicTimeMin !== null) capacities.set('cyclic', null);
        for (const block of blocksBySession.get(session.id) ?? []) capacities.set(block.capacity, block);
        if (!capacities.size) reasons.add('session_capacity_unavailable');
        const checkIn = checkInBySession.get(session.id);
        const exactStart = validExecution?.startedAt &&
          validExecution.startedAt >= week.start && validExecution.startedAt < week.endExclusive
            ? validExecution.startedAt : null;
        const scheduledAt = (exactStart ?? session.workoutDate).toISOString();
        const timePrecision = exactStart ? 'instant' : 'date';
        if (!exactStart) reasons.add('session_time_precision_date_only');

        for (const [capacity, block] of capacities) {
          const capacityFeedback = feedbackByScope.get(session.id + ':capacity:' + capacity);
          const generalFeedback = feedbackByScope.get(session.id + ':session');
          const selected = validFeedbackFor(capacityFeedback, session, release) ? capacityFeedback :
            validFeedbackFor(generalFeedback, session, release) ? generalFeedback : undefined;
          if ((capacityFeedback || generalFeedback) && !selected) reasons.add('feedback_origin_mismatch');

          const numericReadings: NonNullable<ConflictObservation['numeric']> = {};
          if (checkIn) {
            const revision = checkIn.updatedAt.toISOString();
            const readings = {
              painLevel: numeric(checkIn.painLevel, checkIn.id, revision),
              psr: numeric(checkIn.psr, checkIn.id, revision),
              fatigue: numeric(checkIn.fatigue, checkIn.id, revision),
              sleepQuality: numeric(checkIn.sleepQuality, checkIn.id, revision),
            };
            for (const [key, value] of Object.entries(readings)) {
              if (value) numericReadings[key as keyof typeof readings] = value;
            }
          }
          const flags: NonNullable<ConflictObservation['flags']> = {};
          const feedback = selected?.values && typeof selected.values === 'object' &&
            !Array.isArray(selected.values)
              ? selected.values as Record<string, unknown> : null;
          if (selected && typeof feedback?.dizziness === 'boolean') {
            flags.dizziness = {
              value: feedback.dizziness,
              source: source('feedback', selected.id, String(selected.revisionNumber)),
            };
          }
          observations.push({
            alunoId: context.alunoId, contractId: context.contractId,
            sessionId: session.id, capacity, scheduledAt, timePrecision,
            numeric: numericReadings, flags,
          });
          sourceSnapshots.push({
            sessionId: session.id,
            capacity,
            release: { id: release.id, version: String(release.releasedAssemblyVersion) },
            capacityVersion: block
              ? { id: block.capacityPrescriptionVersionId, version: String(block.contractVersion) } : null,
            execution: validExecution ? { id: validExecution.id, version: String(validExecution.version) } : null,
            checkIn: checkIn ? { id: checkIn.id, version: checkIn.updatedAt.toISOString() } : null,
            feedback: selected ? { id: selected.id, version: String(selected.revisionNumber) } : null,
          });
        }
      }
      const coverage = reasons.size === 0 ? 'complete' as const : 'partial' as const;
      const evaluated = evaluateCombinedTrainingConflicts({
        alunoId: context.alunoId, contractId: context.contractId,
        windowStart: week.start.toISOString(), windowEnd: week.endExclusive.toISOString(),
        coverage, observations, rules: trustedRules,
      });
      return {
        protocolVersion: evaluated.protocolVersion,
        status: evaluated.state,
        riskConclusion: 'not_cleared',
        week: weekInfo,
        coverage,
        planningCapacities,
        sourceCounts: {
          releasedSessions: sessions.length,
          capacityObservations: observations.length,
          executions: sourceSnapshots.filter((snapshot) => snapshot.execution !== null).length,
          checkIns: sourceSnapshots.filter((snapshot) => snapshot.checkIn !== null).length,
          feedbackRevisions: sourceSnapshots.filter((snapshot) => snapshot.feedback !== null).length,
        },
        sourceSnapshots,
        evaluations: evaluated.evaluations,
        unavailableReasons: [...reasons].sort(),
        changesWorkoutAutomatically: false,
      };
    },
  };
}
export const consolidatedCombinedConflictService = createConsolidatedCombinedConflictService();

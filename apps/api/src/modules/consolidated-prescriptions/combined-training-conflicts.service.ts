import { Prisma, PrismaClient } from '@prisma/client';
import {
  ACTIVE_COMBINED_CONFLICT_RULES_V1, evaluateCombinedTrainingConflicts,
  type ConflictCapacity, type ConflictEvidenceSource, type ConflictObservation,
} from '../workout/combined-training-conflicts.domain.js';

const prisma = new PrismaClient();
const capacities = new Set<ConflictCapacity>(['cyclic', 'resisted', 'flexibility', 'balance']);
type Release = {
  id: string; workoutTemplateId: string; trainingPlanId: string;
  releasedAssemblyVersionId: string; releasedAssemblyVersion: number;
};
type OperationalBlock = {
  id: string; workoutDayId: string; capacity: string; capacityPrescriptionVersionId: string;
};
type CapacitySnapshot = {
  assemblyVersionId: string; capacity: string;
  capacityPrescriptionVersionId: string; capacityVersion: number;
};
type ReleaseOrigin = { kind: 'consolidated_release'; recordId: string; version: string; assemblyVersionId: string };
type CapacityOrigin = { kind: 'prescription'; recordId: string; version: string };
type OperationalOrigin = {
  kind: 'workout_day' | 'workout_cyclic_stage' | 'workout_exercise' |
    'workout_resistance_group' | 'workout_capacity_block';
  recordId: string;
};
type CategoricalSignals = {
  fatigueLevel?: { value: 'low' | 'medium' | 'high'; source: ConflictEvidenceSource };
  sleepQuality?: { value: 'good' | 'medium' | 'poor'; source: ConflictEvidenceSource };
};
type FeedbackSignals = {
  numeric: NonNullable<ConflictObservation['numeric']>;
  flags: NonNullable<ConflictObservation['flags']>;
  categorical: CategoricalSignals;
};
type CanonicalObservation = ConflictObservation & {
  provenance: { release: ReleaseOrigin; capacityPrescription: CapacityOrigin; operational: OperationalOrigin };
  categorical: CategoricalSignals;
};
type SessionSignal = FeedbackSignals & {
  alunoId: string; contractId: string; sessionId: string; scheduledAt: string;
  scopeKey: 'session'; source: ConflictEvidenceSource; release: ReleaseOrigin;
};
export class CombinedConflictSourceError extends Error {}

function utc(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value) ||
      date.toISOString() !== value) throw new CombinedConflictSourceError('Período UTC inválido.');
  return date;
}
function numeric(
  value: unknown, kind: 'check_in' | 'feedback', id: string, version: string,
  metric: 'painLevel' | 'psr' | 'fatigue' | 'sleepQuality'
) {
  const max = kind === 'check_in' && metric === 'painLevel' ? Infinity : 10;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
    ? { value, source: { kind, recordId: id, version } } : undefined;
}
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function releaseOrigin(release: Release): ReleaseOrigin {
  return {
    kind: 'consolidated_release', recordId: release.id,
    version: String(release.releasedAssemblyVersion), assemblyVersionId: release.releasedAssemblyVersionId,
  };
}
function addNumeric(
  target: NonNullable<ConflictObservation['numeric']>,
  metric: 'painLevel' | 'psr' | 'fatigue' | 'sleepQuality',
  value: unknown, kind: 'check_in' | 'feedback', id: string, version: string
) {
  const measured = numeric(value, kind, id, version, metric);
  if (measured) target[metric] = measured;
}

/** Extract versioned structured feedback without assigning it to another capacity. */
function addFeedbackSignals(target: FeedbackSignals, values: Record<string, unknown>, id: string, version: string) {
  const source = { kind: 'feedback' as const, recordId: id, version };
  addNumeric(target.numeric, 'painLevel', values.painAfter, 'feedback', id, version);
  addNumeric(target.numeric, 'psr', values.psr, 'feedback', id, version);
  if (typeof values.dizziness === 'boolean')
    target.flags.dizziness = { value: values.dizziness, source };
  if (values.fatigueLevel === 'low' || values.fatigueLevel === 'medium' || values.fatigueLevel === 'high')
    target.categorical.fatigueLevel = { value: values.fatigueLevel, source };
  if (values.sleepQuality === 'good' || values.sleepQuality === 'medium' || values.sleepQuality === 'poor')
    target.categorical.sleepQuality = { value: values.sleepQuality, source };
}

/**
 * Read-only source adapter. Clinical activation remains separately gated by #534.
 * Cyclic/resisted legacy fields still identify structured activity. New cyclic releases
 * also persist a day-specific versioned source even when only template distance is mapped.
 * The existing flex/balance table keeps its restrictive PostgreSQL CHECK.
 */
export function createCombinedConflictSourceService(client: PrismaClient = prisma) {
  return {
    async getReport(query: { alunoId: string; contractId: string; start: string; end: string }) {
      if (!query.alunoId || !query.contractId) throw new CombinedConflictSourceError('Aluno e contrato obrigatórios.');
      const start = utc(query.start), end = utc(query.end);
      if (end <= start || end.getTime() - start.getTime() > 31 * 86400000)
        throw new CombinedConflictSourceError('Período inválido ou maior que 31 dias.');
      const aluno = await client.aluno.findFirst({
        where: { id: query.alunoId, contractId: query.contractId }, select: { id: true },
      });
      if (!aluno) return null;
      const days = await client.workoutDay.findMany({
        where: { workoutDate: { gte: start, lt: end },
          template: { released: true, plan: { alunoId: query.alunoId, aluno: { contractId: query.contractId } } } },
        orderBy: [{ workoutDate: 'asc' }, { id: 'asc' }], take: 201,
        select: {
          id: true, templateId: true, workoutDate: true,
          method: true, vo2maxPct: true, stimulusDurationMin: true, cyclicTimeMin: true,
          resistanceTimeMin: true,
          cyclicStages: { select: { id: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }], take: 1 },
          exercises: {
            select: { id: true }, orderBy: [{ section: 'asc' }, { exerciseOrder: 'asc' }, { id: 'asc' }], take: 1,
          },
          resistanceGroups: { select: { id: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }], take: 1 },
          execution: { select: { id: true, originReleaseId: true } },
        },
      });
      if (days.length > 200) throw new CombinedConflictSourceError('Sessões em excesso; reduza o intervalo.');
      const templateIds = [...new Set(days.map((day) => day.templateId))];
      const releases = templateIds.length ? await client.$queryRaw<Release[]>(Prisma.sql`
        SELECT "id", "workoutTemplateId", "trainingPlanId",
               "releasedAssemblyVersionId", "releasedAssemblyVersion"
        FROM "ConsolidatedPrescriptionOperationalRelease"
        WHERE "alunoId" = ${query.alunoId} AND "contractId" = ${query.contractId}
          AND "workoutTemplateId" IN (${Prisma.join(templateIds)})
      `) : [];
      const byTemplate = new Map(releases.map((release) => [release.workoutTemplateId, release]));
      const released = days.filter((day) => byTemplate.has(day.templateId));
      const ids = released.map((day) => day.id);
      const assemblyVersions = [...new Set(releases.map((release) => release.releasedAssemblyVersionId))];
      const [blocks, snapshots, checks, feedbacks] = await Promise.all([
        ids.length ? client.$queryRaw<OperationalBlock[]>(Prisma.sql`
          SELECT "id", "workoutDayId", "capacity", "capacityPrescriptionVersionId"
          FROM "WorkoutDayCapacityOperationalBlock"
          WHERE "workoutDayId" IN (${Prisma.join(ids)})
          UNION ALL
          SELECT "id", "workoutDayId", "capacity", "capacityPrescriptionVersionId"
          FROM "WorkoutDayCyclicOperationalBlock"
          WHERE "workoutDayId" IN (${Prisma.join(ids)})
        `) : Promise.resolve([] as OperationalBlock[]),
        assemblyVersions.length ? client.consolidatedPrescriptionCapacityBlock.findMany({
          where: {
            assemblyVersionId: { in: assemblyVersions },
            alunoId: query.alunoId, contractId: query.contractId,
          },
          select: {
            assemblyVersionId: true, capacity: true,
            capacityPrescriptionVersionId: true, capacityVersion: true,
          },
        }) : Promise.resolve([] as CapacitySnapshot[]),
        ids.length ? client.preWorkoutCheckIn.findMany({
          where: { workoutDayId: { in: ids }, alunoId: query.alunoId, contractId: query.contractId },
          select: {
            id: true, workoutDayId: true, updatedAt: true,
            painLevel: true, psr: true, fatigue: true, sleepQuality: true,
          },
        }) : Promise.resolve([]),
        ids.length ? client.postWorkoutFeedbackRevision.findMany({
          where: { workoutDayId: { in: ids }, alunoId: query.alunoId, contractId: query.contractId },
          orderBy: [{ workoutDayId: 'asc' }, { scopeKey: 'asc' }, { revisionNumber: 'desc' }],
          select: {
            id: true, workoutDayId: true, scopeKey: true, capacity: true,
            revisionNumber: true, values: true, executionId: true, originReleaseId: true,
            originWorkoutTemplateId: true, originTrainingPlanId: true,
          },
        }) : Promise.resolve([]),
      ]);
      const byDay = new Map<string, Map<ConflictCapacity, OperationalBlock>>();
      for (const block of blocks) {
        if (block.capacity !== 'flexibility' && block.capacity !== 'balance' && block.capacity !== 'cyclic')
          throw new Error('Bloco operacional de capacidade fora do contrato canônico.');
        const set = byDay.get(block.workoutDayId) ?? new Map<ConflictCapacity, OperationalBlock>();
        set.set(block.capacity, block); byDay.set(block.workoutDayId, set);
      }
      const byAssembly = new Map<string, Map<ConflictCapacity, CapacitySnapshot>>();
      for (const snapshot of snapshots) {
        if (!capacities.has(snapshot.capacity as ConflictCapacity))
          throw new Error('Capacidade da versão consolidada não reconhecida.');
        const set = byAssembly.get(snapshot.assemblyVersionId) ?? new Map<ConflictCapacity, CapacitySnapshot>();
        set.set(snapshot.capacity as ConflictCapacity, snapshot);
        byAssembly.set(snapshot.assemblyVersionId, set);
      }
      const checkByDay = new Map(checks.map((check) => [check.workoutDayId, check]));
      const feedbackByScope = new Map<string, (typeof feedbacks)[number]>();
      for (const fb of feedbacks) {
        const key = fb.workoutDayId + ':' + fb.scopeKey;
        if (!feedbackByScope.has(key)) feedbackByScope.set(key, fb);
      }
      const observations: CanonicalObservation[] = [];
      const sessionSignals: SessionSignal[] = [];
      for (const day of released) {
        const release = byTemplate.get(day.templateId)!;
        const sourceRelease = releaseOrigin(release);
        const currentFeedback = (scopeKey: string) => {
          const fb = feedbackByScope.get(day.id + ':' + scopeKey);
          return fb && day.execution?.originReleaseId === release.id &&
            fb.executionId === day.execution.id && fb.originReleaseId === release.id &&
            fb.originWorkoutTemplateId === day.templateId &&
            fb.originTrainingPlanId === release.trainingPlanId ? fb : undefined;
        };
        const currentCheck = checkByDay.get(day.id);
        if (currentCheck) {
          const source = {
            kind: 'check_in' as const, recordId: currentCheck.id, version: currentCheck.updatedAt.toISOString(),
          };
          const numericSignals: SessionSignal['numeric'] = {};
          addNumeric(numericSignals, 'painLevel', currentCheck.painLevel, 'check_in', source.recordId, source.version);
          addNumeric(numericSignals, 'psr', currentCheck.psr, 'check_in', source.recordId, source.version);
          addNumeric(numericSignals, 'fatigue', currentCheck.fatigue, 'check_in', source.recordId, source.version);
          addNumeric(numericSignals, 'sleepQuality', currentCheck.sleepQuality, 'check_in', source.recordId, source.version);
          sessionSignals.push({
            alunoId: query.alunoId, contractId: query.contractId, sessionId: day.id,
            scheduledAt: day.workoutDate.toISOString(), scopeKey: 'session',
            release: sourceRelease, source, numeric: numericSignals, flags: {}, categorical: {},
          });
        }
        const sessionFeedback = currentFeedback('session');
        if (sessionFeedback && sessionFeedback.capacity === null) {
          const source = {
            kind: 'feedback' as const, recordId: sessionFeedback.id,
            version: String(sessionFeedback.revisionNumber),
          };
          const signals: FeedbackSignals = { numeric: {}, flags: {}, categorical: {} };
          addFeedbackSignals(signals, object(sessionFeedback.values), source.recordId, source.version);
          sessionSignals.push({
            alunoId: query.alunoId, contractId: query.contractId, sessionId: day.id,
            scheduledAt: day.workoutDate.toISOString(), scopeKey: 'session',
            release: sourceRelease, source, ...signals,
          });
        }
        const operational = new Map<ConflictCapacity, OperationalOrigin>();
        if (day.method !== null || day.vo2maxPct !== null || day.stimulusDurationMin !== null ||
            day.cyclicTimeMin !== null || day.cyclicStages.length > 0) {
          operational.set('cyclic', day.cyclicStages.length ? {
            kind: 'workout_cyclic_stage', recordId: day.cyclicStages[0].id,
          } : { kind: 'workout_day', recordId: day.id });
        }
        if (day.exercises.length > 0 || day.resistanceGroups.length > 0 || day.resistanceTimeMin !== null) {
          operational.set('resisted', day.exercises.length ? {
            kind: 'workout_exercise', recordId: day.exercises[0].id,
          } : day.resistanceGroups.length ? {
            kind: 'workout_resistance_group', recordId: day.resistanceGroups[0].id,
          } : { kind: 'workout_day', recordId: day.id });
        }
        for (const block of byDay.get(day.id)?.values() ?? []) {
          operational.set(block.capacity as ConflictCapacity, {
            kind: 'workout_capacity_block', recordId: block.id,
          });
        }
        for (const capacity of [...operational.keys()].sort()) {
          const snapshot = byAssembly.get(release.releasedAssemblyVersionId)?.get(capacity);
          if (!snapshot) throw new Error('Capacidade operacional sem versão consolidada autorizada.');
          const block = byDay.get(day.id)?.get(capacity);
          if (block && block.capacityPrescriptionVersionId !== snapshot.capacityPrescriptionVersionId)
            throw new Error('Versão do bloco operacional diverge da liberação consolidada.');
          const row: CanonicalObservation = {
            alunoId: query.alunoId, contractId: query.contractId,
            sessionId: day.id, capacity, scheduledAt: day.workoutDate.toISOString(),
            numeric: {}, flags: {}, categorical: {},
            provenance: {
              release: sourceRelease,
              capacityPrescription: {
                kind: 'prescription', recordId: snapshot.capacityPrescriptionVersionId,
                version: String(snapshot.capacityVersion),
              },
              operational: operational.get(capacity)!,
            },
          };
          if (capacity === 'cyclic' && currentCheck) {
            const version = currentCheck.updatedAt.toISOString();
            addNumeric(row.numeric!, 'painLevel', currentCheck.painLevel, 'check_in', currentCheck.id, version);
            addNumeric(row.numeric!, 'psr', currentCheck.psr, 'check_in', currentCheck.id, version);
            addNumeric(row.numeric!, 'fatigue', currentCheck.fatigue, 'check_in', currentCheck.id, version);
            addNumeric(row.numeric!, 'sleepQuality', currentCheck.sleepQuality, 'check_in', currentCheck.id, version);
          }
          const fb = currentFeedback('capacity:' + capacity);
          if (fb && fb.capacity === capacity) {
            addFeedbackSignals(
              { numeric: row.numeric!, flags: row.flags!, categorical: row.categorical },
              object(fb.values), fb.id, String(fb.revisionNumber)
            );
          }
          observations.push(row);
        }
      }
      const result = evaluateCombinedTrainingConflicts({
        alunoId: query.alunoId, contractId: query.contractId,
        windowStart: query.start, windowEnd: query.end,
        coverage: 'partial', observations, rules: ACTIVE_COMBINED_CONFLICT_RULES_V1,
      });
      return {
        ...result, period: { start: query.start, end: query.end },
        coverage: 'partial' as const,
        coverageReason: 'Sem horário real comprovado e sem critérios combinados homologados.',
        releasedSessionCount: released.length, observationCount: observations.length,
        sessionSignalCount: sessionSignals.length, sessionSignals, observations,
      };
    },
  };
}
export const combinedConflictSourceService = createCombinedConflictSourceService();

import { Prisma, PrismaClient } from '@prisma/client';
import {
  ACTIVE_COMBINED_CONFLICT_RULES_V1, evaluateCombinedTrainingConflicts,
  type ConflictCapacity, type ConflictObservation,
} from '../workout/combined-training-conflicts.domain.js';

const prisma = new PrismaClient();
const capacities = new Set<ConflictCapacity>(['cyclic','resisted','flexibility','balance']);
type Release = { id: string; workoutTemplateId: string; releasedAssemblyVersion: number };
type Capacity = { workoutDayId: string; capacity: string };
export class CombinedConflictSourceError extends Error {}

function utc(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value) ||
      date.toISOString() !== value) throw new CombinedConflictSourceError('Período UTC inválido.');
  return date;
}
function numeric(value: unknown, kind: 'check_in' | 'feedback', id: string, version: string) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10
    ? { value, source: { kind, recordId: id, version } } : undefined;
}
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
/** Scoped, read-only adapter: source version and permission belong to canonical records. */
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
        select: { id: true, templateId: true, workoutDate: true,
          execution: { select: { originReleaseId: true } } },
      });
      if (days.length > 200) throw new CombinedConflictSourceError('Sessões em excesso; reduza o intervalo.');
      const templateIds = [...new Set(days.map((day) => day.templateId))];
      const releases = templateIds.length ? await client.$queryRaw<Release[]>(Prisma.sql`
        SELECT "id", "workoutTemplateId", "releasedAssemblyVersion"
        FROM "ConsolidatedPrescriptionOperationalRelease"
        WHERE "alunoId" = ${query.alunoId} AND "contractId" = ${query.contractId}
          AND "workoutTemplateId" IN (${Prisma.join(templateIds)})
      `) : [];
      const byTemplate = new Map(releases.map((r) => [r.workoutTemplateId, r]));
      const released = days.filter((day) => byTemplate.has(day.templateId));
      const ids = released.map((day) => day.id);
      const [blocks, checks, feedbacks] = await Promise.all([
        ids.length ? client.$queryRaw<Capacity[]>(Prisma.sql`
          SELECT "workoutDayId", "capacity" FROM "WorkoutDayCapacityOperationalBlock"
          WHERE "workoutDayId" IN (${Prisma.join(ids)})
        `) : Promise.resolve([] as Capacity[]),
        ids.length ? client.preWorkoutCheckIn.findMany({
          where: { workoutDayId: { in: ids }, alunoId: query.alunoId, contractId: query.contractId },
          select: { id: true, workoutDayId: true, updatedAt: true, painLevel: true, psr: true, fatigue: true, sleepQuality: true },
        }) : Promise.resolve([]),
        ids.length ? client.postWorkoutFeedbackRevision.findMany({
          where: { workoutDayId: { in: ids }, alunoId: query.alunoId, contractId: query.contractId },
          orderBy: [{ workoutDayId: 'asc' }, { scopeKey: 'asc' }, { revisionNumber: 'desc' }],
          select: { id: true, workoutDayId: true, scopeKey: true, capacity: true,
            revisionNumber: true, values: true, originReleaseId: true },
        }) : Promise.resolve([]),
      ]);
      const byDay = new Map<string, Set<ConflictCapacity>>();
      for (const block of blocks) {
        if (!capacities.has(block.capacity as ConflictCapacity)) throw new CombinedConflictSourceError('Capacidade desconhecida.');
        const set = byDay.get(block.workoutDayId) ?? new Set<ConflictCapacity>();
        set.add(block.capacity as ConflictCapacity); byDay.set(block.workoutDayId, set);
      }
      const checkByDay = new Map(checks.map((c) => [c.workoutDayId, c]));
      const feedbackByScope = new Map<string, (typeof feedbacks)[number]>();
      for (const fb of feedbacks) {
        const key = fb.workoutDayId + ':' + fb.scopeKey;
        if (!feedbackByScope.has(key)) feedbackByScope.set(key, fb);
      }
      const observations: ConflictObservation[] = [];
      for (const day of released) {
        const release = byTemplate.get(day.templateId)!;
        for (const capacity of [...(byDay.get(day.id) ?? [])].sort()) {
          const row: ConflictObservation = {
            alunoId: query.alunoId, contractId: query.contractId,
            sessionId: day.id, capacity, scheduledAt: day.workoutDate.toISOString(),
            numeric: {}, flags: {},
          };
          const check = checkByDay.get(day.id);
          if (capacity === 'cyclic' && check) {
            const source = (value: unknown) => numeric(value, 'check_in', check.id, check.updatedAt.toISOString());
            const pain = source(check.painLevel), psr = source(check.psr);
            const fatigue = source(check.fatigue), sleep = source(check.sleepQuality);
            if (pain) row.numeric!.painLevel = pain;
            if (psr) row.numeric!.psr = psr;
            if (fatigue) row.numeric!.fatigue = fatigue;
            if (sleep) row.numeric!.sleepQuality = sleep;
          }
          const fb = day.execution?.originReleaseId === release.id
            ? feedbackByScope.get(day.id + ':capacity:' + capacity) : undefined;
          if (fb && fb.capacity === capacity && fb.originReleaseId === release.id) {
            const value = object(fb.values), version = String(fb.revisionNumber);
            if (capacity === 'cyclic') {
              const pain = numeric(value.painAfter, 'feedback', fb.id, version);
              const psr = numeric(value.psr, 'feedback', fb.id, version);
              if (pain) row.numeric!.painLevel = pain;
              if (psr) row.numeric!.psr = psr;
            }
            if (typeof value.dizziness === 'boolean') row.flags!.dizziness = {
              value: value.dizziness, source: { kind: 'feedback', recordId: fb.id, version },
            };
          }
          observations.push(row);
        }
      }
      const result = evaluateCombinedTrainingConflicts({
        alunoId: query.alunoId, contractId: query.contractId,
        windowStart: query.start, windowEnd: query.end,
        coverage: 'partial', observations, rules: ACTIVE_COMBINED_CONFLICT_RULES_V1,
      });
      return { ...result, period: { start: query.start, end: query.end },
        coverage: 'partial' as const,
        coverageReason: 'Sem horário real comprovado e sem critérios combinados homologados.',
        releasedSessionCount: released.length, observationCount: observations.length, observations };
    },
  };
}
export const combinedConflictSourceService = createCombinedConflictSourceService();

import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient, type WorkoutSubstitution } from '@prisma/client';
import type {
  TrainingSubstitutionAlternative,
  TrainingSubstitutionAlternativePage,
  TrainingSubstitutionRecord,
  TrainingSubstitutionSnapshot,
  TrainingSubstitutionContext,
  TrainingSubstitutionKind,
} from '@corrida/types';
import { prismaRuntimeClient } from '../../common/prisma-runtime-client.js';
import { canProfessorAccessBlock } from '../access-control/access-control.service.js';
import { approvedOperationalExerciseWhere } from '../library/library-curation.domain.js';
import { assertApprovedWorkoutExerciseIds } from './workout-planning.helpers.js';

type Db = Prisma.TransactionClient;
export type SubstitutionActor =
  | { kind: 'student'; userId: string; alunoId: string; contractId: string }
  | { kind: 'professor'; userId: string; professorId: string; contractId: string };

export class TrainingSubstitutionError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409, readonly code: string, message: string) {
    super(message);
    this.name = 'TrainingSubstitutionError';
  }
}

const invalid = (message: string): never => { throw new TrainingSubstitutionError(400, 'INVALID_SUBSTITUTION', message); };
const notFound = (): never => { throw new TrainingSubstitutionError(404, 'SUBSTITUTION_NOT_FOUND', 'Treino ou substituição não encontrado.'); };
const conflict = (message: string): never => { throw new TrainingSubstitutionError(409, 'SUBSTITUTION_CONFLICT', message); };
const permissionDenied = (): never => { throw new TrainingSubstitutionError(403, 'SUBSTITUTION_FORBIDDEN', 'Sem permissão para substituir este treino.'); };

function normalizedText(value: string, max: number, field: string): string {
  if (typeof value !== 'string' || value.trim().length < 3 || value.trim().length > max) {
    return invalid('Informe ' + field + ' entre 3 e ' + max + ' caracteres.');
  }
  return value.trim();
}

function fromJson(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string').slice(0, 30) : [];
}
type Session = Awaited<ReturnType<typeof loadSession>>;
type Release = { id: string; releasedAssemblyVersion: number };
type AlternativeRelease = { workoutTemplateId: string; releasedAssemblyVersion: number };
const ALTERNATIVE_PAGE_SIZE = 25;
type LinkedExercise = NonNullable<Awaited<ReturnType<typeof readPlannedExercise>>>;

async function lookupRelease(tx: Db, templateId: string, alunoId: string, contractId: string): Promise<Release | null> {
  const releases = await tx.$queryRaw<Release[]>(Prisma.sql`
    SELECT "id", "releasedAssemblyVersion"
    FROM "ConsolidatedPrescriptionOperationalRelease"
    WHERE "workoutTemplateId" = ${templateId}
      AND "alunoId" = ${alunoId}
      AND "contractId" = ${contractId}
    ORDER BY "releasedAt" DESC, "id" DESC LIMIT 1
  `);
  return releases[0] ?? null;
}

async function loadSession(tx: Db, sessionId: string, actor: SubstitutionActor) {
  const day = await tx.workoutDay.findFirst({
    where: {
      id: sessionId,
      template: { released: true, plan: { aluno: { contractId: actor.contractId } } },
    },
    select: {
      id: true, workoutDate: true,
      template: {
        select: {
          id: true, releasedAt: true, updatedAt: true, studentGoal: true, coachGoal: true,
          plan: {
            select: {
              id: true, name: true, alunoId: true, professorId: true,
              aluno: {
                select: {
                  id: true, contractId: true, professorId: true, status: true, userId: true,
                  user: { select: { isActive: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!day) return notFound();
  const aluno = day.template.plan.aluno;
  if (actor.kind === 'student') {
    if (actor.alunoId !== aluno.id || aluno.userId !== actor.userId
      || aluno.status !== 'ACTIVE_STUDENT' || !aluno.user?.isActive) return notFound();
  } else {
    const professor = await tx.professor.findFirst({
      where: { id: actor.professorId, userId: actor.userId, contractId: actor.contractId },
      select: {
        role: true, currentStatus: true, dismissalDate: true,
        user: { select: { isActive: true } },
        collaboratorFunction: { select: { id: true, code: true } },
      },
    });
    if (!professor || !professor.user.isActive
      || ['inactive', 'inativo', 'dismissed', 'desligado', 'terminated', 'encerrado']
        .includes(professor.currentStatus?.trim().toLowerCase() ?? '')
      || (professor.dismissalDate && professor.dismissalDate.getTime() <= Date.now())) return notFound();
    if (!await canProfessorAccessBlock(professor, 'students.details.trainingPlans', tx)) return permissionDenied();
    if (professor.role !== 'master') {
      // Match the student-domain boundary: own students and directly managed
      // collaborators, not merely stale plan authorship.
      const assigned = await tx.aluno.findFirst({
        where: {
          id: aluno.id, contractId: actor.contractId,
          OR: [
            { professorId: actor.professorId },
            { professor: { responsibleManagerId: actor.professorId } },
          ],
        },
        select: { id: true },
      });
      if (!assigned) return notFound();
    }
  }
  const release = await lookupRelease(tx, day.template.id, aluno.id, actor.contractId);
  if (!release) return notFound();
  return { day, alunoId: aluno.id, release };
}

async function readPlannedExercise(tx: Db, dayId: string, plannedUnitId: string) {
  return tx.workoutExercise.findFirst({
    where: { id: plannedUnitId, workoutDayId: dayId },
    select: {
      id: true, exerciseId: true,
      exercise: {
        select: {
          id: true, name: true, version: true, capacity: true,
          movementPattern: true, equipment: true, difficulty: true, restrictions: true,
        },
      },
      releasedCatalog: { select: { catalog: true } },
    },
  });
}

function exerciseSnapshot(item: LinkedExercise): TrainingSubstitutionSnapshot {
  // Snapshot da liberacao prevalece sobre a versao atual da biblioteca.
  const frozen = fromJson(item.releasedCatalog?.catalog);
  return {
    unitId: item.id,
    id: item.exerciseId,
    name: textOf(frozen.name) ?? item.exercise.name,
    // Old release snapshots did not record catalog.version. A later live revision
    // must not be passed off as the release revision.
    version: typeof frozen.version === 'number' && Number.isInteger(frozen.version)
      ? 'exercicio:' + frozen.version : 'historico:versao_indisponivel',
    capacity: textOf(frozen.capacity),
    movementPattern: textOf(frozen.movementPattern),
    equipment: stringArray(frozen.equipment),
    difficulty: textOf(frozen.difficulty),
    restrictions: stringArray(frozen.restrictions),
  };
}

function catalogSnapshot(item: {
  id: string; name: string; version: number; capacity: string | null;
  movementPattern: string | null; equipment: string[]; difficulty: string | null; restrictions: string[];
}): TrainingSubstitutionSnapshot {
  return {
    unitId: item.id, id: item.id, name: item.name, version: 'exercicio:' + item.version,
    capacity: item.capacity, movementPattern: item.movementPattern, equipment: item.equipment,
    difficulty: item.difficulty, restrictions: item.restrictions,
  };
}

function sessionSnapshot(session: Session, id?: string): TrainingSubstitutionSnapshot {
  return {
    unitId: id ?? session.day.id,
    id: id ?? session.day.id,
    name: 'Sessão de ' + session.day.workoutDate.toISOString().slice(0, 10),
    version: 'liberacao:' + session.release.releasedAssemblyVersion,
    capacity: null, movementPattern: null, equipment: [], difficulty: null, restrictions: [],
  };
}

function safeSnapshot(value: Prisma.JsonValue, audience: 'student' | 'professor'): TrainingSubstitutionSnapshot {
  const row = fromJson(value);
  const snapshot: TrainingSubstitutionSnapshot = {
    unitId: String(row.unitId ?? ''), id: String(row.id ?? ''), name: String(row.name ?? ''),
    version: String(row.version ?? ''), capacity: textOf(row.capacity),
    movementPattern: textOf(row.movementPattern), equipment: stringArray(row.equipment),
    difficulty: textOf(row.difficulty),
    restrictions: audience === 'professor' ? stringArray(row.restrictions) : [],
  };
  return snapshot;
}

export function projectTrainingSubstitutionForAudience(
  row: WorkoutSubstitution, audience: 'student' | 'professor',
): TrainingSubstitutionRecord {
  return {
    id: row.id, sessionId: row.workoutDayId, alunoId: row.alunoId,
    kind: row.kind, context: row.context, status: row.status,
    original: safeSnapshot(row.originalSnapshot, audience),
    replacement: safeSnapshot(row.replacementSnapshot, audience),
    originalVersion: row.originalVersion, replacementVersion: row.replacementVersion,
    reason: row.reason, actorUserId: row.actorUserId, createdAt: row.createdAt.toISOString(),
    reviewedByUserId: row.reviewedByUserId, reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewReason: row.reviewReason, version: row.version,
  };
}

function suitability(original: TrainingSubstitutionSnapshot, candidate: TrainingSubstitutionSnapshot) {
  const sharedEquipment = original.equipment.filter(item => candidate.equipment.some(
    other => other.toLowerCase() === item.toLowerCase(),
  ));
  return {
    sameMovementPattern: Boolean(original.movementPattern && candidate.movementPattern &&
      original.movementPattern.toLowerCase() === candidate.movementPattern.toLowerCase()),
    sameCapacity: Boolean(original.capacity && candidate.capacity && original.capacity === candidate.capacity),
    sameDifficulty: Boolean(original.difficulty && candidate.difficulty && original.difficulty === candidate.difficulty),
    sharedEquipment,
    requiresProfessionalReview: candidate.restrictions.length > 0,
  };
}

function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function isSerializationFailure(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2034') return true;
  const meta = error.meta as { code?: unknown; message?: unknown } | undefined;
  return error.code === 'P2010' && (meta?.code === '40001' ||
    (typeof meta?.message === 'string' && /serialization failure|could not serialize access/i.test(meta.message)));
}

export function createTrainingSubstitutionService(client: PrismaClient = prismaRuntimeClient) {
  async function withTransaction<T>(operation: (tx: Db) => Promise<T>): Promise<T> {
    try {
      return await client.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isSerializationFailure(error)) return conflict('Treino modificado por outro usuário. Atualize antes de tentar novamente.');
      throw error;
    }
  }

  async function list(input: { sessionId: string; actor: SubstitutionActor }): Promise<TrainingSubstitutionRecord[]> {
    return withTransaction(async tx => {
      await loadSession(tx, input.sessionId, input.actor);
      const records = await tx.workoutSubstitution.findMany({
        where: { workoutDayId: input.sessionId, contractId: input.actor.contractId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      return records.map(row => projectTrainingSubstitutionForAudience(row, input.actor.kind));
    });
  }

  async function alternatives(input: {
    sessionId: string; actor: SubstitutionActor; kind: TrainingSubstitutionKind;
    originalUnitId: string; search?: string; offset?: number;
  }): Promise<TrainingSubstitutionAlternativePage> {
    const search = (input.search ?? '').trim();
    const offset = input.offset ?? 0;
    if (search.length > 100 || !Number.isInteger(offset) || offset < 0 || offset > 10000) {
      return invalid('Busca ou página inválida.');
    }
    return withTransaction(async tx => {
      const session = await loadSession(tx, input.sessionId, input.actor);
      if (input.kind === 'exercise') {
        const source = await readPlannedExercise(tx, session.day.id, input.originalUnitId);
        if (!source) return notFound();
        const original = exerciseSnapshot(source);
        const exercises = await tx.exerciseLibrary.findMany({
          where: {
            contractId: input.actor.contractId, ...approvedOperationalExerciseWhere,
            id: { not: source.exerciseId },
            ...(search ? { OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { aliases: { has: search } },
            ] } : {}),
          },
          select: {
            id: true, name: true, version: true, capacity: true, movementPattern: true,
            equipment: true, difficulty: true, restrictions: true,
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: offset, take: ALTERNATIVE_PAGE_SIZE + 1,
        });
        const hasMore = exercises.length > ALTERNATIVE_PAGE_SIZE;
        const items = exercises.slice(0, ALTERNATIVE_PAGE_SIZE).map(item => {
          const replacement = catalogSnapshot(item);
          return {
            kind: 'exercise' as const, replacement, suitability: suitability(original, replacement),
            objectiveHint: session.day.template.studentGoal,
          };
        }).map(item => input.actor.kind === 'student'
          ? { ...item, replacement: { ...item.replacement, restrictions: [] } }
          : item);
        return { items, nextOffset: hasMore ? offset + ALTERNATIVE_PAGE_SIZE : null };
      }
      if (input.kind !== 'session' || input.originalUnitId !== session.day.id) {
        return invalid('Sessão original inválida.');
      }
      // Only releases from this student and contract are valid session candidates.
      const releases = await tx.$queryRaw<AlternativeRelease[]>(Prisma.sql`
        SELECT DISTINCT ON ("workoutTemplateId")
          "workoutTemplateId", "releasedAssemblyVersion"
        FROM "ConsolidatedPrescriptionOperationalRelease"
        WHERE "alunoId" = ${session.alunoId}
          AND "contractId" = ${input.actor.contractId}
        ORDER BY "workoutTemplateId", "releasedAt" DESC, "id" DESC
      `);
      if (!releases.length) return { items: [], nextOffset: null };
      const versions = new Map(releases.map(row => [row.workoutTemplateId, row.releasedAssemblyVersion]));
      // Session titles contain only a civil date; search is therefore an exact ISO date.
      const sessionDate = search.replace(/^sess[ãa]o de\s+/iu, '');
      let dateFilter: { gte: Date; lt: Date } | undefined;
      if (search) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return { items: [], nextOffset: null };
        const date = new Date(sessionDate + 'T00:00:00.000Z');
        if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== sessionDate) {
          return { items: [], nextOffset: null };
        }
        dateFilter = { gte: date, lt: new Date(date.getTime() + 24 * 60 * 60 * 1000) };
      }
      const days = await tx.workoutDay.findMany({
        where: {
          id: { not: session.day.id }, templateId: { in: [...versions.keys()] },
          template: {
            released: true,
            plan: { alunoId: session.alunoId, aluno: { contractId: input.actor.contractId } },
          },
          ...(dateFilter ? { workoutDate: dateFilter } : {}),
        },
        select: { id: true, workoutDate: true, template: { select: { id: true, studentGoal: true } } },
        orderBy: [{ workoutDate: 'asc' }, { id: 'asc' }],
        skip: offset, take: ALTERNATIVE_PAGE_SIZE + 1,
      });
      const hasMore = days.length > ALTERNATIVE_PAGE_SIZE;
      const items: TrainingSubstitutionAlternative[] = days.slice(0, ALTERNATIVE_PAGE_SIZE).map(day => ({
        kind: 'session',
        replacement: {
          unitId: day.id, id: day.id,
          name: 'Sessão de ' + day.workoutDate.toISOString().slice(0, 10),
          version: 'liberacao:' + versions.get(day.template.id)!,
          capacity: null, movementPattern: null, equipment: [], difficulty: null, restrictions: [],
        },
        suitability: { sameMovementPattern: false, sameCapacity: false, sameDifficulty: false,
          sharedEquipment: [], requiresProfessionalReview: true },
        objectiveHint: day.template.studentGoal,
      }));
      return { items, nextOffset: hasMore ? offset + ALTERNATIVE_PAGE_SIZE : null };
    });
  }

  async function create(input: {
    sessionId: string; actor: SubstitutionActor; kind: TrainingSubstitutionKind;
    context: TrainingSubstitutionContext; originalUnitId: string; replacementUnitId: string;
    reason: string; operationKey: string; expectedExecutionVersion?: number;
  }): Promise<TrainingSubstitutionRecord> {
    const reason = normalizedText(input.reason, 500, 'um motivo');
    const operationKey = normalizedText(input.operationKey, 128, 'uma chave de operação');
    if (input.originalUnitId === input.replacementUnitId) return invalid('Original e substituto precisam ser diferentes.');
    if (input.actor.kind === 'student' && input.context !== 'execution') return permissionDenied();
    if (input.actor.kind === 'professor' && input.context === 'execution') return permissionDenied();
    const payloadFingerprint = fingerprint({
      actorUserId: input.actor.userId, kind: input.kind, context: input.context,
      original: input.originalUnitId, replacement: input.replacementUnitId,
      reason, expectedExecutionVersion: input.expectedExecutionVersion ?? null,
    });
    return withTransaction(async tx => {
      const session = await loadSession(tx, input.sessionId, input.actor);
      // Bloqueio do dia compartilhado pelas escritas da execucao canonica #389.
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "WorkoutDay" WHERE "id" = ${session.day.id} FOR UPDATE`);
      const existing = await tx.workoutSubstitution.findUnique({
        where: { workoutDayId_operationKey: { workoutDayId: input.sessionId, operationKey } },
      });
      if (existing) {
        if (existing.requestFingerprint !== payloadFingerprint) return conflict('Chave reutilizada para outra substituição.');
        return projectTrainingSubstitutionForAudience(existing, input.actor.kind);
      }
      const execution = await tx.workoutSessionExecution.findUnique({
        where: { workoutDayId: input.sessionId }, select: { status: true, version: true },
      });
      if (input.context === 'execution') {
        if (!execution || execution.status !== 'in_progress' ||
          !Number.isInteger(input.expectedExecutionVersion) ||
          input.expectedExecutionVersion !== execution.version) {
          return conflict('Treino não está em andamento ou sua versão mudou. Atualize a sessão.');
        }
      } else if (execution && execution.status !== 'not_started') {
        return conflict('Aprovação prévia somente é possível antes do início do treino.');
      }
      if (input.kind !== 'exercise' && input.kind !== 'session') return invalid('Tipo de substituição inválido.');
      if (input.context !== 'execution' && input.context !== 'planning' && input.context !== 'review') {
        return invalid('Contexto de substituição inválido.');
      }
      const active = await tx.workoutSubstitution.findFirst({
        where: {
          workoutDayId: input.sessionId, kind: input.kind, originalUnitId: input.originalUnitId,
          status: { in: ['approved', 'pending_review'] },
          ...(input.context === 'execution'
            ? { context: 'execution' }
            : { context: { in: ['planning', 'review'] } }),
        },
        select: { id: true },
      });
      if (active) return conflict('Já existe uma substituição ativa para este item e contexto.');

      let original: TrainingSubstitutionSnapshot;
      let replacement: TrainingSubstitutionSnapshot;
      if (input.kind === 'exercise') {
        const source = await readPlannedExercise(tx, session.day.id, input.originalUnitId);
        if (!source) return notFound();
        if (source.exerciseId === input.replacementUnitId) return invalid('Selecione outro exercício.');
        original = exerciseSnapshot(source);
        // Curadoria vigente e bloqueio FOR SHARE na mesma transacao de aplicacao.
        try {
          await assertApprovedWorkoutExerciseIds(tx, [input.replacementUnitId], input.actor.contractId);
        } catch {
          return conflict('Exercício indisponível ou não aprovado para substituição.');
        }
        const candidate = await tx.exerciseLibrary.findFirst({
          where: {
            id: input.replacementUnitId, contractId: input.actor.contractId,
            ...approvedOperationalExerciseWhere,
          },
          select: {
            id: true, name: true, version: true, capacity: true,
            movementPattern: true, equipment: true, difficulty: true, restrictions: true,
          },
        });
        if (!candidate) return conflict('Exercício indisponível para substituição.');
        replacement = catalogSnapshot(candidate);
      } else {
        if (input.originalUnitId !== session.day.id) return invalid('Identidade da sessão original inválida.');
        original = sessionSnapshot(session);
        const target = await tx.workoutDay.findFirst({
          where: {
            id: input.replacementUnitId,
            template: {
              released: true,
              plan: { alunoId: session.alunoId, aluno: { contractId: input.actor.contractId } },
            },
          },
          select: { id: true, workoutDate: true, template: { select: { id: true } } },
        });
        if (!target) return notFound();
        const release = await lookupRelease(tx, target.template.id, session.alunoId, input.actor.contractId);
        if (!release) return notFound();
        replacement = {
          unitId: target.id, id: target.id,
          name: 'Sessão de ' + target.workoutDate.toISOString().slice(0, 10),
          version: 'liberacao:' + release.releasedAssemblyVersion,
          capacity: null, movementPattern: null, equipment: [], difficulty: null, restrictions: [],
        };
      }
      const approved = input.actor.kind === 'professor';
      const row = await tx.workoutSubstitution.create({
        data: {
          workoutDayId: session.day.id, alunoId: session.alunoId, contractId: input.actor.contractId,
          originReleaseId: session.release.id, kind: input.kind, context: input.context,
          status: approved ? 'approved' : 'pending_review', originalUnitId: input.originalUnitId,
          replacementUnitId: input.replacementUnitId, originalVersion: original.version,
          replacementVersion: replacement.version,
          originalSnapshot: original as unknown as Prisma.InputJsonValue,
          replacementSnapshot: replacement as unknown as Prisma.InputJsonValue,
          reason, actorUserId: input.actor.userId, operationKey, requestFingerprint: payloadFingerprint,
          reviewedAt: approved ? new Date() : null, reviewedByUserId: approved ? input.actor.userId : null,
        },
      });
      await tx.studentLifecycleEvent.create({
        data: {
          alunoId: session.alunoId, contractId: input.actor.contractId, eventType: 'STATUS_CHANGED',
          actorUserId: input.actor.userId,
          ...(input.actor.kind === 'professor' ? { actorProfessorId: input.actor.professorId } : {}),
          metadata: {
            domain: 'workout_substitution', action: approved ? 'preapproved' : 'requested',
            substitutionId: row.id, workoutDayId: input.sessionId,
            originalUnitId: input.originalUnitId, replacementUnitId: input.replacementUnitId,
            kind: input.kind, context: input.context, status: row.status,
          },
        },
      });
      return projectTrainingSubstitutionForAudience(row, input.actor.kind);
    });
  }

  async function review(input: {
    sessionId: string; substitutionId: string;
    actor: Extract<SubstitutionActor, { kind: 'professor' }>;
    action: 'approve' | 'reject'; expectedVersion: number; reason?: string | null;
  }): Promise<TrainingSubstitutionRecord> {
    return withTransaction(async tx => {
      const session = await loadSession(tx, input.sessionId, input.actor);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "WorkoutDay" WHERE "id" = ${session.day.id} FOR UPDATE`);
      const current = await tx.workoutSubstitution.findFirst({
        where: {
          id: input.substitutionId, workoutDayId: input.sessionId,
          contractId: input.actor.contractId, alunoId: session.alunoId,
        },
      });
      if (!current) return notFound();
      if (current.context !== 'execution' || current.status !== 'pending_review' ||
        current.version !== input.expectedVersion) {
        return conflict('A substituição já foi revisada ou mudou de versão.');
      }
      const reviewReason = input.reason ? normalizedText(input.reason, 500, 'uma justificativa') : null;
      if (input.action === 'reject' && !reviewReason) return invalid('Informe o motivo para rejeitar a troca.');
      const now = new Date();
      const changed = await tx.workoutSubstitution.updateMany({
        where: { id: current.id, version: input.expectedVersion, status: 'pending_review' },
        data: {
          status: input.action === 'approve' ? 'approved' : 'rejected',
          version: { increment: 1 }, reviewedByUserId: input.actor.userId,
          reviewedAt: now, reviewReason,
        },
      });
      if (changed.count !== 1) return conflict('Outra revisão já foi registrada.');
      await tx.studentLifecycleEvent.create({
        data: {
          alunoId: session.alunoId, contractId: input.actor.contractId, eventType: 'STATUS_CHANGED',
          actorUserId: input.actor.userId, actorProfessorId: input.actor.professorId,
          metadata: {
            domain: 'workout_substitution', action: input.action, substitutionId: current.id,
            workoutDayId: input.sessionId, previousStatus: 'pending_review',
            status: input.action === 'approve' ? 'approved' : 'rejected',
            version: input.expectedVersion + 1,
          },
        },
      });
      const updated = await tx.workoutSubstitution.findUniqueOrThrow({ where: { id: current.id } });
      return projectTrainingSubstitutionForAudience(updated, input.actor.kind);
    });
  }

  return { list, alternatives, create, review };
}

export const trainingSubstitutionService = createTrainingSubstitutionService();

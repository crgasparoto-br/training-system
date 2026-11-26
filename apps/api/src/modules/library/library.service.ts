import { prismaRuntimeClient } from '../../common/prisma-runtime-client.js';
import {
  ExerciseCurationStatus, LoadType, MovementType, CountingType, type Prisma,
} from '@prisma/client';
import {
  assertExerciseCanBeApproved, LibraryCurationError, nextExerciseStatus,
  selectCatalogIdentityRows, type CurationAction,
} from './library-curation.domain.js';
import { findExerciseIdsByAlias, findExerciseIdsByMuscleGroup } from './exercise-alias-search.js';
import { approvedOperationalExerciseWhere } from './library-curation.domain.js';
import { hideUnapprovedLiveExerciseVideo } from '../workout/workout-release-catalog.js';
import type { PhysicalCapacityType } from '@corrida/types';
import { canProfessorAccessScreen } from '../access-control/access-control.service.js';

const prisma = prismaRuntimeClient;

/** Only the tenant-owned operational catalog is writable here; clinical decisions stay separate. */
export interface CreateExerciseDTO {
  name: string;
  videoUrl?: string | null;
  loadType?: LoadType;
  movementType?: MovementType;
  countingType?: CountingType;
  category?: string | null;
  muscleGroup?: string | null;
  notes?: string | null;
  aliases?: string[];
  capacity?: PhysicalCapacityType | null;
  equipment?: string[];
  primaryMuscleGroups?: string[];
  secondaryMuscleGroups?: string[];
  movementPattern?: string | null;
  joints?: string[];
  laterality?: string | null;
  difficulty?: string | null;
  instructions?: string[];
  commonErrors?: string[];
  regressions?: string[];
  progressions?: string[];
  alternatives?: string[];
  restrictions?: string[];
  alerts?: string[];
  mediaOrigin?: string | null;
  mediaLicense?: string | null;
  mediaAuthor?: string | null;
}

export interface UpdateExerciseDTO extends Partial<CreateExerciseDTO> {}

export interface ExerciseFilters {
  search?: string;
  category?: string;
  loadType?: LoadType;
  movementType?: MovementType;
  countingType?: CountingType;
  muscleGroup?: string;
  equipment?: string;
  movementPattern?: string;
  difficulty?: string;
  curationStatus?: ExerciseCurationStatus;
  scope?: 'official' | 'all';
}

type ExerciseLibraryListWhere = Prisma.ExerciseLibraryWhereInput;

/** Exercise details are catalog metadata, never student progress or workout plans. */
const exerciseCatalogDetailSelect = {
  id: true, contractId: true, name: true, videoUrl: true,
  loadType: true, movementType: true, countingType: true,
  category: true, muscleGroup: true, notes: true,
  aliases: true, capacity: true, equipment: true,
  primaryMuscleGroups: true, secondaryMuscleGroups: true,
  movementPattern: true, joints: true, laterality: true, difficulty: true,
  instructions: true, commonErrors: true, regressions: true,
  progressions: true, alternatives: true, restrictions: true, alerts: true,
  mediaOrigin: true, mediaLicense: true, mediaAuthor: true,
  curationStatus: true, version: true, contentVersion: true, systemDefault: true,
  versionRootId: true, supersededAt: true,
  createdByUserId: true,
  reviewedByUserId: true, reviewedAt: true, lastModifiedByUserId: true,
  lastCurationAction: true, legacyGrandfathered: true,
  createdAt: true, updatedAt: true,
} satisfies Prisma.ExerciseLibrarySelect;



/** Resolve only collaborators belonging to the current tenant; never disclose raw user IDs. */
async function catalogActorNames(contractId: string, ids: Array<string | null | undefined>) {
  const userIds = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!userIds.length) return new Map<string, string>();
  const professors = await prisma.professor.findMany({
    where: { contractId, userId: { in: userIds } },
    select: { userId: true, user: { select: { profile: { select: { name: true } } } } },
  });
  return new Map(professors.filter((person) => Boolean(person.user.profile?.name?.trim()))
    .map((person) => [person.userId, person.user.profile!.name.trim()]));
}

function actorName(names: Map<string, string>, userId: string | null | undefined) {
  return userId ? names.get(userId) ?? 'Usuário não disponível' : null;
}

const EDITORIAL_FIELDS = [
  'name', 'videoUrl', 'loadType', 'movementType', 'countingType',
  'category', 'muscleGroup', 'notes', 'aliases', 'capacity', 'equipment',
  'primaryMuscleGroups', 'secondaryMuscleGroups', 'movementPattern',
  'joints', 'laterality', 'difficulty', 'instructions', 'commonErrors',
  'regressions', 'progressions', 'alternatives', 'restrictions', 'alerts',
  'mediaOrigin', 'mediaLicense', 'mediaAuthor',
] as const;

function isSystemRevision(action: string) {
  return action.startsWith('system_defaults_') || action === 'bootstrap' ||
    action === 'import' || action === 'system_update';
}

type LockedCatalogManager = {
  role: 'master' | 'professor';
  isActive: boolean;
  currentStatus: string | null;
  dismissalDate: Date | null;
  collaboratorFunctionId: string;
  functionCode: string;
};

const INACTIVE_PROFESSOR_STATUSES = new Set([
  'inactive', 'inativo', 'dismissed', 'desligado', 'terminated', 'encerrado',
]);

/**
 * Recheck the live actor in the definitive write transaction. Row locks on
 * professor and user keep concurrent role, dismissal and active-status
 * revocations from racing the catalog change after HTTP middleware ran.
 */
async function assertCatalogManagerInTransaction(
  tx: Prisma.TransactionClient, contractId: string, actorUserId: string,
) {
  const [actor] = await tx.$queryRaw<LockedCatalogManager[]>`
    SELECT p."role"::text AS "role", p."currentStatus", p."dismissalDate",
           p."collaboratorFunctionId", cf."code" AS "functionCode",
           u."isActive"
    FROM "Professor" AS p
    JOIN "User" AS u ON u."id" = p."userId"
    JOIN "CollaboratorFunctionOption" AS cf
      ON cf."id" = p."collaboratorFunctionId"
    WHERE p."userId" = ${actorUserId} AND p."contractId" = ${contractId}
    FOR UPDATE OF p, u
  `;
  if (!actor || !actor.isActive || actor.role !== 'master'
    || INACTIVE_PROFESSOR_STATUSES.has(actor.currentStatus?.trim().toLowerCase() ?? 'active')
    || (actor.dismissalDate && actor.dismissalDate.getTime() <= Date.now())
    || !(await canProfessorAccessScreen({
      role: actor.role,
      collaboratorFunction: { id: actor.collaboratorFunctionId, code: actor.functionCode },
    }, 'library', tx))) {
    throw new LibraryCurationError('forbidden', 'Acesso administrativo à biblioteca não está mais autorizado.');
  }
}

/** The database trigger handles concurrent names; only translate its conflict. */
function throwCanonicalNameError(error: unknown): never {
  const failure = error as { code?: string; meta?: { code?: string } } | null;
  if (failure?.code === 'P2002' || (failure?.code === 'P2010' && failure.meta?.code === '23505')) {
    throw new LibraryCurationError('conflict', 'Já existe exercício com este nome neste contrato.');
  }
  throw error;
}

function notFound(): never {
  throw new LibraryCurationError('not_found', 'Exercício não encontrado neste contrato.');
}

function conflict(): never {
  throw new LibraryCurationError('conflict', 'O exercício foi modificado por outra operação. Recarregue para continuar.');
}

async function readVersion(
  tx: Prisma.TransactionClient, contractId: string, id: string, version: number,
) {
  const exercise = await tx.exerciseLibrary.findFirst({ where: { id, contractId } });
  if (!exercise) notFound();
  if (exercise.version !== version) conflict();
  return exercise;
}

function identityWhere(rootId: string): Prisma.ExerciseLibraryWhereInput {
  return { OR: [{ id: rootId }, { versionRootId: rootId }] };
}

async function lockExerciseIdentity(tx: Prisma.TransactionClient, contractId: string, rootId: string) {
  await tx.$queryRaw`SELECT "id" FROM "ExerciseLibrary" WHERE "id" = ${rootId}
    AND "contractId" = ${contractId} AND "versionRootId" IS NULL FOR UPDATE`;
}

export const libraryService = {
  /** A candidate retains identity but never edits the published workout reference. */
  async createExerciseVersion(contractId: string, id: string, data: UpdateExerciseDTO,
    expectedVersion: number, actorUserId: string) {
    return prisma.$transaction(async (tx) => {
      await assertCatalogManagerInTransaction(tx, contractId, actorUserId);
      let source = await readVersion(tx, contractId, id, expectedVersion);
      const root = source.versionRootId ?? source.id;
      await lockExerciseIdentity(tx, contractId, root);
      source = await readVersion(tx, contractId, id, expectedVersion);
      if (source.supersededAt || !['approved', 'inactive'].includes(source.curationStatus)) {
        throw new LibraryCurationError('conflict', 'Revise a versão atual do exercício.');
      }
      if (data.name !== undefined && data.name.trim() !== source.name.trim()) {
        throw new LibraryCurationError('invalid', 'Uma versão mantém o nome do exercício.');
      }
      const siblings = await tx.exerciseLibrary.findMany({ where: { contractId, ...identityWhere(root) } });
      if (siblings.some(row => row.curationStatus === 'draft' || row.curationStatus === 'in_review' ||
        (row.id !== id && row.curationStatus === 'approved' && !row.legacyGrandfathered))) {
        throw new LibraryCurationError('conflict', 'Já existe uma versão em revisão ou vigente. Recarregue a biblioteca.');
      }
      const content = Object.fromEntries(EDITORIAL_FIELDS.map(field => [field, source[field]]));
      if (source.legacyGrandfathered || (data.videoUrl !== undefined && data.videoUrl !== source.videoUrl)) {
        Object.assign(content, { mediaOrigin: null, mediaLicense: null, mediaAuthor: null });
      }
      try {
        return await tx.exerciseLibrary.create({ data: {
          ...content, ...data, name: source.name, contractId, versionRootId: root,
          curationStatus: ExerciseCurationStatus.draft, version: 1, systemDefault: false,
          legacyGrandfathered: false, createdByUserId: actorUserId,
          lastModifiedByUserId: actorUserId, lastCurationAction: 'create_version',
        } as Prisma.ExerciseLibraryUncheckedCreateInput });
      } catch (error) {
        const failure = error as { code?: string; meta?: { code?: string } } | null;
        if (failure?.code === 'P2002' || (failure?.code === 'P2010' && failure.meta?.code === '23505')) {
          throw new LibraryCurationError('conflict', 'Já existe uma versão em revisão. Recarregue a biblioteca.');
        }
        throw error;
      }
    });
  },

  /** New exercises start unpublished, including direct database inserts. */
  async createExercise(contractId: string, data: CreateExerciseDTO, actorUserId: string) {
    return prisma.$transaction(async (tx) => {
      await assertCatalogManagerInTransaction(tx, contractId, actorUserId);
      try {
        return await tx.exerciseLibrary.create({
          data: {
            ...data, contractId, curationStatus: ExerciseCurationStatus.draft, version: 1,
            legacyGrandfathered: false, createdByUserId: actorUserId,
            lastModifiedByUserId: actorUserId, lastCurationAction: 'create',
          },
        });
      } catch (error) {
        return throwCanonicalNameError(error);
      }
    });
  },

  async listExercises(contractId: string, filters: ExerciseFilters = {}) {
    const where: ExerciseLibraryListWhere = { contractId };
    // The official list is the only default. A privileged admin must request "all".
    if (filters.scope === 'all') {
      where.curationStatus = filters.curationStatus;
      where.supersededAt = null;
    } else {
      Object.assign(where, approvedOperationalExerciseWhere);
    }
    if (filters.search?.trim()) {
      const search = filters.search.trim();
      const aliasIds = await findExerciseIdsByAlias(prisma, contractId, search);
      const muscleIds = await findExerciseIdsByMuscleGroup(prisma, contractId, search);
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { muscleGroup: { contains: search, mode: 'insensitive' } },
        { id: { in: [...new Set([...aliasIds, ...muscleIds])] } },
      ];
    }
    if (filters.category) where.category = filters.category;
    if (filters.loadType) where.loadType = filters.loadType;
    if (filters.movementType) where.movementType = filters.movementType;
    if (filters.countingType) where.countingType = filters.countingType;
    if (filters.muscleGroup) {
      const muscleIds = await findExerciseIdsByMuscleGroup(prisma, contractId, filters.muscleGroup, true);
      where.AND = [{
        OR: [
          { muscleGroup: { equals: filters.muscleGroup, mode: 'insensitive' } },
          { id: { in: muscleIds } },
        ],
      }];
    }
    if (filters.equipment) where.equipment = { has: filters.equipment };
    if (filters.movementPattern) where.movementPattern = filters.movementPattern;
    if (filters.difficulty) where.difficulty = filters.difficulty;
    const rows = await prisma.exerciseLibrary.findMany({ where, orderBy: { name: 'asc' } });
    const exercises = filters.scope === 'all' ? selectCatalogIdentityRows(rows, true) : rows;
    const rootIds = filters.scope === 'all' ? [...new Set(exercises.flatMap(row => row.versionRootId ? [row.versionRootId] : []))] : [];
    const activeRows = rootIds.length ? await prisma.exerciseLibrary.findMany({
      where: { contractId, ...approvedOperationalExerciseWhere,
        OR: [{ id: { in: rootIds } }, { versionRootId: { in: rootIds } }] },
      select: { id: true, versionRootId: true, contentVersion: true },
    }) : [];
    const activeByRoot = new Map(activeRows.map(row => [row.versionRootId ?? row.id, row]));
    const names = await catalogActorNames(contractId, exercises.flatMap((exercise) =>
      [exercise.createdByUserId, exercise.reviewedByUserId]));
    return exercises.map((exercise) => ({
      ...(filters.scope === 'all' ? exercise : hideUnapprovedLiveExerciseVideo(exercise)),
      ...(filters.scope === 'all' ? { activeVersion: activeByRoot.get(exercise.versionRootId ?? exercise.id) ?? null } : {}),
      createdByName: actorName(names, exercise.createdByUserId) ??
        (exercise.systemDefault ? 'Catálogo do sistema' : null),
      reviewedByName: actorName(names, exercise.reviewedByUserId) ??
        (exercise.systemDefault && exercise.curationStatus === 'approved'
          ? 'Aprovação do sistema' : null),
    }));
  },

  async getExerciseById(contractId: string, id: string, officialOnly = false) {
    const exercise = await prisma.exerciseLibrary.findFirst({
      where: {
        id, contractId,
        ...(officialOnly ? approvedOperationalExerciseWhere : {}),
      },
      select: exerciseCatalogDetailSelect,
    });
    if (!exercise) return null;
    const names = await catalogActorNames(contractId,
      [exercise.createdByUserId, exercise.reviewedByUserId]);
    return {
      ...(officialOnly ? hideUnapprovedLiveExerciseVideo(exercise) : exercise),
      createdByName: actorName(names, exercise.createdByUserId) ??
        (exercise.systemDefault ? 'Catálogo do sistema' : null),
      reviewedByName: actorName(names, exercise.reviewedByUserId) ??
        (exercise.systemDefault && exercise.curationStatus === 'approved'
          ? 'Aprovação do sistema' : null),
    };
  },

  /** Optimistic-lock updates prevent silently replacing a review or a concurrent draft. */
  async updateExercise(
    contractId: string, id: string, data: UpdateExerciseDTO,
    expectedVersion: number, actorUserId: string,
  ) {
    return prisma.$transaction(async (tx) => {
      await assertCatalogManagerInTransaction(tx, contractId, actorUserId);
      let existing = await readVersion(tx, contractId, id, expectedVersion);
      if (existing.versionRootId) {
        await lockExerciseIdentity(tx, contractId, existing.versionRootId);
        existing = await readVersion(tx, contractId, id, expectedVersion);
      }
      if (existing.supersededAt || existing.curationStatus === ExerciseCurationStatus.approved) {
        throw new LibraryCurationError('conflict', 'Crie uma nova versão para preservar a publicação.');
      }
      if (existing.versionRootId && data.name !== undefined && data.name !== existing.name) {
        throw new LibraryCurationError('invalid', 'Uma versão mantém o nome do exercício.');
      }
      if (data.videoUrl !== undefined && data.videoUrl !== existing.videoUrl) {
        data = { mediaOrigin: null, mediaLicense: null, mediaAuthor: null, ...data };
      }
      if (existing.curationStatus === ExerciseCurationStatus.inactive) {
        throw new LibraryCurationError('conflict', 'Reabra o exercício antes de editar.');
      }
      if (await tx.workoutExercise.count({ where: { exerciseId: id } })) {
        throw new LibraryCurationError(
          'conflict', 'Exercício já aplicado a treinos: crie uma nova versão para não alterar o histórico.',
        );
      }
      let updated: { count: number };
      try {
        updated = await tx.exerciseLibrary.updateMany({
          // Recheck historical references at the definitive compare-and-swap.
          where: { id, contractId, version: expectedVersion, workoutExercises: { none: {} } },
          data: {
            ...data, version: { increment: 1 },
            curationStatus: ExerciseCurationStatus.draft, systemDefault: false,
            reviewedByUserId: null, reviewedAt: null,
            lastModifiedByUserId: actorUserId, lastCurationAction: 'edit',
          },
        });
      } catch (error) {
        return throwCanonicalNameError(error);
      }
      if (updated.count !== 1) conflict();
      return tx.exerciseLibrary.findFirstOrThrow({ where: { id, contractId } });
    });
  },

  async reviewExercise(
    contractId: string, id: string, expectedVersion: number,
    action: CurationAction, actorUserId: string,
  ) {
    return prisma.$transaction(async (tx) => {
      await assertCatalogManagerInTransaction(tx, contractId, actorUserId);
      let existing = await readVersion(tx, contractId, id, expectedVersion);
      if (existing.versionRootId) {
        await lockExerciseIdentity(tx, contractId, existing.versionRootId);
        existing = await readVersion(tx, contractId, id, expectedVersion);
      }
      if (existing.supersededAt) throw new LibraryCurationError('conflict', 'Esta versão pertence ao histórico.');
      if (action === 'reopen' && (existing.versionRootId || existing.reviewedAt ||
          await tx.workoutExercise.count({ where: { exerciseId: id } }) ||
          await tx.exerciseLibrary.count({ where: { contractId, versionRootId: id } }))) {
        throw new LibraryCurationError('conflict', 'Crie uma nova versão para preservar o histórico.');
      }
      const status = nextExerciseStatus(existing.curationStatus, action);
      if (action === 'approve') {
        assertExerciseCanBeApproved(existing);
        if (existing.versionRootId) {
          await tx.exerciseLibrary.updateMany({
            where: { contractId, ...identityWhere(existing.versionRootId), id: { not: id }, curationStatus: 'approved' },
            data: { curationStatus: 'inactive', supersededAt: new Date(), version: { increment: 1 },
              lastModifiedByUserId: actorUserId, lastCurationAction: 'supersede' },
          });
        }
      }
      let updated: { count: number };
      try {
        updated = await tx.exerciseLibrary.updateMany({
          where: { id, contractId, version: expectedVersion },
          data: {
            curationStatus: status, version: { increment: 1 },
            systemDefault: false, // A human curatorial decision ends automatic catalog repair eligibility.
            lastModifiedByUserId: actorUserId, lastCurationAction: action,
            ...(action === 'approve'
              ? { reviewedByUserId: actorUserId, reviewedAt: new Date(), legacyGrandfathered: false }
              : action === 'reopen' || action === 'request_changes'
                ? { reviewedByUserId: null, reviewedAt: null }
                : {}),
          },
        });
      } catch (error) {
        return throwCanonicalNameError(error);
      }
      if (updated.count !== 1) conflict();
      return tx.exerciseLibrary.findFirstOrThrow({ where: { id, contractId } });
    });
  },

  /** An inactive exercise remains available to historical reads; physical deletion is prohibited. */
  async deleteExercise(contractId: string, id: string, version: number, actorUserId: string) {
    return this.reviewExercise(contractId, id, version, 'deactivate', actorUserId);
  },

  async listExerciseRevisions(contractId: string, id: string) {
    const existing = await prisma.exerciseLibrary.findFirst({
      where: { id, contractId }, select: { id: true, versionRootId: true },
    });
    if (!existing) notFound();
    const revisions = await prisma.exerciseLibraryRevision.findMany({
      where: { contractId, exercise: identityWhere(existing.versionRootId ?? existing.id) },
      orderBy: [{ createdAt: 'desc' }, { version: 'desc' }],
    });
    const names = await catalogActorNames(contractId, revisions.map((event) => event.actorUserId));
    const perRow = new Map<string, { contentVersion: number; previousContent: string | null }>();
    return revisions.slice().reverse().map((event) => {
      let { contentVersion, previousContent } = perRow.get(event.exerciseId) ?? { contentVersion: 1, previousContent: null };
      const raw = event.snapshot;
      const snapshot = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw as Record<string, unknown> : null;
      const content = snapshot
        ? JSON.stringify(EDITORIAL_FIELDS.map((field) => snapshot[field] ?? null))
        : null;
      if (previousContent !== null && content !== null && content !== previousContent) {
        contentVersion += 1;
      } else if (previousContent === null && content === null &&
          event.action === 'edit' && event.version > 1) {
        contentVersion += 1;
      }
      previousContent = content;
      perRow.set(event.exerciseId, { contentVersion, previousContent });
      return {
        ...event,
        contentVersion: snapshot && typeof snapshot.contentVersion === 'number'
          ? snapshot.contentVersion : contentVersion,
        actorName: actorName(names, event.actorUserId) ??
          (isSystemRevision(event.action) ? 'Sistema' : 'Cadastro anterior'),
      };
    }).reverse();
  },

  /**
   * Obter progresso do aluno em um exercício
   */
  async getAlunoProgress(contractId: string, alunoId: string, exerciseId: string) {
    const [exercise, aluno] = await Promise.all([
      prisma.exerciseLibrary.findFirst({
        where: { id: exerciseId, contractId },
      }),
      prisma.aluno.findFirst({
        where: { id: alunoId, contractId },
      }),
    ]);

    if (!exercise || !aluno) {
      return null;
    }

    const progress = await prisma.alunoExerciseProgress.findUnique({
      where: {
        alunoId_exerciseId: {
          alunoId,
          exerciseId,
        },
      },
      include: {
        exercise: true,
      },
    });
    return progress ? {
      ...progress,
      exercise: hideUnapprovedLiveExerciseVideo(progress.exercise),
    } : null;
  },

  /**
   * Atualizar progresso do aluno
   */
  async updateAlunoProgress(
    contractId: string,
    alunoId: string,
    exerciseId: string,
    data: { lastLoad?: number; maxLoad?: number }
  ) {
    const [exercise, aluno] = await Promise.all([
      prisma.exerciseLibrary.findFirst({
        where: { id: exerciseId, contractId },
      }),
      prisma.aluno.findFirst({
        where: { id: alunoId, contractId },
      }),
    ]);

    if (!exercise || !aluno) {
      throw new Error('Progresso não encontrado');
    }

    return await prisma.alunoExerciseProgress.upsert({
      where: {
        alunoId_exerciseId: {
          alunoId,
          exerciseId,
        },
      },
      create: {
        alunoId,
        exerciseId,
        ...data,
      },
      update: {
        ...data,
        lastUpdated: new Date(),
      },
    });
  },

  /**
   * Listar todo o progresso de um aluno
   */
  async listAlunoProgress(contractId: string, alunoId: string) {
    const aluno = await prisma.aluno.findFirst({
      where: { id: alunoId, contractId },
    });

    if (!aluno) {
      return [];
    }

    const progress = await prisma.alunoExerciseProgress.findMany({
      where: { alunoId, exercise: { contractId } },
      include: {
        exercise: true,
      },
      orderBy: { lastUpdated: 'desc' },
    });
    return progress.map((row) => ({
      ...row,
      exercise: hideUnapprovedLiveExerciseVideo(row.exercise),
    }));
  },
};

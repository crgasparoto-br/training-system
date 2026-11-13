import { prismaRuntimeClient } from '../../common/prisma-runtime-client.js';
import {
  ExerciseCurationStatus, LoadType, MovementType, CountingType, type Prisma,
} from '@prisma/client';
import {
  assertExerciseCanBeApproved, LibraryCurationError, nextExerciseStatus,
  type CurationAction,
} from './library-curation.domain.js';
import { findExerciseIdsByAlias, findExerciseIdsByMuscleGroup } from './exercise-alias-search.js';
import { approvedOperationalExerciseWhere } from './library-curation.domain.js';
import { hideUnverifiedExerciseVideo } from '../workout/workout-release-catalog.js';
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
  curationStatus: true, version: true, createdByUserId: true,
  reviewedByUserId: true, reviewedAt: true, lastModifiedByUserId: true,
  lastCurationAction: true, legacyGrandfathered: true,
  createdAt: true, updatedAt: true,
} satisfies Prisma.ExerciseLibrarySelect;


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

export const libraryService = {
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
    return prisma.exerciseLibrary.findMany({ where, orderBy: { name: 'asc' } });
  },

  async getExerciseById(contractId: string, id: string, officialOnly = false) {
    return prisma.exerciseLibrary.findFirst({
      where: {
        id, contractId,
        ...(officialOnly ? approvedOperationalExerciseWhere : {}),
      },
      select: exerciseCatalogDetailSelect,
    });
  },

  /** Optimistic-lock updates prevent silently replacing a review or a concurrent draft. */
  async updateExercise(
    contractId: string, id: string, data: UpdateExerciseDTO,
    expectedVersion: number, actorUserId: string,
  ) {
    return prisma.$transaction(async (tx) => {
      await assertCatalogManagerInTransaction(tx, contractId, actorUserId);
      const existing = await readVersion(tx, contractId, id, expectedVersion);
      if (existing.curationStatus === ExerciseCurationStatus.inactive) {
        throw new LibraryCurationError('conflict', 'Reabra o exercício antes de editar.');
      }
      if (await tx.workoutExercise.count({ where: { exerciseId: id } })) {
        throw new LibraryCurationError(
          'conflict', 'Exercício já aplicado a treinos: desative e crie nova versão separada para não alterar o histórico.',
        );
      }
      let updated: { count: number };
      try {
        updated = await tx.exerciseLibrary.updateMany({
          // Recheck historical references at the definitive compare-and-swap.
          where: { id, contractId, version: expectedVersion, workoutExercises: { none: {} } },
          data: {
            ...data, version: { increment: 1 },
            curationStatus: ExerciseCurationStatus.draft,
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
      const existing = await readVersion(tx, contractId, id, expectedVersion);
      const status = nextExerciseStatus(existing.curationStatus, action);
      if (action === 'approve') assertExerciseCanBeApproved(existing);
      let updated: { count: number };
      try {
        updated = await tx.exerciseLibrary.updateMany({
          where: { id, contractId, version: expectedVersion },
          data: {
            curationStatus: status, version: { increment: 1 },
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
      where: { id, contractId }, select: { id: true },
    });
    if (!existing) notFound();
    return prisma.exerciseLibraryRevision.findMany({
      where: { contractId, exerciseId: id },
      orderBy: { version: 'desc' },
    });
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
      exercise: hideUnverifiedExerciseVideo(progress.exercise),
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
      exercise: hideUnverifiedExerciseVideo(row.exercise),
    }));
  },
};

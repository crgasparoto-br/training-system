import { prismaRuntimeClient } from '../../common/prisma-runtime-client.js';
import {
  ExerciseCurationStatus, LoadType, MovementType, CountingType, type Prisma,
} from '@prisma/client';
import {
  assertExerciseCanBeApproved, LibraryCurationError, nextExerciseStatus,
  type CurationAction,
} from './library-curation.domain.js';

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
  capacity?: string | null;
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
  /** Every user-created exercise starts in draft even if the legacy database default is approved. */
  async createExercise(contractId: string, data: CreateExerciseDTO, actorUserId: string) {
    return prisma.exerciseLibrary.create({
      data: {
        ...data, contractId, curationStatus: ExerciseCurationStatus.draft, version: 1,
        legacyGrandfathered: false, createdByUserId: actorUserId,
        lastModifiedByUserId: actorUserId, lastCurationAction: 'create',
      },
    });
  },

  async listExercises(contractId: string, filters: ExerciseFilters = {}) {
    const where: ExerciseLibraryListWhere = { contractId };
    // The official list is the only default. A privileged admin must request "all".
    where.curationStatus = filters.scope === 'all'
      ? filters.curationStatus
      : ExerciseCurationStatus.approved;
    if (filters.search?.trim()) {
      where.OR = [
        { name: { contains: filters.search.trim(), mode: 'insensitive' } },
        { muscleGroup: { contains: filters.search.trim(), mode: 'insensitive' } },
        { aliases: { has: filters.search.trim() } },
      ];
    }
    if (filters.category) where.category = filters.category;
    if (filters.loadType) where.loadType = filters.loadType;
    if (filters.movementType) where.movementType = filters.movementType;
    if (filters.countingType) where.countingType = filters.countingType;
    if (filters.muscleGroup) {
      where.AND = [{
        OR: [{ muscleGroup: filters.muscleGroup }, { primaryMuscleGroups: { has: filters.muscleGroup } }],
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
        ...(officialOnly ? { curationStatus: ExerciseCurationStatus.approved } : {}),
      },
      include: {
        workoutExercises: { include: { workoutDay: { include: { template: true } } } },
        alunoProgress: true,
      },
    });
  },

  /** Optimistic-lock updates prevent silently replacing a review or a concurrent draft. */
  async updateExercise(
    contractId: string, id: string, data: UpdateExerciseDTO,
    expectedVersion: number, actorUserId: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const existing = await readVersion(tx, contractId, id, expectedVersion);
      if (existing.curationStatus === ExerciseCurationStatus.inactive) {
        throw new LibraryCurationError('conflict', 'Reabra o exercício antes de editar.');
      }
      if (await tx.workoutExercise.count({ where: { exerciseId: id } })) {
        throw new LibraryCurationError(
          'conflict', 'Exercício já aplicado a treinos: desative e crie nova versão separada para não alterar o histórico.',
        );
      }
      const updated = await tx.exerciseLibrary.updateMany({
        where: { id, contractId, version: expectedVersion },
        data: {
          ...data, version: { increment: 1 },
          curationStatus: ExerciseCurationStatus.draft,
          reviewedByUserId: null, reviewedAt: null,
          lastModifiedByUserId: actorUserId, lastCurationAction: 'edit',
        },
      });
      if (updated.count !== 1) conflict();
      return tx.exerciseLibrary.findFirstOrThrow({ where: { id, contractId } });
    });
  },

  async reviewExercise(
    contractId: string, id: string, expectedVersion: number,
    action: CurationAction, actorUserId: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const existing = await readVersion(tx, contractId, id, expectedVersion);
      const status = nextExerciseStatus(existing.curationStatus, action);
      if (action === 'approve') assertExerciseCanBeApproved(existing);
      const updated = await tx.exerciseLibrary.updateMany({
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

    return await prisma.alunoExerciseProgress.findUnique({
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

    return await prisma.alunoExerciseProgress.findMany({
      where: { alunoId },
      include: {
        exercise: true,
      },
      orderBy: { lastUpdated: 'desc' },
    });
  },
};

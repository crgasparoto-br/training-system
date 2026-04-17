import { PrismaClient, LoadType, MovementType, CountingType } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreateExerciseDTO {
  name: string;
  videoUrl?: string;
  loadType?: LoadType;
  movementType?: MovementType;
  countingType?: CountingType;
  category?: string;
  muscleGroup?: string;
  notes?: string;
}

export interface UpdateExerciseDTO extends Partial<CreateExerciseDTO> {}

export interface ExerciseFilters {
  search?: string;
  category?: string;
  loadType?: LoadType;
  movementType?: MovementType;
  countingType?: CountingType;
  muscleGroup?: string;
}

/**
 * Service de Biblioteca de ExercÃ­cios
 */
export const libraryService = {
  /**
   * Criar novo exercÃ­cio
   */
  async createExercise(contractId: string, data: CreateExerciseDTO) {
    return await prisma.exerciseLibrary.create({
      data: {
        ...data,
        contractId,
      },
    });
  },

  /**
   * Listar exercÃ­cios com filtros
   */
  async listExercises(contractId: string, filters: ExerciseFilters = {}) {
    const where: any = { contractId };

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { muscleGroup: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.loadType) {
      where.loadType = filters.loadType;
    }

    if (filters.movementType) {
      where.movementType = filters.movementType;
    }

    if (filters.countingType) {
      where.countingType = filters.countingType;
    }

    if (filters.muscleGroup) {
      where.muscleGroup = filters.muscleGroup;
    }

    return await prisma.exerciseLibrary.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  },

  /**
   * Obter exercÃ­cio por ID
   */
  async getExerciseById(contractId: string, id: string) {
    return await prisma.exerciseLibrary.findFirst({
      where: { id, contractId },
      include: {
        workoutExercises: {
          include: {
            workoutDay: {
              include: {
                template: true,
              },
            },
          },
        },
        alunoProgress: true,
      },
    });
  },

  /**
   * Atualizar exercÃ­cio
   */
  async updateExercise(contractId: string, id: string, data: UpdateExerciseDTO) {
    const existing = await prisma.exerciseLibrary.findFirst({
      where: { id, contractId },
    });

    if (!existing) {
      throw new Error('ExercÃ­cio nÃ£o encontrado');
    }

    return await prisma.exerciseLibrary.update({
      where: { id },
      data,
    });
  },

  /**
   * Deletar exercÃ­cio
   */
  async deleteExercise(contractId: string, id: string) {
    const existing = await prisma.exerciseLibrary.findFirst({
      where: { id, contractId },
    });

    if (!existing) {
      throw new Error('ExercÃ­cio nÃ£o encontrado');
    }

    return await prisma.exerciseLibrary.delete({
      where: { id },
    });
  },

  /**
   * Obter progresso do aluno em um exercÃ­cio
   */
  async getAlunoProgress(contractId: string, alunoId: string, exerciseId: string) {
    const [exercise, aluno] = await Promise.all([
      prisma.exerciseLibrary.findFirst({
        where: { id: exerciseId, contractId },
      }),
      prisma.aluno.findFirst({
        where: {
          id: alunoId,
          professor: {
            contractId,
          },
        },
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
        where: {
          id: alunoId,
          professor: {
            contractId,
          },
        },
      }),
    ]);

    if (!exercise || !aluno) {
      throw new Error('Progresso nÃ£o encontrado');
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
      where: {
        id: alunoId,
        professor: {
          contractId,
        },
      },
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


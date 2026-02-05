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
 * Service de Biblioteca de Exercícios
 */
export const libraryService = {
  /**
   * Criar novo exercício
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
   * Listar exercícios com filtros
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
   * Obter exercício por ID
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
        studentProgress: true,
      },
    });
  },

  /**
   * Atualizar exercício
   */
  async updateExercise(contractId: string, id: string, data: UpdateExerciseDTO) {
    const existing = await prisma.exerciseLibrary.findFirst({
      where: { id, contractId },
    });

    if (!existing) {
      throw new Error('Exercício não encontrado');
    }

    return await prisma.exerciseLibrary.update({
      where: { id },
      data,
    });
  },

  /**
   * Deletar exercício
   */
  async deleteExercise(contractId: string, id: string) {
    const existing = await prisma.exerciseLibrary.findFirst({
      where: { id, contractId },
    });

    if (!existing) {
      throw new Error('Exercício não encontrado');
    }

    return await prisma.exerciseLibrary.delete({
      where: { id },
    });
  },

  /**
   * Obter progresso do aluno em um exercício
   */
  async getStudentProgress(contractId: string, athleteId: string, exerciseId: string) {
    const [exercise, athlete] = await Promise.all([
      prisma.exerciseLibrary.findFirst({
        where: { id: exerciseId, contractId },
      }),
      prisma.athlete.findFirst({
        where: {
          id: athleteId,
          educator: {
            contractId,
          },
        },
      }),
    ]);

    if (!exercise || !athlete) {
      return null;
    }

    return await prisma.studentExerciseProgress.findUnique({
      where: {
        athleteId_exerciseId: {
          athleteId,
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
  async updateStudentProgress(
    contractId: string,
    athleteId: string,
    exerciseId: string,
    data: { lastLoad?: number; maxLoad?: number }
  ) {
    const [exercise, athlete] = await Promise.all([
      prisma.exerciseLibrary.findFirst({
        where: { id: exerciseId, contractId },
      }),
      prisma.athlete.findFirst({
        where: {
          id: athleteId,
          educator: {
            contractId,
          },
        },
      }),
    ]);

    if (!exercise || !athlete) {
      throw new Error('Progresso não encontrado');
    }

    return await prisma.studentExerciseProgress.upsert({
      where: {
        athleteId_exerciseId: {
          athleteId,
          exerciseId,
        },
      },
      create: {
        athleteId,
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
  async listStudentProgress(contractId: string, athleteId: string) {
    const athlete = await prisma.athlete.findFirst({
      where: {
        id: athleteId,
        educator: {
          contractId,
        },
      },
    });

    if (!athlete) {
      return [];
    }

    return await prisma.studentExerciseProgress.findMany({
      where: { athleteId },
      include: {
        exercise: true,
      },
      orderBy: { lastUpdated: 'desc' },
    });
  },
};

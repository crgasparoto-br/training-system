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
  async createExercise(data: CreateExerciseDTO) {
    return await prisma.exerciseLibrary.create({
      data,
    });
  },

  /**
   * Listar exercícios com filtros
   */
  async listExercises(filters: ExerciseFilters = {}) {
    const where: any = {};

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
  async getExerciseById(id: string) {
    return await prisma.exerciseLibrary.findUnique({
      where: { id },
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
  async updateExercise(id: string, data: UpdateExerciseDTO) {
    return await prisma.exerciseLibrary.update({
      where: { id },
      data,
    });
  },

  /**
   * Deletar exercício
   */
  async deleteExercise(id: string) {
    return await prisma.exerciseLibrary.delete({
      where: { id },
    });
  },

  /**
   * Obter progresso do aluno em um exercício
   */
  async getStudentProgress(athleteId: string, exerciseId: string) {
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
    athleteId: string,
    exerciseId: string,
    data: { lastLoad?: number; maxLoad?: number }
  ) {
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
  async listStudentProgress(athleteId: string) {
    return await prisma.studentExerciseProgress.findMany({
      where: { athleteId },
      include: {
        exercise: true,
      },
      orderBy: { lastUpdated: 'desc' },
    });
  },
};

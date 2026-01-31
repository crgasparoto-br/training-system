import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreateAthleteDTO {
  userId: string;
  educatorId: string;
  age: number;
  weight: number;
  height: number;
  bodyFatPercentage?: number;
  vo2Max: number;
  anaerobicThreshold: number;
  maxHeartRate: number;
  restingHeartRate: number;
}

export interface UpdateAthleteDTO {
  age?: number;
  weight?: number;
  height?: number;
  bodyFatPercentage?: number;
  vo2Max?: number;
  anaerobicThreshold?: number;
  maxHeartRate?: number;
  restingHeartRate?: number;
}

export const athleteService = {
  /**
   * Criar novo atleta
   */
  async create(data: CreateAthleteDTO) {
    return await prisma.athlete.create({
      data,
      include: {
        user: {
          include: {
            profile: true,
          },
        },
        educator: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
      },
    });
  },

  /**
   * Listar atletas de um educador
   */
  async findByEducator(educatorId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [athletes, total] = await Promise.all([
      prisma.athlete.findMany({
        where: { educatorId },
        include: {
          user: {
            include: {
              profile: true,
            },
          },
          macronutrients: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.athlete.count({
        where: { educatorId },
      }),
    ]);

    return {
      athletes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Obter atleta por ID
   */
  async findById(id: string) {
    return await prisma.athlete.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
        educator: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
        macronutrients: true,
        trainingPlans: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 5,
        },
        progressMetrics: {
          orderBy: {
            date: 'desc',
          },
          take: 10,
        },
      },
    });
  },

  /**
   * Atualizar atleta
   */
  async update(id: string, data: UpdateAthleteDTO) {
    return await prisma.athlete.update({
      where: { id },
      data,
      include: {
        user: {
          include: {
            profile: true,
          },
        },
        macronutrients: true,
      },
    });
  },

  /**
   * Deletar atleta
   */
  async delete(id: string) {
    return await prisma.athlete.delete({
      where: { id },
    });
  },

  /**
   * Verificar se atleta pertence ao educador
   */
  async belongsToEducator(athleteId: string, educatorId: string): Promise<boolean> {
    const athlete = await prisma.athlete.findFirst({
      where: {
        id: athleteId,
        educatorId,
      },
    });
    return !!athlete;
  },

  /**
   * Calcular IMC
   */
  calculateBMI(weight: number, height: number): number {
    // height em cm, converter para metros
    const heightInMeters = height / 100;
    return weight / (heightInMeters * heightInMeters);
  },

  /**
   * Calcular zonas de frequência cardíaca
   */
  calculateHeartRateZones(maxHR: number, restingHR: number) {
    const hrReserve = maxHR - restingHR;

    return {
      zone1: {
        name: 'Recuperação',
        min: Math.round(restingHR + hrReserve * 0.5),
        max: Math.round(restingHR + hrReserve * 0.6),
        percentage: '50-60%',
      },
      zone2: {
        name: 'Aeróbico Leve',
        min: Math.round(restingHR + hrReserve * 0.6),
        max: Math.round(restingHR + hrReserve * 0.7),
        percentage: '60-70%',
      },
      zone3: {
        name: 'Aeróbico Moderado',
        min: Math.round(restingHR + hrReserve * 0.7),
        max: Math.round(restingHR + hrReserve * 0.8),
        percentage: '70-80%',
      },
      zone4: {
        name: 'Limiar',
        min: Math.round(restingHR + hrReserve * 0.8),
        max: Math.round(restingHR + hrReserve * 0.9),
        percentage: '80-90%',
      },
      zone5: {
        name: 'VO2 Max',
        min: Math.round(restingHR + hrReserve * 0.9),
        max: maxHR,
        percentage: '90-100%',
      },
    };
  },

  /**
   * Buscar atletas por nome
   */
  async search(educatorId: string, query: string) {
    return await prisma.athlete.findMany({
      where: {
        educatorId,
        user: {
          profile: {
            name: {
              contains: query,
              mode: 'insensitive',
            },
          },
        },
      },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
      take: 10,
    });
  },
};

import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

export interface CreateAthleteDTO {
  name: string;
  email: string;
  phone?: string;
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
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new Error('Email já está registrado');
    }

    const tempPassword = `temp-${Date.now()}`;
    const passwordHash = await bcryptjs.hash(tempPassword, 10);

    const athlete = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          type: 'student',
          profile: {
            create: {
              name: data.name,
              phone: data.phone,
            },
          },
        },
        include: {
          profile: true,
        },
      });

      return tx.athlete.create({
        data: {
          userId: user.id,
          educatorId: data.educatorId,
          age: data.age,
          weight: data.weight,
          height: data.height,
          bodyFatPercentage: data.bodyFatPercentage,
          vo2Max: data.vo2Max,
          anaerobicThreshold: data.anaerobicThreshold,
          maxHeartRate: data.maxHeartRate,
          restingHeartRate: data.restingHeartRate,
        },
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
    });

    return athlete;
  },

  /**
   * Listar atletas de um educador
   */
  async findByEducator(
    educatorId: string,
    page: number = 1,
    limit: number = 10,
    status: 'active' | 'inactive' | 'all' = 'active'
  ) {
    const skip = (page - 1) * limit;
    const statusFilter =
      status === 'all' ? {} : { user: { isActive: status === 'active' } };

    const [athletes, total] = await Promise.all([
      prisma.athlete.findMany({
        where: { educatorId, ...statusFilter },
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
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.athlete.count({
        where: { educatorId, ...statusFilter },
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
   * Listar atletas por contrato (opcionalmente filtrando por educador)
   */
  async findByContract(
    contractId: string,
    page: number = 1,
    limit: number = 10,
    educatorId?: string,
    status: 'active' | 'inactive' | 'all' = 'active'
  ) {
    const skip = (page - 1) * limit;
    const statusFilter =
      status === 'all' ? {} : { user: { isActive: status === 'active' } };
    const where: any = educatorId
      ? {
          educatorId,
          educator: { contractId },
          ...statusFilter,
        }
      : {
          educator: { contractId },
          ...statusFilter,
        };

    const [athletes, total] = await Promise.all([
      prisma.athlete.findMany({
        where,
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
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.athlete.count({
        where,
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
  async search(params: {
    query: string;
    educatorId?: string;
    contractId?: string;
    status?: 'active' | 'inactive' | 'all';
  }) {
    const { query, educatorId, contractId, status = 'active' } = params;
    const where: any = {
      user: {
        profile: {
          name: {
            contains: query,
            mode: 'insensitive',
          },
        },
      },
    };

    if (status !== 'all') {
      where.user = {
        ...where.user,
        isActive: status === 'active',
      };
    }

    if (educatorId) {
      where.educatorId = educatorId;
    }

    if (contractId) {
      where.educator = { contractId };
    }

    return await prisma.athlete.findMany({
      where,
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
      take: 10,
    });
  },

  /**
   * Verificar se atleta pertence ao contrato
   */
  async belongsToContract(athleteId: string, contractId: string): Promise<boolean> {
    const athlete = await prisma.athlete.findFirst({
      where: {
        id: athleteId,
        educator: { contractId },
      },
    });
    return !!athlete;
  },

  /**
   * Ativar/Inativar atleta (via usuário)
   */
  async setActive(athleteId: string, isActive: boolean) {
    return await prisma.athlete.update({
      where: { id: athleteId },
      data: {
        user: {
          update: { isActive },
        },
      },
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
   * Resetar senha do atleta (gera senha temporária)
   */
  async resetPassword(athleteId: string) {
    const athlete = await prisma.athlete.findUnique({
      where: { id: athleteId },
      include: {
        user: true,
      },
    });

    if (!athlete?.user) {
      throw new Error('Atleta não encontrado');
    }

    const tempPassword = `temp-${crypto.randomBytes(4).toString('hex')}`;
    const passwordHash = await bcryptjs.hash(tempPassword, 10);

    await prisma.user.update({
      where: { id: athlete.user.id },
      data: { passwordHash },
    });

    await prisma.athlete.update({
      where: { id: athleteId },
      data: { lastPasswordResetAt: new Date() },
    });

    return tempPassword;
  },
};

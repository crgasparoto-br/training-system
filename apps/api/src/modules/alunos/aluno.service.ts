import { PrismaClient, type Prisma } from '@prisma/client';
import bcryptjs from 'bcryptjs';
import crypto from 'crypto';
import { getServiceForContract } from '../services/service.service';

const prisma = new PrismaClient();

export interface CreateAlunoDTO {
  name: string;
  email: string;
  phone?: string;
  professorId: string;
  serviceId?: string;
  schedulePlan: 'free' | 'fixed';
  birthDate?: Date;
  gender?: 'male' | 'female' | 'other';
  age: number;
  weight: number;
  height: number;
  bodyFatPercentage?: number;
  vo2Max: number;
  anaerobicThreshold: number;
  maxHeartRate: number;
  restingHeartRate: number;
  systolicPressure?: number;
  diastolicPressure?: number;
  macronutrients?: {
    carbohydratesPercentage?: number;
    proteinsPercentage?: number;
    lipidsPercentage?: number;
    dailyCalories?: number;
  };
  intakeForm?: {
    assessmentDate?: Date;
    mainGoal?: string;
    medicalHistory?: string;
    currentMedications?: string;
    injuriesHistory?: string;
    trainingBackground?: string;
    observations?: string;
    parqResponses?: {
      q1: boolean;
      q2: boolean;
      q3: boolean;
      q4: boolean;
      q5: boolean;
      q6: boolean;
      q7: boolean;
      q8: boolean;
    };
    formResponses?: Record<string, unknown>;
  };
}

export interface UpdateAlunoDTO {
  serviceId?: string;
  schedulePlan?: 'free' | 'fixed';
  birthDate?: Date;
  gender?: 'male' | 'female' | 'other';
  age?: number;
  weight?: number;
  height?: number;
  bodyFatPercentage?: number;
  vo2Max?: number;
  anaerobicThreshold?: number;
  maxHeartRate?: number;
  restingHeartRate?: number;
  systolicPressure?: number;
  diastolicPressure?: number;
  macronutrients?: {
    carbohydratesPercentage?: number;
    proteinsPercentage?: number;
    lipidsPercentage?: number;
    dailyCalories?: number;
  };
  intakeForm?: {
    assessmentDate?: Date;
    mainGoal?: string;
    medicalHistory?: string;
    currentMedications?: string;
    injuriesHistory?: string;
    trainingBackground?: string;
    observations?: string;
    parqResponses?: {
      q1: boolean;
      q2: boolean;
      q3: boolean;
      q4: boolean;
      q5: boolean;
      q6: boolean;
      q7: boolean;
      q8: boolean;
    };
    formResponses?: Record<string, unknown>;
  };
}

const hasAnyValue = (payload: Record<string, unknown>) =>
  Object.values(payload).some((value) => {
    if (value === undefined || value === null) {
      return false;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    if (typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).some((nested) => nested === true || nested === false || nested !== undefined && nested !== null && nested !== '');
    }
    return true;
  });

const toInputJson = (value?: Record<string, unknown>): Prisma.InputJsonValue | undefined =>
  value as Prisma.InputJsonValue | undefined;

export const alunoService = {
  /**
   * Criar novo aluno
   */
  async create(data: CreateAlunoDTO) {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new Error('Email jÃ¡ estÃ¡ registrado');
    }

    const tempPassword = `temp-${crypto.randomBytes(4).toString('hex')}`;
    const passwordHash = await bcryptjs.hash(tempPassword, 10);

    const aluno = await prisma.$transaction(async (tx) => {
      let serviceId: string | undefined;

      if (data.serviceId) {
        const professor = await tx.professor.findUniqueOrThrow({
          where: { id: data.professorId },
          select: { contractId: true },
        });

        const service = await getServiceForContract(professor.contractId, data.serviceId, tx);

        if (!service.isActive) {
          throw new Error('Serviço selecionado está inativo');
        }

        serviceId = service.id;
      }

      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          type: 'aluno',
          profile: {
            create: {
              name: data.name,
              phone: data.phone,
              birthDate: data.birthDate,
              gender: data.gender,
            },
          },
        },
        include: {
          profile: true,
        },
      });

      const aluno = await tx.aluno.create({
        data: {
          userId: user.id,
          professorId: data.professorId,
          serviceId,
          schedulePlan: data.schedulePlan,
          age: data.age,
          weight: data.weight,
          height: data.height,
          bodyFatPercentage: data.bodyFatPercentage,
          vo2Max: data.vo2Max,
          anaerobicThreshold: data.anaerobicThreshold,
          maxHeartRate: data.maxHeartRate,
          restingHeartRate: data.restingHeartRate,
          systolicPressure: data.systolicPressure,
          diastolicPressure: data.diastolicPressure,
        },
        include: {
          user: {
            include: {
              profile: true,
            },
          },
          professor: {
            include: {
              user: {
                include: {
                  profile: true,
                },
              },
            },
          },
          service: true,
          macronutrients: true,
          intakeForm: true,
        },
      });

      if (data.macronutrients && hasAnyValue(data.macronutrients)) {
        await tx.macronutrients.create({
          data: {
            alunoId: aluno.id,
            carbohydratesPercentage: data.macronutrients.carbohydratesPercentage ?? 0,
            proteinsPercentage: data.macronutrients.proteinsPercentage ?? 0,
            lipidsPercentage: data.macronutrients.lipidsPercentage ?? 0,
            dailyCalories: data.macronutrients.dailyCalories,
          },
        });
      }

      if (data.intakeForm && hasAnyValue(data.intakeForm)) {
        await tx.alunoIntakeForm.create({
          data: {
            alunoId: aluno.id,
            assessmentDate: data.intakeForm.assessmentDate,
            mainGoal: data.intakeForm.mainGoal,
            medicalHistory: data.intakeForm.medicalHistory,
            currentMedications: data.intakeForm.currentMedications,
            injuriesHistory: data.intakeForm.injuriesHistory,
            trainingBackground: data.intakeForm.trainingBackground,
            observations: data.intakeForm.observations,
            parqResponses: data.intakeForm.parqResponses,
            formResponses: toInputJson(data.intakeForm.formResponses),
          },
        });
      }

      if (data.intakeForm?.assessmentDate) {
        await tx.progressMetric.create({
          data: {
            alunoId: aluno.id,
            date: data.intakeForm.assessmentDate,
            weight: data.weight,
            bodyFatPercentage: data.bodyFatPercentage,
            vo2MaxEstimated: data.vo2Max,
            notes: data.intakeForm.observations,
          },
        });
      }

      return tx.aluno.findUniqueOrThrow({
        where: { id: aluno.id },
        include: {
          user: {
            include: {
              profile: true,
            },
          },
          professor: {
            include: {
              user: {
                include: {
                  profile: true,
                },
              },
            },
          },
          service: true,
          macronutrients: true,
          intakeForm: true,
        },
      });
    });

    return {
      aluno,
      tempPassword,
    };
  },

  /**
   * Listar alunos de um professor
   */
  async findByProfessor(
    professorId: string,
    page: number = 1,
    limit: number = 10,
    status: 'active' | 'inactive' | 'all' = 'active'
  ) {
    const skip = (page - 1) * limit;
    const statusFilter =
      status === 'all' ? {} : { user: { isActive: status === 'active' } };

    const [alunos, total] = await Promise.all([
      prisma.aluno.findMany({
        where: { professorId, ...statusFilter },
        include: {
          user: {
            include: {
              profile: true,
            },
          },
          professor: {
            include: {
              user: {
                include: {
                  profile: true,
                },
              },
            },
          },
          service: true,
          macronutrients: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.aluno.count({
        where: { professorId, ...statusFilter },
      }),
    ]);

    return {
      alunos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Listar alunos por contrato (opcionalmente filtrando por professor)
   */
  async findByContract(
    contractId: string,
    page: number = 1,
    limit: number = 10,
    professorId?: string,
    status: 'active' | 'inactive' | 'all' = 'active'
  ) {
    const skip = (page - 1) * limit;
    const statusFilter =
      status === 'all' ? {} : { user: { isActive: status === 'active' } };
    const where: any = professorId
      ? {
          professorId,
          professor: { contractId },
          ...statusFilter,
        }
      : {
          professor: { contractId },
          ...statusFilter,
        };

    const [alunos, total] = await Promise.all([
      prisma.aluno.findMany({
        where,
        include: {
          user: {
            include: {
              profile: true,
            },
          },
          professor: {
            include: {
              user: {
                include: {
                  profile: true,
                },
              },
            },
          },
          service: true,
          macronutrients: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.aluno.count({
        where,
      }),
    ]);

    return {
      alunos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Obter aluno por ID
   */
  async findById(id: string) {
    return await prisma.aluno.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
        professor: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
        service: true,
        macronutrients: true,
        intakeForm: true,
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
   * Atualizar aluno
   */
  async update(id: string, data: UpdateAlunoDTO) {
    const {
      birthDate,
      gender,
      macronutrients,
      intakeForm,
      ...alunoData
    } = data;

    return await prisma.$transaction(async (tx) => {
      const currentAluno = await tx.aluno.findUniqueOrThrow({
        where: { id },
        include: {
          professor: {
            select: {
              contractId: true,
            },
          },
        },
      });

      if (data.serviceId !== undefined) {
        if (!data.serviceId) {
          alunoData.serviceId = null as never;
        } else {
          const service = await getServiceForContract(currentAluno.professor.contractId, data.serviceId, tx);

          if (!service.isActive) {
            throw new Error('Serviço selecionado está inativo');
          }

          alunoData.serviceId = service.id as never;
        }
      }

      const aluno = await tx.aluno.update({
        where: { id },
        data: alunoData,
      });

      if (birthDate !== undefined || gender !== undefined) {
        await tx.profile.update({
          where: { userId: aluno.userId },
          data: {
            ...(birthDate !== undefined ? { birthDate } : {}),
            ...(gender !== undefined ? { gender } : {}),
          },
        });
      }

      if (macronutrients) {
        if (hasAnyValue(macronutrients)) {
          await tx.macronutrients.upsert({
            where: { alunoId: id },
            create: {
              alunoId: id,
              carbohydratesPercentage: macronutrients.carbohydratesPercentage ?? 0,
              proteinsPercentage: macronutrients.proteinsPercentage ?? 0,
              lipidsPercentage: macronutrients.lipidsPercentage ?? 0,
              dailyCalories: macronutrients.dailyCalories,
            },
            update: {
              carbohydratesPercentage: macronutrients.carbohydratesPercentage ?? 0,
              proteinsPercentage: macronutrients.proteinsPercentage ?? 0,
              lipidsPercentage: macronutrients.lipidsPercentage ?? 0,
              dailyCalories: macronutrients.dailyCalories,
            },
          });
        }
      }

      if (intakeForm) {
        if (hasAnyValue(intakeForm)) {
          await tx.alunoIntakeForm.upsert({
            where: { alunoId: id },
            create: {
              alunoId: id,
              assessmentDate: intakeForm.assessmentDate,
              mainGoal: intakeForm.mainGoal,
              medicalHistory: intakeForm.medicalHistory,
              currentMedications: intakeForm.currentMedications,
              injuriesHistory: intakeForm.injuriesHistory,
              trainingBackground: intakeForm.trainingBackground,
              observations: intakeForm.observations,
              parqResponses: intakeForm.parqResponses,
              formResponses: toInputJson(intakeForm.formResponses),
            },
            update: {
              assessmentDate: intakeForm.assessmentDate,
              mainGoal: intakeForm.mainGoal,
              medicalHistory: intakeForm.medicalHistory,
              currentMedications: intakeForm.currentMedications,
              injuriesHistory: intakeForm.injuriesHistory,
              trainingBackground: intakeForm.trainingBackground,
              observations: intakeForm.observations,
              parqResponses: intakeForm.parqResponses,
              formResponses: toInputJson(intakeForm.formResponses),
            },
          });
        }
      }

      return tx.aluno.findUniqueOrThrow({
        where: { id },
        include: {
          user: {
            include: {
              profile: true,
            },
          },
          professor: {
            include: {
              user: {
                include: {
                  profile: true,
                },
              },
            },
          },
          service: true,
          macronutrients: true,
          intakeForm: true,
        },
      });
    });
  },

  /**
   * Deletar aluno
   */
  async delete(id: string) {
    return await prisma.aluno.delete({
      where: { id },
    });
  },

  /**
   * Verificar se aluno pertence ao professor
   */
  async belongsToProfessor(alunoId: string, professorId: string): Promise<boolean> {
    const aluno = await prisma.aluno.findFirst({
      where: {
        id: alunoId,
        professorId,
      },
    });
    return !!aluno;
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
   * Calcular zonas de frequÃªncia cardÃ­aca
   */
  calculateHeartRateZones(maxHR: number, restingHR: number) {
    const hrReserve = maxHR - restingHR;

    return {
      zone1: {
        name: 'RecuperaÃ§Ã£o',
        min: Math.round(restingHR + hrReserve * 0.5),
        max: Math.round(restingHR + hrReserve * 0.6),
        percentage: '50-60%',
      },
      zone2: {
        name: 'AerÃ³bico Leve',
        min: Math.round(restingHR + hrReserve * 0.6),
        max: Math.round(restingHR + hrReserve * 0.7),
        percentage: '60-70%',
      },
      zone3: {
        name: 'AerÃ³bico Moderado',
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
   * Buscar alunos por nome
   */
  async search(params: {
    query: string;
    professorId?: string;
    contractId?: string;
    status?: 'active' | 'inactive' | 'all';
  }) {
    const { query, professorId, contractId, status = 'active' } = params;
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

    if (professorId) {
      where.professorId = professorId;
    }

    if (contractId) {
      where.professor = { contractId };
    }

    return await prisma.aluno.findMany({
      where,
      include: {
        user: {
          include: {
            profile: true,
          },
        },
        professor: {
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
   * Verificar se aluno pertence ao contrato
   */
  async belongsToContract(alunoId: string, contractId: string): Promise<boolean> {
    const aluno = await prisma.aluno.findFirst({
      where: {
        id: alunoId,
        professor: { contractId },
      },
    });
    return !!aluno;
  },

  /**
   * Ativar/Inativar aluno (via usuÃ¡rio)
   */
  async setActive(alunoId: string, isActive: boolean) {
    return await prisma.aluno.update({
      where: { id: alunoId },
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
        professor: {
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
   * Resetar senha do aluno (gera senha temporÃ¡ria)
   */
  async resetPassword(alunoId: string) {
    const aluno = await prisma.aluno.findUnique({
      where: { id: alunoId },
      include: {
        user: true,
      },
    });

    if (!aluno?.user) {
      throw new Error('Aluno nÃ£o encontrado');
    }

    const tempPassword = `temp-${crypto.randomBytes(4).toString('hex')}`;
    const passwordHash = await bcryptjs.hash(tempPassword, 10);

    await prisma.user.update({
      where: { id: aluno.user.id },
      data: { passwordHash },
    });

    await prisma.aluno.update({
      where: { id: alunoId },
      data: { lastPasswordResetAt: new Date() },
    });

    return tempPassword;
  },
};


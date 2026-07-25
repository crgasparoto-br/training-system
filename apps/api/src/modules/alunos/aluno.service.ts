import { PrismaClient, type Prisma } from '@prisma/client';
import bcryptjs from 'bcryptjs';
import crypto from 'crypto';
import { getServiceForContract } from '../services/service.service.js';
import { assertStudentInterestServiceSelectable } from './aluno.service-selection.js';
import { legacyDirectActiveStudentCreationFields } from './student-lifecycle.service.js';
import { upsertStudentIdentity } from './student-identity.service.js';
import {
  hasCanonicalHealthIntakeMutation,
  hasCanonicalHealthIntakeValue,
  upsertCanonicalStudentHealthIntake,
} from './student-health-intake-write.service.js';
import { preRegistrationParqService } from '../pre-registration-public/pre-registration-parq.service.js';
import { assertNoLegacyParqWrite } from './student-parq-legacy-cutover.js';
import {
  syncStudentFixedSchedule,
  type FixedScheduleSlotInput,
} from '../agenda/fixed-schedule.service.js';

const prisma = new PrismaClient();

const resolveAlunoCompanyContractId = (alunoLike: {
  contractId?: string | null;
  professor?: { contractId?: string | null } | null;
  currentStudentContract?: { contract?: { companyContractId?: string | null } | null } | null;
}) =>
  alunoLike.contractId ||
  alunoLike.currentStudentContract?.contract?.companyContractId ||
  alunoLike.professor?.contractId ||
  null;

export interface CreateAlunoDTO {
  name: string;
  email: string;
  avatar?: string;
  phone?: string;
  professorId: string;
  serviceId?: string;
  schedulePlan: 'free' | 'fixed';
  fixedScheduleSlots?: FixedScheduleSlotInput[];
  confirmKeepFutureBookings?: boolean;
  birthDate?: Date;
  gender?: 'male' | 'female' | 'other';
  age: number;
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

export interface UpdateAlunoDTO {
  avatar?: string;
  professorId?: string;
  serviceId?: string;
  schedulePlan?: 'free' | 'fixed';
  fixedScheduleSlots?: FixedScheduleSlotInput[];
  confirmKeepFutureBookings?: boolean;
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


const getResponsibleProfessorIdFromFormResponses = (
  formResponses?: Record<string, unknown>
) => {
  if (!formResponses) return undefined;

  const financial = formResponses.financial;
  if (!financial || typeof financial !== 'object') return undefined;

  const responsibleProfessorId = (financial as Record<string, unknown>).responsibleProfessorId;
  if (typeof responsibleProfessorId !== 'string') return undefined;

  const normalized = responsibleProfessorId.trim();
  return normalized.length > 0 ? normalized : undefined;
};

export const alunoService = {
  /**
   * Criar novo aluno
   */
  async create(data: CreateAlunoDTO) {
    assertNoLegacyParqWrite(data);
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
      const professor = await tx.professor.findUniqueOrThrow({
        where: { id: data.professorId },
        select: { contractId: true },
      });

      if (data.serviceId) {
        const service = await getServiceForContract(professor.contractId, data.serviceId);
        assertStudentInterestServiceSelectable(service);

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
              avatar: data.avatar,
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
          // Cadastro administrativo legado: sempre cria um aluno já ativo,
          // com conta e professor completos (issue #268 não altera este
          // fluxo). contractId é derivado do professor responsável para
          // preservar o isolamento multi-tenant já existente.
          contractId: professor.contractId,
          ...legacyDirectActiveStudentCreationFields(),
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

      await upsertStudentIdentity(
        aluno.id,
        professor.contractId,
        {
          name: data.name,
          email: data.email,
          phone: data.phone,
          birthDate: data.birthDate,
          gender: data.gender,
        },
        {
          client: tx,
          sourceType: 'professional',
          sourceReference: 'legacy_admin_create',
          syncLegacyProfile: true,
        }
      );

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

      if (data.intakeForm) {
        if (hasCanonicalHealthIntakeValue(data.intakeForm)) {
          await upsertCanonicalStudentHealthIntake(tx, {
            alunoId: aluno.id,
            contractId: professor.contractId,
            sourceType: 'professional',
            sourceReference: 'legacy_admin_create',
            health: data.intakeForm,
          });
        }
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

      if (data.schedulePlan === 'fixed') {
        await syncStudentFixedSchedule(
          tx,
          professor.contractId,
          aluno.id,
          'fixed',
          data.fixedScheduleSlots ?? [],
          { confirmKeepFutureBookings: data.confirmKeepFutureBookings }
        );
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
    // Issue #268: esta listagem sempre representou alunos ativos (fluxo
    // legado só cria Aluno já com status ACTIVE_STUDENT). Explicitar o
    // filtro para que leads futuros (#269+) nunca apareçam aqui por acidente.
    const lifecycleFilter = { status: 'ACTIVE_STUDENT' as const };

    const [alunos, total] = await Promise.all([
      prisma.aluno.findMany({
        where: { professorId, ...statusFilter, ...lifecycleFilter },
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
        where: { professorId, ...statusFilter, ...lifecycleFilter },
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

  async findByProfessorIds(
    professorIds: string[],
    page: number = 1,
    limit: number = 10,
    status: 'active' | 'inactive' | 'all' = 'active'
  ) {
    if (professorIds.length === 0) {
      return {
        alunos: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      };
    }

    const skip = (page - 1) * limit;
    const statusFilter =
      status === 'all' ? {} : { user: { isActive: status === 'active' } };

    // Issue #268: filtro explícito para que leads futuros (#269+) nunca
    // apareçam nesta listagem de alunos ativos.
    const where = {
      professorId: { in: professorIds },
      status: 'ACTIVE_STUDENT' as const,
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
    // Issue #268: contractId agora vive diretamente em Aluno (fonte de
    // verdade tenant-scoped) e o filtro de status evita que leads futuros
    // (#269+) apareçam como aluno ativo nesta listagem.
    const where: any = professorId
      ? {
          professorId,
          contractId,
          status: 'ACTIVE_STUDENT',
          ...statusFilter,
        }
      : {
          contractId,
          status: 'ACTIVE_STUDENT',
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
    const aluno = await prisma.aluno.findUnique({
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
    if (!aluno) return null;
    const parq = await preRegistrationParqService.overview(aluno.contractId, aluno.id);
    return { ...aluno, parq };
  },

  /**
   * Atualizar aluno
   */
  async update(id: string, data: UpdateAlunoDTO) {
    assertNoLegacyParqWrite(data);
    const {
      avatar,
      professorId,
      schedulePlan,
      fixedScheduleSlots,
      confirmKeepFutureBookings,
      birthDate,
      gender,
      macronutrients,
      intakeForm,
      ...alunoPatch
    } = data;
    const alunoData: Prisma.AlunoUncheckedUpdateInput = { ...alunoPatch };

    return await prisma.$transaction(async (tx) => {
      const currentAluno = await tx.aluno.findUniqueOrThrow({
        where: { id },
        include: {
          professor: {
            select: {
              contractId: true,
            },
          },
          currentStudentContract: {
            select: {
              contract: {
                select: {
                  companyContractId: true,
                },
              },
            },
          },
          intakeForm: {
            select: {
              parqResponses: true,
            },
          },
        },
      });

      const alunoContractId = resolveAlunoCompanyContractId(currentAluno);

      if (!alunoContractId) {
        throw new Error('Contrato do aluno não encontrado');
      }

      if (data.serviceId !== undefined) {
        if (!data.serviceId) {
          alunoData.serviceId = null as never;
        } else {
          const service = await getServiceForContract(alunoContractId, data.serviceId);
          assertStudentInterestServiceSelectable(service, currentAluno.serviceId);

          alunoData.serviceId = service.id as never;
        }
      }

      const desiredProfessorId =
        professorId || getResponsibleProfessorIdFromFormResponses(intakeForm?.formResponses);

      if (desiredProfessorId && desiredProfessorId !== currentAluno.professorId) {
        const targetProfessor = await tx.professor.findFirst({
          where: {
            id: desiredProfessorId,
            contractId: alunoContractId,
          },
          select: { id: true },
        });

        if (!targetProfessor) {
          throw new Error('Professor responsavel invalido para este contrato');
        }

        alunoData.professorId = targetProfessor.id as never;
      }

      const aluno = await tx.aluno.update({
        where: { id },
        data: alunoData,
      });

      if (birthDate !== undefined || gender !== undefined) {
        await upsertStudentIdentity(
          aluno.id,
          alunoContractId,
          {
            ...(birthDate !== undefined ? { birthDate } : {}),
            ...(gender !== undefined ? { gender } : {}),
          },
          {
            client: tx,
            sourceType: 'professional',
            sourceReference: 'legacy_admin_update',
            syncLegacyProfile: true,
          }
        );
      }

      if (aluno.userId && avatar !== undefined) {
        await tx.profile.update({
          where: { userId: aluno.userId },
          data: { avatar },
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
        if (hasCanonicalHealthIntakeMutation(intakeForm)) {
          await upsertCanonicalStudentHealthIntake(tx, {
            alunoId: id,
            contractId: alunoContractId,
            sourceType: 'professional',
            sourceReference: 'legacy_admin_update',
            health: intakeForm,
          });
        }
      }

      if (schedulePlan !== undefined || fixedScheduleSlots !== undefined) {
        const desiredSchedulePlan = schedulePlan ?? currentAluno.schedulePlan;
        await syncStudentFixedSchedule(
          tx,
          alunoContractId,
          id,
          desiredSchedulePlan,
          desiredSchedulePlan === 'fixed' ? fixedScheduleSlots ?? [] : [],
          { confirmKeepFutureBookings }
        );
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
        OR: [
          { professorId },
          {
            professor: {
              responsibleManagerId: professorId,
            },
          },
        ],
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
    professorIds?: string[];
    contractId?: string;
    status?: 'active' | 'inactive' | 'all';
  }) {
    const { query, professorId, professorIds, contractId, status = 'active' } = params;
    // Issue #268: busca de aluno continua restrita a quem já tem conta/perfil
    // (leads pré-cadastro não são indexados aqui) e explicitamente a
    // ACTIVE_STUDENT, para não confundir lead com aluno ativo.
    const where: any = {
      status: 'ACTIVE_STUDENT',
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

    if (professorIds && professorIds.length > 0) {
      where.professorId = { in: professorIds };
    }

    if (contractId) {
      where.contractId = contractId;
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
      where: { id: alunoId, contractId },
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

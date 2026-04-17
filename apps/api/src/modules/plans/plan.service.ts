import { PrismaClient, TrainingPhase, SessionType } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreatePlanDTO {
  professorId: string;
  alunoId: string;
  name: string;
  description?: string;
  startDate: Date;
  endDate: Date;
}

export interface CreateMacrocycleDTO {
  planId: string;
  name: string;
  phase: TrainingPhase;
  weekStart: number;
  weekEnd: number;
  focusAreas: string[];
}

export interface CreateMesocycleDTO {
  macrocycleId: string;
  weekNumber: number;
  startDate: Date;
  endDate: Date;
  focus?: string;
  volumeTarget?: number;
}

export interface CreateMicrocycleDTO {
  mesocycleId: string;
  dayOfWeek: number;
  sessionType: SessionType;
  durationMinutes: number;
  distanceKm?: number;
  intensityPercentage: number;
  paceMinPerKm?: number;
  heartRateZone?: number;
  instructions?: string;
  notes?: string;
}

type PlanStatusFilter = 'active' | 'finished' | 'all';

const buildPlanWhere = (params: {
  professorId?: string;
  alunoId?: string;
  contractId?: string;
  status?: PlanStatusFilter;
  query?: string;
}) => {
  const { professorId, alunoId, contractId, status = 'all', query } = params;
  const where: any = {};

  if (professorId) {
    where.professorId = professorId;
  }

  if (alunoId) {
    where.alunoId = alunoId;
  }

  if (contractId) {
    where.professor = { contractId };
  }

  if (status && status !== 'all') {
    const today = new Date();
    if (status === 'active') {
      where.startDate = { lte: today };
      where.endDate = { gte: today };
    } else if (status === 'finished') {
      where.endDate = { lt: today };
    }
  }

  if (query && query.trim().length >= 2) {
    const value = query.trim();
    where.OR = [
      { name: { contains: value, mode: 'insensitive' } },
      {
        aluno: {
          user: {
            profile: {
              name: { contains: value, mode: 'insensitive' },
            },
          },
        },
      },
    ];
  }

  return where;
};

export const planService = {
  /**
   * Criar novo plano de treino
   */
  async createPlan(data: CreatePlanDTO) {
    return await prisma.trainingPlan.create({
      data,
      include: {
        aluno: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
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
   * Listar planos de um professor
   */
  async findByProfessor(
    professorId: string,
    page: number = 1,
    limit: number = 10,
    alunoId?: string,
    status: PlanStatusFilter = 'all',
    query?: string
  ) {
    const skip = (page - 1) * limit;
    const where = buildPlanWhere({ professorId, alunoId, status, query });

    const [plans, total] = await Promise.all([
      prisma.trainingPlan.findMany({
        where,
        include: {
          aluno: {
            include: {
              user: {
                include: {
                  profile: true,
                },
              },
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
          macrocycles: {
            include: {
              mesocycles: {
                include: {
                  microcycles: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.trainingPlan.count({
        where,
      }),
    ]);

    return {
      plans,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Listar planos de um aluno
   */
  async findByAluno(
    alunoId: string,
    status: PlanStatusFilter = 'all',
    query?: string
  ) {
    return await prisma.trainingPlan.findMany({
      where: buildPlanWhere({ alunoId, status, query }),
      include: {
        professor: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
        macrocycles: {
          include: {
            mesocycles: {
              include: {
                microcycles: true,
              },
            },
          },
        },
      },
      orderBy: {
        startDate: 'desc',
      },
    });
  },

  /**
   * Listar planos por contrato (opcionalmente filtrando por professor ou aluno)
   */
  async findByContract(
    contractId: string,
    page: number = 1,
    limit: number = 10,
    professorId?: string,
    alunoId?: string,
    status: PlanStatusFilter = 'all',
    query?: string
  ) {
    const skip = (page - 1) * limit;
    const where = buildPlanWhere({
      contractId,
      professorId,
      alunoId,
      status,
      query,
    });

    const [plans, total] = await Promise.all([
      prisma.trainingPlan.findMany({
        where,
        include: {
          aluno: {
            include: {
              user: {
                include: {
                  profile: true,
                },
              },
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
          macrocycles: {
            include: {
              mesocycles: {
                include: {
                  microcycles: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.trainingPlan.count({
        where,
      }),
    ]);

    return {
      plans,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Obter plano por ID
   */
  async findById(id: string) {
    return await prisma.trainingPlan.findUnique({
      where: { id },
      include: {
        aluno: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
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
        macrocycles: {
          include: {
            mesocycles: {
              include: {
                microcycles: {
                  orderBy: {
                    dayOfWeek: 'asc',
                  },
                },
              },
              orderBy: {
                weekNumber: 'asc',
              },
            },
          },
          orderBy: {
            weekStart: 'asc',
          },
        },
      },
    });
  },

  /**
   * Atualizar plano
   */
  async updatePlan(id: string, data: Partial<CreatePlanDTO>) {
    return await prisma.trainingPlan.update({
      where: { id },
      data,
    });
  },

  /**
   * Deletar plano
   */
  async deletePlan(id: string) {
    return await prisma.trainingPlan.delete({
      where: { id },
    });
  },

  /**
   * Verificar se plano pertence ao professor
   */
  async belongsToProfessor(planId: string, professorId: string): Promise<boolean> {
    const plan = await prisma.trainingPlan.findFirst({
      where: {
        id: planId,
        professorId,
      },
    });
    return !!plan;
  },

  /**
   * Criar macrociclo
   */
  async createMacrocycle(data: CreateMacrocycleDTO) {
    return await prisma.macrocycle.create({
      data,
    });
  },

  /**
   * Criar mesociclo
   */
  async createMesocycle(data: CreateMesocycleDTO) {
    return await prisma.mesocycle.create({
      data,
    });
  },

  /**
   * Criar microciclo (sessÃ£o)
   */
  async createMicrocycle(data: CreateMicrocycleDTO) {
    return await prisma.microcycle.create({
      data,
    });
  },

  /**
   * Atualizar microciclo (sessÃ£o)
   */
  async updateMicrocycle(id: string, data: Partial<CreateMicrocycleDTO>) {
    return await prisma.microcycle.update({
      where: { id },
      data,
    });
  },

  /**
   * Deletar microciclo (sessÃ£o)
   */
  async deleteMicrocycle(id: string) {
    return await prisma.microcycle.delete({
      where: { id },
    });
  },

  /**
   * Gerar semanas automaticamente para um plano
   */
  async generateWeeks(planId: string, startDate: Date, endDate: Date) {
    const plan = await this.findById(planId);
    if (!plan) throw new Error('Plano nÃ£o encontrado');

    // Calcular nÃºmero de semanas
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffWeeks = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7)));

    const existingMacrocycle = plan.macrocycles[0] ?? null;
    const macrocycle = existingMacrocycle
      ? await prisma.macrocycle.update({
          where: { id: existingMacrocycle.id },
          data: {
            weekStart: 1,
            weekEnd: diffWeeks,
          },
        })
      : await this.createMacrocycle({
          planId,
          name: 'Macrociclo Principal',
          phase: 'base',
          weekStart: 1,
          weekEnd: diffWeeks,
          focusAreas: ['ResistÃªncia AerÃ³bica', 'TÃ©cnica de Corrida'],
        });

    const existingMesocycles = await prisma.mesocycle.findMany({
      where: { macrocycleId: macrocycle.id },
      orderBy: { weekNumber: 'asc' },
    });
    const existingByWeek = new Map(existingMesocycles.map((meso) => [meso.weekNumber, meso]));

    // Criar/atualizar mesociclos (semanas)
    const mesocycles = [];
    for (let week = 1; week <= diffWeeks; week++) {
      const weekStartDate = new Date(startDate);
      weekStartDate.setDate(weekStartDate.getDate() + (week - 1) * 7);

      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekEndDate.getDate() + 6);

      const existing = existingByWeek.get(week);
      if (existing) {
        const updated = await prisma.mesocycle.update({
          where: { id: existing.id },
          data: {
            startDate: weekStartDate,
            endDate: weekEndDate,
            focus: existing.focus ?? `Semana ${week}`,
          },
        });
        mesocycles.push(updated);
      } else {
        const created = await this.createMesocycle({
          macrocycleId: macrocycle.id,
          weekNumber: week,
          startDate: weekStartDate,
          endDate: weekEndDate,
          focus: `Semana ${week}`,
        });
        mesocycles.push(created);
      }
    }

    return { macrocycle, mesocycles };
  },

  /**
   * Calcular pace baseado em VO2 Max e intensidade
   */
  calculatePace(vo2Max: number, intensityPercentage: number): number {
    // FÃ³rmula simplificada: pace = 60 / (vo2Max * intensityPercentage / 100)
    // Retorna em minutos por km
    const velocity = (vo2Max * intensityPercentage) / 100;
    return 60 / velocity;
  },

  /**
   * Calcular zona de FC baseado em intensidade
   */
  calculateHeartRateZone(intensityPercentage: number): number {
    if (intensityPercentage <= 60) return 1; // RecuperaÃ§Ã£o
    if (intensityPercentage <= 70) return 2; // AerÃ³bico Leve
    if (intensityPercentage <= 80) return 3; // AerÃ³bico Moderado
    if (intensityPercentage <= 90) return 4; // Limiar
    return 5; // VO2 Max
  },

  /**
   * Calcular volume semanal total
   */
  async calculateWeeklyVolume(mesocycleId: string): Promise<number> {
    const microcycles = await prisma.microcycle.findMany({
      where: { mesocycleId },
    });

    return microcycles.reduce((total, session) => {
      return total + (session.distanceKm || 0);
    }, 0);
  },

  /**
   * Obter estatÃ­sticas do plano
   */
  async getPlanStats(planId: string) {
    const plan = await this.findById(planId);
    if (!plan) throw new Error('Plano nÃ£o encontrado');

    const totalMacrocycles = plan.macrocycles.length;
    const totalMesocycles = plan.macrocycles.reduce(
      (sum, macro) => sum + macro.mesocycles.length,
      0
    );
    const totalMicrocycles = plan.macrocycles.reduce(
      (sum, macro) =>
        sum +
        macro.mesocycles.reduce((s, meso) => s + meso.microcycles.length, 0),
      0
    );

    const totalDistance = plan.macrocycles.reduce(
      (sum, macro) =>
        sum +
        macro.mesocycles.reduce(
          (s, meso) =>
            s +
            meso.microcycles.reduce((ss, micro) => ss + (micro.distanceKm || 0), 0),
          0
        ),
      0
    );

    const totalDuration = plan.macrocycles.reduce(
      (sum, macro) =>
        sum +
        macro.mesocycles.reduce(
          (s, meso) =>
            s +
            meso.microcycles.reduce((ss, micro) => ss + micro.durationMinutes, 0),
          0
        ),
      0
    );

    return {
      totalMacrocycles,
      totalMesocycles,
      totalMicrocycles,
      totalDistance,
      totalDuration,
      averageWeeklyDistance: totalDistance / totalMesocycles,
      averageSessionDuration: totalDuration / totalMicrocycles,
    };
  },
};



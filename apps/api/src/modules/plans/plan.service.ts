import { PrismaClient, TrainingPhase, SessionType } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreatePlanDTO {
  educatorId: string;
  athleteId: string;
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

export const planService = {
  /**
   * Criar novo plano de treino
   */
  async createPlan(data: CreatePlanDTO) {
    return await prisma.trainingPlan.create({
      data,
      include: {
        athlete: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
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
   * Listar planos de um educador
   */
  async findByEducator(educatorId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [plans, total] = await Promise.all([
      prisma.trainingPlan.findMany({
        where: { educatorId },
        include: {
          athlete: {
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
        where: { educatorId },
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
   * Listar planos de um atleta
   */
  async findByAthlete(athleteId: string) {
    return await prisma.trainingPlan.findMany({
      where: { athleteId },
      include: {
        educator: {
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
   * Obter plano por ID
   */
  async findById(id: string) {
    return await prisma.trainingPlan.findUnique({
      where: { id },
      include: {
        athlete: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
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
   * Verificar se plano pertence ao educador
   */
  async belongsToEducator(planId: string, educatorId: string): Promise<boolean> {
    const plan = await prisma.trainingPlan.findFirst({
      where: {
        id: planId,
        educatorId,
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
   * Criar microciclo (sessão)
   */
  async createMicrocycle(data: CreateMicrocycleDTO) {
    return await prisma.microcycle.create({
      data,
    });
  },

  /**
   * Atualizar microciclo (sessão)
   */
  async updateMicrocycle(id: string, data: Partial<CreateMicrocycleDTO>) {
    return await prisma.microcycle.update({
      where: { id },
      data,
    });
  },

  /**
   * Deletar microciclo (sessão)
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
    if (!plan) throw new Error('Plano não encontrado');

    // Calcular número de semanas
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));

    // Criar macrociclo padrão
    const macrocycle = await this.createMacrocycle({
      planId,
      name: 'Macrociclo Principal',
      phase: 'base',
      weekStart: 1,
      weekEnd: diffWeeks,
      focusAreas: ['Resistência Aeróbica', 'Técnica de Corrida'],
    });

    // Criar mesociclos (semanas)
    const mesocycles = [];
    for (let week = 1; week <= diffWeeks; week++) {
      const weekStartDate = new Date(startDate);
      weekStartDate.setDate(weekStartDate.getDate() + (week - 1) * 7);
      
      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekEndDate.getDate() + 6);

      const mesocycle = await this.createMesocycle({
        macrocycleId: macrocycle.id,
        weekNumber: week,
        startDate: weekStartDate,
        endDate: weekEndDate,
        focus: `Semana ${week}`,
      });

      mesocycles.push(mesocycle);
    }

    return { macrocycle, mesocycles };
  },

  /**
   * Calcular pace baseado em VO2 Max e intensidade
   */
  calculatePace(vo2Max: number, intensityPercentage: number): number {
    // Fórmula simplificada: pace = 60 / (vo2Max * intensityPercentage / 100)
    // Retorna em minutos por km
    const velocity = (vo2Max * intensityPercentage) / 100;
    return 60 / velocity;
  },

  /**
   * Calcular zona de FC baseado em intensidade
   */
  calculateHeartRateZone(intensityPercentage: number): number {
    if (intensityPercentage <= 60) return 1; // Recuperação
    if (intensityPercentage <= 70) return 2; // Aeróbico Leve
    if (intensityPercentage <= 80) return 3; // Aeróbico Moderado
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
   * Obter estatísticas do plano
   */
  async getPlanStats(planId: string) {
    const plan = await this.findById(planId);
    if (!plan) throw new Error('Plano não encontrado');

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

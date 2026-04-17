import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Regras de CÃ¡lculo AutomÃ¡tico
 */

// Calcular % Carga TR baseado em Zona de RepetiÃ§Ãµes
export function calculateLoadPercentage(repZone: number | null): number | null {
  if (!repZone) return null;
  
  const loadMap: Record<number, number> = {
    4: 90,
    6: 85,
    8: 80,
    10: 75,
    12: 70,
    14: 65,
  };
  
  return loadMap[repZone] || null;
}

// Calcular SÃ©ries baseado em Carga Microciclo e REF
export function calculateSeries(
  loadCycle: string | null,
  seriesReference: number | null
): number | null {
  if (!seriesReference) return null;
  
  if (loadCycle === 'REG') {
    return Math.round(seriesReference / 2);
  }
  
  return seriesReference;
}

// Calcular Rep Reserva baseado em Carga Microciclo
export function calculateRepReserve(loadCycle: string | null): number | null {
  if (!loadCycle) return null;
  
  if (loadCycle === 'CHO') return 0;
  if (loadCycle === 'ADP') return 4;
  return 2; // ORD ou REG
}

/**
 * Service de PeriodizaÃ§Ã£o
 */
export const periodizationService = {
  /**
   * Criar matriz de periodizaÃ§Ã£o para um plano
   */
  async createMatrix(data: {
    planId: string;
    totalMesocycles: number;
    weeksPerMesocycle: number;
  }) {
    return await prisma.periodizationMatrix.create({
      data,
      include: {
        resistedStimulus: true,
        cyclicStimulus: true,
        nutrition: true,
      },
    });
  },

  /**
   * Obter matriz por planId
   */
  async getByPlanId(planId: string) {
    return await prisma.periodizationMatrix.findUnique({
      where: { planId },
      include: {
        resistedStimulus: {
          orderBy: [
            { mesocycleNumber: 'asc' },
            { weekNumber: 'asc' },
          ],
        },
        cyclicStimulus: {
          orderBy: [
            { mesocycleNumber: 'asc' },
            { weekNumber: 'asc' },
          ],
        },
        nutrition: {
          orderBy: [
            { mesocycleNumber: 'asc' },
            { weekNumber: 'asc' },
          ],
        },
        plan: {
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
          },
        },
      },
    });
  },

  /**
   * Atualizar matriz
   */
  async updateMatrix(
    matrixId: string,
    data: {
      totalMesocycles?: number;
      weeksPerMesocycle?: number;
    }
  ) {
    return await prisma.periodizationMatrix.update({
      where: { id: matrixId },
      data,
    });
  },

  /**
   * Deletar matriz
   */
  async deleteMatrix(matrixId: string) {
    return await prisma.periodizationMatrix.delete({
      where: { id: matrixId },
    });
  },

  // =========================================================================
  // ESTÃMULO RESISTIDO
  // =========================================================================

  /**
   * Criar ou atualizar estÃ­mulo resistido
   */
  async upsertResistedStimulus(data: {
    matrixId: string;
    mesocycleNumber: number;
    weekNumber: number;
    loadCycle?: string | null;
    objective?: string | null;
    repZone?: number | null;
    seriesReference?: number | null;
    seriesUpperBody?: number | null;
    seriesCore?: number | null;
    assembly?: string | null;
    method?: string | null;
    trainingDivision?: string | null;
    weeklyFrequency?: number | null;
    observations?: string | null;
  }) {
    // Calcular campos automÃ¡ticos
    const loadPercentage = calculateLoadPercentage(data.repZone || null);
    const seriesLowerBody = calculateSeries(
      data.loadCycle || null,
      data.seriesReference || null
    );
    const repReserve = calculateRepReserve(data.loadCycle || null);

    return await prisma.resistedStimulus.upsert({
      where: {
        matrixId_mesocycleNumber_weekNumber: {
          matrixId: data.matrixId,
          mesocycleNumber: data.mesocycleNumber,
          weekNumber: data.weekNumber,
        },
      },
      create: {
        ...data,
        loadPercentage,
        seriesLowerBody,
        repReserve,
      },
      update: {
        ...data,
        loadPercentage,
        seriesLowerBody,
        repReserve,
      },
    });
  },

  /**
   * Obter estÃ­mulos resistidos por matriz
   */
  async getResistedStimulusByMatrix(matrixId: string) {
    return await prisma.resistedStimulus.findMany({
      where: { matrixId },
      orderBy: [
        { mesocycleNumber: 'asc' },
        { weekNumber: 'asc' },
      ],
    });
  },

  /**
   * Deletar estÃ­mulo resistido
   */
  async deleteResistedStimulus(id: string) {
    return await prisma.resistedStimulus.delete({
      where: { id },
    });
  },

  // =========================================================================
  // ESTÃMULO CÃCLICO
  // =========================================================================

  /**
   * Criar ou atualizar estÃ­mulo cÃ­clico
   */
  async upsertCyclicStimulus(data: {
    matrixId: string;
    mesocycleNumber: number;
    weekNumber: number;
    totalVolumeMinutes?: number | null;
    totalVolumeKm?: number | null;
    runningVolumeKm?: number | null;
    countZ1?: number | null;
    countZ2?: number | null;
    countZ3?: number | null;
    countZ4?: number | null;
    countZ5?: number | null;
    minutesZ1?: number | null;
    minutesZ2?: number | null;
    minutesZ3?: number | null;
    minutesZ4?: number | null;
    minutesZ5?: number | null;
  }) {
    return await prisma.cyclicStimulus.upsert({
      where: {
        matrixId_mesocycleNumber_weekNumber: {
          matrixId: data.matrixId,
          mesocycleNumber: data.mesocycleNumber,
          weekNumber: data.weekNumber,
        },
      },
      create: data,
      update: data,
    });
  },

  /**
   * Obter estÃ­mulos cÃ­clicos por matriz
   */
  async getCyclicStimulusByMatrix(matrixId: string) {
    return await prisma.cyclicStimulus.findMany({
      where: { matrixId },
      orderBy: [
        { mesocycleNumber: 'asc' },
        { weekNumber: 'asc' },
      ],
    });
  },

  /**
   * Deletar estÃ­mulo cÃ­clico
   */
  async deleteCyclicStimulus(id: string) {
    return await prisma.cyclicStimulus.delete({
      where: { id },
    });
  },

  // =========================================================================
  // NUTRIÃ‡ÃƒO
  // =========================================================================

  /**
   * Criar ou atualizar nutriÃ§Ã£o semanal
   */
  async upsertNutrition(data: {
    matrixId: string;
    mesocycleNumber: number;
    weekNumber: number;
    dailyCalories?: number | null;
    carbohydratesG?: number | null;
    proteinsG?: number | null;
    lipidsG?: number | null;
    hydrationLiters?: number | null;
    supplements?: string | null;
    notes?: string | null;
  }) {
    return await prisma.nutritionWeekly.upsert({
      where: {
        matrixId_mesocycleNumber_weekNumber: {
          matrixId: data.matrixId,
          mesocycleNumber: data.mesocycleNumber,
          weekNumber: data.weekNumber,
        },
      },
      create: data,
      update: data,
    });
  },

  /**
   * Obter nutriÃ§Ã£o por matriz
   */
  async getNutritionByMatrix(matrixId: string) {
    return await prisma.nutritionWeekly.findMany({
      where: { matrixId },
      orderBy: [
        { mesocycleNumber: 'asc' },
        { weekNumber: 'asc' },
      ],
    });
  },

  /**
   * Deletar nutriÃ§Ã£o
   */
  async deleteNutrition(id: string) {
    return await prisma.nutritionWeekly.delete({
      where: { id },
    });
  },

  // =========================================================================
  // PARÃ‚METROS
  // =========================================================================

  /**
   * Criar parÃ¢metro
   */
  async createParameter(data: {
    contractId: string;
    category: string;
    code: string;
    description: string;
    order: number;
  }) {
    return await prisma.trainingParameter.create({
      data,
    });
  },

  /**
   * Obter parÃ¢metros por categoria
   */
  async getParametersByCategory(contractId: string, category: string, includeInactive = false) {
    return await prisma.trainingParameter.findMany({
      where: includeInactive
        ? { contractId, category }
        : { contractId, category, active: true },
      orderBy: { order: 'asc' },
    });
  },

  /**
   * Obter todos os parÃ¢metros
   */
  async getAllParameters(contractId: string, includeInactive = false) {
    return await prisma.trainingParameter.findMany({
      where: includeInactive ? { contractId } : { contractId, active: true },
      orderBy: [
        { category: 'asc' },
        { order: 'asc' },
      ],
    });
  },

  /**
   * Atualizar parÃ¢metro
   */
  async updateParameter(
    contractId: string,
    id: string,
    data: {
      description?: string;
      order?: number;
      active?: boolean;
    }
  ) {
    const existing = await prisma.trainingParameter.findFirst({
      where: { id, contractId },
    });

    if (!existing) {
      throw new Error('ParÃ¢metro nÃ£o encontrado');
    }

    return await prisma.trainingParameter.update({
      where: { id },
      data,
    });
  },

  /**
   * Deletar parÃ¢metro
   */
  async deleteParameter(contractId: string, id: string) {
    const existing = await prisma.trainingParameter.findFirst({
      where: { id, contractId },
    });

    if (!existing) {
      throw new Error('ParÃ¢metro nÃ£o encontrado');
    }

    return await prisma.trainingParameter.delete({
      where: { id },
    });
  },

  /**
   * Renomear categoria de parametros
   */
  async renameParameterCategory(contractId: string, fromCategory: string, toCategory: string) {
    if (fromCategory === toCategory) {
      return { updated: 0 };
    }

    const [toCodes, fromCodes] = await Promise.all([
      prisma.trainingParameter.findMany({
        where: { contractId, category: toCategory },
        select: { code: true },
      }),
      prisma.trainingParameter.findMany({
        where: { contractId, category: fromCategory },
        select: { code: true },
      }),
    ]);

    const toCodeSet = new Set(toCodes.map((item) => item.code));
    const conflicts = fromCodes
      .map((item) => item.code)
      .filter((code) => toCodeSet.has(code));

    if (conflicts.length > 0) {
      throw new Error(
        `CONFLICT: Ja existem parametros com os codigos: ${conflicts.join(', ')}`
      );
    }

    const result = await prisma.trainingParameter.updateMany({
      where: { contractId, category: fromCategory },
      data: { category: toCategory },
    });

    return { updated: result.count };
  },

  // =========================================================================
  // TEMPLATES
  // =========================================================================

  /**
   * Criar template
   */
  async createTemplate(data: {
    professorId?: string;
    name: string;
    description?: string;
    category: string;
    totalMesocycles: number;
    weeksPerMesocycle: number;
    templateData: any;
    isPublic?: boolean;
  }) {
    return await prisma.periodizationTemplate.create({
      data,
    });
  },

  /**
   * Listar templates
   */
  async listTemplates(professorId?: string) {
    return await prisma.periodizationTemplate.findMany({
      where: {
        OR: [
          { isPublic: true },
          { professorId },
        ],
      },
      orderBy: { usageCount: 'desc' },
    });
  },

  /**
   * Obter template por ID
   */
  async getTemplateById(id: string) {
    return await prisma.periodizationTemplate.findUnique({
      where: { id },
    });
  },

  /**
   * Incrementar contador de uso do template
   */
  async incrementTemplateUsage(id: string) {
    return await prisma.periodizationTemplate.update({
      where: { id },
      data: {
        usageCount: {
          increment: 1,
        },
      },
    });
  },

  /**
   * Deletar template
   */
  async deleteTemplate(id: string) {
    return await prisma.periodizationTemplate.delete({
      where: { id },
    });
  },
};


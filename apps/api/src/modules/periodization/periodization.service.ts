import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Regras de Cálculo Automático
 */

// Calcular % Carga TR baseado em Zona de Repetições
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

// Calcular Séries baseado em Carga Microciclo e REF
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
 * Service de Periodização
 */
export const periodizationService = {
  /**
   * Criar matriz de periodização para um plano
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
            athlete: {
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
  // ESTÍMULO RESISTIDO
  // =========================================================================

  /**
   * Criar ou atualizar estímulo resistido
   */
  async upsertResistedStimulus(data: {
    matrixId: string;
    mesocycleNumber: number;
    weekNumber: number;
    loadCycle?: string | null;
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
    // Calcular campos automáticos
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
   * Obter estímulos resistidos por matriz
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
   * Deletar estímulo resistido
   */
  async deleteResistedStimulus(id: string) {
    return await prisma.resistedStimulus.delete({
      where: { id },
    });
  },

  // =========================================================================
  // ESTÍMULO CÍCLICO
  // =========================================================================

  /**
   * Criar ou atualizar estímulo cíclico
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
   * Obter estímulos cíclicos por matriz
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
   * Deletar estímulo cíclico
   */
  async deleteCyclicStimulus(id: string) {
    return await prisma.cyclicStimulus.delete({
      where: { id },
    });
  },

  // =========================================================================
  // NUTRIÇÃO
  // =========================================================================

  /**
   * Criar ou atualizar nutrição semanal
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
   * Obter nutrição por matriz
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
   * Deletar nutrição
   */
  async deleteNutrition(id: string) {
    return await prisma.nutritionWeekly.delete({
      where: { id },
    });
  },

  // =========================================================================
  // PARÂMETROS
  // =========================================================================

  /**
   * Criar parâmetro
   */
  async createParameter(data: {
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
   * Obter parâmetros por categoria
   */
  async getParametersByCategory(category: string, includeInactive = false) {
    return await prisma.trainingParameter.findMany({
      where: includeInactive ? { category } : { category, active: true },
      orderBy: { order: 'asc' },
    });
  },

  /**
   * Obter todos os parâmetros
   */
  async getAllParameters(includeInactive = false) {
    return await prisma.trainingParameter.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [
        { category: 'asc' },
        { order: 'asc' },
      ],
    });
  },

  /**
   * Atualizar parâmetro
   */
  async updateParameter(
    id: string,
    data: {
      description?: string;
      order?: number;
      active?: boolean;
    }
  ) {
    return await prisma.trainingParameter.update({
      where: { id },
      data,
    });
  },

  /**
   * Deletar parâmetro
   */
  async deleteParameter(id: string) {
    return await prisma.trainingParameter.delete({
      where: { id },
    });
  },

  // =========================================================================
  // TEMPLATES
  // =========================================================================

  /**
   * Criar template
   */
  async createTemplate(data: {
    educatorId?: string;
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
  async listTemplates(educatorId?: string) {
    return await prisma.periodizationTemplate.findMany({
      where: {
        OR: [
          { isPublic: true },
          { educatorId },
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

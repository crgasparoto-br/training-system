import api from './api';

export interface PeriodizationMatrix {
  id: string;
  planId: string;
  totalMesocycles: number;
  weeksPerMesocycle: number;
  resistedStimulus: ResistedStimulus[];
  cyclicStimulus: CyclicStimulus[];
  nutrition: NutritionWeekly[];
  plan?: any;
  createdAt: string;
  updatedAt: string;
}

export interface ResistedStimulus {
  id: string;
  matrixId: string;
  mesocycleNumber: number;
  weekNumber: number;
  loadCycle?: string | null;
  objective?: string | null;
  repZone?: number | null;
  loadPercentage?: number | null;
  seriesReference?: number | null;
  seriesLowerBody?: number | null;
  seriesUpperBody?: number | null;
  seriesCore?: number | null;
  repReserve?: number | null;
  assembly?: string | null;
  method?: string | null;
  trainingDivision?: string | null;
  weeklyFrequency?: number | null;
  observations?: string | null;
}

export interface CyclicStimulus {
  id: string;
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
}

export interface NutritionWeekly {
  id: string;
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
}

export interface TrainingParameter {
  id: string;
  category: string;
  code: string;
  description: string;
  order: number;
  active: boolean;
}

export interface PeriodizationTemplate {
  id: string;
  professorId?: string;
  name: string;
  description?: string;
  category: string;
  totalMesocycles: number;
  weeksPerMesocycle: number;
  templateData: any;
  isPublic: boolean;
  usageCount: number;
}

export const periodizationService = {
  // =========================================================================
  // MATRIZ
  // =========================================================================

  async createMatrix(data: {
    planId: string;
    totalMesocycles: number;
    weeksPerMesocycle: number;
  }): Promise<PeriodizationMatrix> {
    const response = await api.post('/periodization/matrix', data);
    return response.data.data;
  },

  async getMatrixByPlanId(planId: string): Promise<PeriodizationMatrix | null> {
    try {
      const response = await api.get(`/periodization/matrix/${planId}`);
      return response.data.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  async updateMatrix(
    matrixId: string,
    data: {
      totalMesocycles?: number;
      weeksPerMesocycle?: number;
    }
  ): Promise<PeriodizationMatrix> {
    const response = await api.put(`/periodization/matrix/${matrixId}`, data);
    return response.data.data;
  },

  async deleteMatrix(matrixId: string): Promise<void> {
    await api.delete(`/periodization/matrix/${matrixId}`);
  },

  // =========================================================================
  // ESTÃMULO RESISTIDO
  // =========================================================================

  async upsertResistedStimulus(data: Partial<ResistedStimulus>): Promise<ResistedStimulus> {
    const response = await api.post('/periodization/resisted', data);
    return response.data.data;
  },

  async getResistedStimulusByMatrix(matrixId: string): Promise<ResistedStimulus[]> {
    const response = await api.get(`/periodization/resisted/${matrixId}`);
    return response.data.data;
  },

  async deleteResistedStimulus(id: string): Promise<void> {
    await api.delete(`/periodization/resisted/${id}`);
  },

  // =========================================================================
  // ESTÃMULO CÃCLICO
  // =========================================================================

  async upsertCyclicStimulus(data: Partial<CyclicStimulus>): Promise<CyclicStimulus> {
    const response = await api.post('/periodization/cyclic', data);
    return response.data.data;
  },

  async getCyclicStimulusByMatrix(matrixId: string): Promise<CyclicStimulus[]> {
    const response = await api.get(`/periodization/cyclic/${matrixId}`);
    return response.data.data;
  },

  async deleteCyclicStimulus(id: string): Promise<void> {
    await api.delete(`/periodization/cyclic/${id}`);
  },

  // =========================================================================
  // NUTRIÃ‡ÃƒO
  // =========================================================================

  async upsertNutrition(data: Partial<NutritionWeekly>): Promise<NutritionWeekly> {
    const response = await api.post('/periodization/nutrition', data);
    return response.data.data;
  },

  async getNutritionByMatrix(matrixId: string): Promise<NutritionWeekly[]> {
    const response = await api.get(`/periodization/nutrition/${matrixId}`);
    return response.data.data;
  },

  async deleteNutrition(id: string): Promise<void> {
    await api.delete(`/periodization/nutrition/${id}`);
  },

  // =========================================================================
  // PARÃ‚METROS
  // =========================================================================

  async createParameter(data: {
    category: string;
    code: string;
    description: string;
    order: number;
  }): Promise<TrainingParameter> {
    const response = await api.post('/periodization/parameters', data);
    return response.data.data;
  },

  async getAllParameters(includeInactive = false): Promise<TrainingParameter[]> {
    const query = includeInactive ? '?includeInactive=true' : '';
    const response = await api.get(`/periodization/parameters${query}`);
    return response.data.data;
  },

  async getParametersByCategory(category: string): Promise<TrainingParameter[]> {
    const response = await api.get(`/periodization/parameters?category=${category}`);
    return response.data.data;
  },

  async updateParameter(
    id: string,
    data: {
      description?: string;
      order?: number;
      active?: boolean;
    }
  ): Promise<TrainingParameter> {
    const response = await api.put(`/periodization/parameters/${id}`, data);
    return response.data.data;
  },

  async renameParameterCategory(data: {
    fromCategory: string;
    toCategory: string;
  }): Promise<{ updated: number }> {
    const response = await api.put('/periodization/parameters/category', data);
    return response.data.data;
  },

  async deleteParameter(id: string): Promise<void> {
    await api.delete(`/periodization/parameters/${id}`);
  },

  // =========================================================================
  // TEMPLATES
  // =========================================================================

  async createTemplate(data: {
    name: string;
    description?: string;
    category: string;
    totalMesocycles: number;
    weeksPerMesocycle: number;
    templateData: any;
    isPublic?: boolean;
  }): Promise<PeriodizationTemplate> {
    const response = await api.post('/periodization/templates', data);
    return response.data.data;
  },

  async listTemplates(): Promise<PeriodizationTemplate[]> {
    const response = await api.get('/periodization/templates');
    return response.data.data;
  },

  async getTemplateById(id: string): Promise<PeriodizationTemplate> {
    const response = await api.get(`/periodization/templates/${id}`);
    return response.data.data;
  },

  async incrementTemplateUsage(id: string): Promise<PeriodizationTemplate> {
    const response = await api.post(`/periodization/templates/${id}/use`);
    return response.data.data;
  },

  async deleteTemplate(id: string): Promise<void> {
    await api.delete(`/periodization/templates/${id}`);
  },

  // =========================================================================
  // HELPERS
  // =========================================================================

  /**
   * Agrupar estÃ­mulos resistidos por mesociclo e semana
   */
  groupResistedByMesocycleAndWeek(stimuli: ResistedStimulus[]): Map<number, Map<number, ResistedStimulus>> {
    const grouped = new Map<number, Map<number, ResistedStimulus>>();
    
    stimuli.forEach((stimulus) => {
      if (!grouped.has(stimulus.mesocycleNumber)) {
        grouped.set(stimulus.mesocycleNumber, new Map());
      }
      grouped.get(stimulus.mesocycleNumber)!.set(stimulus.weekNumber, stimulus);
    });
    
    return grouped;
  },

  /**
   * Agrupar estÃ­mulos cÃ­clicos por mesociclo e semana
   */
  groupCyclicByMesocycleAndWeek(stimuli: CyclicStimulus[]): Map<number, Map<number, CyclicStimulus>> {
    const grouped = new Map<number, Map<number, CyclicStimulus>>();
    
    stimuli.forEach((stimulus) => {
      if (!grouped.has(stimulus.mesocycleNumber)) {
        grouped.set(stimulus.mesocycleNumber, new Map());
      }
      grouped.get(stimulus.mesocycleNumber)!.set(stimulus.weekNumber, stimulus);
    });
    
    return grouped;
  },

  /**
   * Agrupar nutriÃ§Ã£o por mesociclo e semana
   */
  groupNutritionByMesocycleAndWeek(nutrition: NutritionWeekly[]): Map<number, Map<number, NutritionWeekly>> {
    const grouped = new Map<number, Map<number, NutritionWeekly>>();
    
    nutrition.forEach((item) => {
      if (!grouped.has(item.mesocycleNumber)) {
        grouped.set(item.mesocycleNumber, new Map());
      }
      grouped.get(item.mesocycleNumber)!.set(item.weekNumber, item);
    });
    
    return grouped;
  },
};


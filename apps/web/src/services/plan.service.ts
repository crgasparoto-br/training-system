import api from './api';

export type TrainingPhase = 'base' | 'build' | 'peak' | 'recovery' | 'taper';
export type SessionType = 'easy_run' | 'tempo_run' | 'interval' | 'long_run' | 'recovery' | 'strength' | 'rest';

export interface TrainingPlan {
  id: string;
  educatorId: string;
  athleteId: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  athlete: {
    user: {
      profile: {
        name: string;
      };
    };
  };
  educator?: {
    user?: {
      profile?: {
        name?: string;
      };
    };
  };
  macrocycles: Macrocycle[];
  stats?: PlanStats;
  createdAt: string;
  updatedAt: string;
}

export interface Macrocycle {
  id: string;
  planId: string;
  name: string;
  phase: TrainingPhase;
  weekStart: number;
  weekEnd: number;
  focusAreas: string[];
  mesocycles: Mesocycle[];
}

export interface Mesocycle {
  id: string;
  macrocycleId: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  focus?: string;
  volumeTarget?: number;
  microcycles: Microcycle[];
}

export interface Microcycle {
  id: string;
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

export interface PlanStats {
  totalMacrocycles: number;
  totalMesocycles: number;
  totalMicrocycles: number;
  totalDistance: number;
  totalDuration: number;
  averageWeeklyDistance: number;
  averageSessionDuration: number;
}

export interface CreatePlanDTO {
  athleteId: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
}

export interface CreateSessionDTO {
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

export interface PlansResponse {
  plans: TrainingPlan[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const planService = {
  /**
   * Criar novo plano
   */
  async create(data: CreatePlanDTO): Promise<TrainingPlan> {
    const response = await api.post<{ success: boolean; data: TrainingPlan }>('/plans', data);
    return response.data.data;
  },

  /**
   * Listar planos
   */
  async list(
    page: number = 1,
    limit: number = 10,
    athleteId?: string,
    educatorId?: string,
    status?: 'active' | 'finished' | 'all',
    query?: string
  ): Promise<PlansResponse> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });

    if (athleteId) {
      params.set('athleteId', athleteId);
    }

    if (educatorId) {
      params.set('educatorId', educatorId);
    }

    if (status && status !== 'all') {
      params.set('status', status);
    }

    if (query) {
      params.set('q', query);
    }

    const response = await api.get<{ success: boolean; data: PlansResponse }>(
      `/plans?${params.toString()}`
    );
    return response.data.data;
  },

  /**
   * Listar planos de um aluno (professor)
   */
  async listByAthlete(athleteId: string): Promise<PlansResponse> {
    const response = await api.get<{ success: boolean; data: PlansResponse }>(
      `/plans/athlete/${athleteId}`
    );
    return response.data.data;
  },

  /**
   * Obter plano por ID
   */
  async getById(id: string): Promise<TrainingPlan> {
    const response = await api.get<{ success: boolean; data: TrainingPlan }>(`/plans/${id}`);
    return response.data.data;
  },

  /**
   * Atualizar plano
   */
  async update(id: string, data: Partial<CreatePlanDTO>): Promise<TrainingPlan> {
    const response = await api.put<{ success: boolean; data: TrainingPlan }>(`/plans/${id}`, data);
    return response.data.data;
  },

  /**
   * Deletar plano
   */
  async delete(id: string): Promise<void> {
    await api.delete(`/plans/${id}`);
  },

  /**
   * Gerar semanas automaticamente
   */
  async generateWeeks(id: string): Promise<any> {
    const response = await api.post<{ success: boolean; data: any }>(`/plans/${id}/generate-weeks`);
    return response.data.data;
  },

  /**
   * Criar sessão (microciclo)
   */
  async createSession(data: CreateSessionDTO): Promise<Microcycle> {
    const response = await api.post<{ success: boolean; data: Microcycle }>('/plans/microcycles', data);
    return response.data.data;
  },

  /**
   * Atualizar sessão
   */
  async updateSession(id: string, data: Partial<CreateSessionDTO>): Promise<Microcycle> {
    const response = await api.put<{ success: boolean; data: Microcycle }>(`/plans/microcycles/${id}`, data);
    return response.data.data;
  },

  /**
   * Deletar sessão
   */
  async deleteSession(id: string): Promise<void> {
    await api.delete(`/plans/microcycles/${id}`);
  },

  /**
   * Traduzir fase de treino
   */
  translatePhase(phase: TrainingPhase): string {
    const translations: Record<TrainingPhase, string> = {
      base: 'Base Aeróbica',
      build: 'Construção',
      peak: 'Pico',
      recovery: 'Recuperação',
      taper: 'Polimento',
    };
    return translations[phase];
  },

  /**
   * Traduzir tipo de sessão
   */
  translateSessionType(type: SessionType): string {
    const translations: Record<SessionType, string> = {
      easy_run: 'Corrida Leve',
      tempo_run: 'Corrida Tempo',
      interval: 'Intervalado',
      long_run: 'Corrida Longa',
      recovery: 'Recuperação',
      strength: 'Fortalecimento',
      rest: 'Descanso',
    };
    return translations[type];
  },

  /**
   * Obter cor da fase
   */
  getPhaseColor(phase: TrainingPhase): string {
    const colors: Record<TrainingPhase, string> = {
      base: 'bg-blue-500',
      build: 'bg-green-500',
      peak: 'bg-red-500',
      recovery: 'bg-yellow-500',
      taper: 'bg-purple-500',
    };
    return colors[phase];
  },

  /**
   * Obter cor do tipo de sessão
   */
  getSessionTypeColor(type: SessionType): string {
    const colors: Record<SessionType, string> = {
      easy_run: 'bg-green-100 text-green-800',
      tempo_run: 'bg-orange-100 text-orange-800',
      interval: 'bg-red-100 text-red-800',
      long_run: 'bg-blue-100 text-blue-800',
      recovery: 'bg-yellow-100 text-yellow-800',
      strength: 'bg-purple-100 text-purple-800',
      rest: 'bg-gray-100 text-gray-800',
    };
    return colors[type];
  },

  /**
   * Formatar duração em minutos para horas:minutos
   */
  formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h${mins > 0 ? ` ${mins}min` : ''}`;
    }
    return `${mins}min`;
  },

  /**
   * Formatar pace (min/km)
   */
  formatPace(paceMinPerKm: number): string {
    const minutes = Math.floor(paceMinPerKm);
    const seconds = Math.round((paceMinPerKm - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
  },

  /**
   * Obter nome do dia da semana
   */
  getDayName(dayOfWeek: number): string {
    const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return days[dayOfWeek];
  },
};

import api from './api';

export type TrainingPhase = 'base' | 'build' | 'peak' | 'recovery' | 'taper';
export type SessionType =
  | 'easy_run'
  | 'tempo_run'
  | 'interval'
  | 'long_run'
  | 'recovery'
  | 'strength'
  | 'rest';

export interface TrainingPlan {
  id: string;
  professorId: string;
  alunoId: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  aluno: {
    user: {
      profile: {
        name: string;
      };
    };
  };
  professor?: {
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

/**
 * Estrutura legada mantida apenas para leitura de registros históricos existentes.
 * A montagem operacional nova usa WorkoutTemplate/WorkoutDay/WorkoutExercise.
 */
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
  alunoId: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
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
  async create(data: CreatePlanDTO): Promise<TrainingPlan> {
    const response = await api.post<{ success: boolean; data: TrainingPlan }>('/plans', data);
    return response.data.data;
  },

  async list(
    page: number = 1,
    limit: number = 10,
    alunoId?: string,
    professorId?: string,
    status?: 'active' | 'finished' | 'all',
    query?: string
  ): Promise<PlansResponse> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });

    if (alunoId) {
      params.set('alunoId', alunoId);
    }

    if (professorId) {
      params.set('professorId', professorId);
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

  async listByAluno(alunoId: string): Promise<PlansResponse> {
    const response = await api.get<{ success: boolean; data: PlansResponse }>(
      `/plans/aluno/${alunoId}`
    );
    return response.data.data;
  },

  async getById(id: string): Promise<TrainingPlan> {
    const response = await api.get<{ success: boolean; data: TrainingPlan }>(`/plans/${id}`);
    return response.data.data;
  },

  async update(id: string, data: Partial<CreatePlanDTO>): Promise<TrainingPlan> {
    const response = await api.put<{ success: boolean; data: TrainingPlan }>(`/plans/${id}`, data);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/plans/${id}`);
  },

  async generateWeeks(id: string): Promise<any> {
    const response = await api.post<{ success: boolean; data: any }>(`/plans/${id}/generate-weeks`);
    return response.data.data;
  },

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

  formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h${mins > 0 ? ` ${mins}min` : ''}`;
    }
    return `${mins}min`;
  },

  formatPace(paceMinPerKm: number): string {
    const minutes = Math.floor(paceMinPerKm);
    const seconds = Math.round((paceMinPerKm - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
  },

  getDayName(dayOfWeek: number): string {
    const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return days[dayOfWeek];
  },
};

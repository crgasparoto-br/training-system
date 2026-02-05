import api from './api';

export interface Athlete {
  id: string;
  userId: string;
  educatorId: string;
  age: number;
  weight: number;
  height: number;
  bodyFatPercentage?: number;
  vo2Max: number;
  anaerobicThreshold: number;
  maxHeartRate: number;
  restingHeartRate: number;
  user: {
    email: string;
    isActive?: boolean;
    profile: {
      name: string;
      phone?: string;
      avatar?: string;
    };
  };
  educator?: {
    id: string;
    user?: {
      profile?: {
        name?: string;
      };
    };
  };
  macronutrients?: {
    carbohydratesPercentage: number;
    proteinsPercentage: number;
    lipidsPercentage: number;
    dailyCalories?: number;
  };
  lastPasswordResetAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAthleteDTO {
  name: string;
  email: string;
  phone?: string;
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

export interface AthletesResponse {
  athletes: Athlete[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const athleteService = {
  /**
   * Criar novo atleta
   */
  async create(data: CreateAthleteDTO): Promise<Athlete> {
    const response = await api.post<{ success: boolean; data: Athlete }>('/athletes', data);
    return response.data.data;
  },

  /**
   * Listar atletas
   */
  async list(
    page: number = 1,
    limit: number = 10,
    educatorId?: string,
    status: 'active' | 'inactive' | 'all' = 'active'
  ): Promise<AthletesResponse> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      status,
    });

    if (educatorId) {
      params.set('educatorId', educatorId);
    }

    const response = await api.get<{ success: boolean; data: AthletesResponse }>(
      `/athletes?${params.toString()}`
    );
    return response.data.data;
  },

  /**
   * Buscar atletas por nome
   */
  async search(
    query: string,
    educatorId?: string,
    status: 'active' | 'inactive' | 'all' = 'active'
  ): Promise<Athlete[]> {
    const params = new URLSearchParams({ q: query, status });
    if (educatorId) {
      params.set('educatorId', educatorId);
    }

    const response = await api.get<{ success: boolean; data: Athlete[] }>(
      `/athletes/search?${params.toString()}`
    );
    return response.data.data;
  },

  /**
   * Obter atleta por ID
   */
  async getById(id: string): Promise<Athlete> {
    const response = await api.get<{ success: boolean; data: Athlete }>(`/athletes/${id}`);
    return response.data.data;
  },

  /**
   * Atualizar atleta
   */
  async update(id: string, data: UpdateAthleteDTO): Promise<Athlete> {
    const response = await api.put<{ success: boolean; data: Athlete }>(`/athletes/${id}`, data);
    return response.data.data;
  },

  /**
   * Deletar atleta
   */
  async delete(id: string): Promise<void> {
    await api.delete(`/athletes/${id}`);
  },

  /**
   * Inativar atleta
   */
  async deactivate(id: string): Promise<Athlete> {
    const response = await api.post<{ success: boolean; data: Athlete }>(
      `/athletes/${id}/deactivate`
    );
    return response.data.data;
  },

  /**
   * Reativar atleta
   */
  async activate(id: string): Promise<Athlete> {
    const response = await api.post<{ success: boolean; data: Athlete }>(
      `/athletes/${id}/activate`
    );
    return response.data.data;
  },

  /**
   * Resetar senha do atleta (gera senha temporária)
   */
  async resetPassword(id: string): Promise<{ tempPassword: string }> {
    const response = await api.post<{ success: boolean; data: { tempPassword: string } }>(
      `/athletes/${id}/reset-password`
    );
    return response.data.data;
  },

  /**
   * Calcular IMC
   */
  calculateBMI(weight: number, height: number): number {
    const heightInMeters = height / 100;
    return weight / (heightInMeters * heightInMeters);
  },

  /**
   * Classificação do IMC
   */
  getBMIClassification(bmi: number): string {
    if (bmi < 18.5) return 'Abaixo do peso';
    if (bmi < 25) return 'Peso normal';
    if (bmi < 30) return 'Sobrepeso';
    if (bmi < 35) return 'Obesidade Grau I';
    if (bmi < 40) return 'Obesidade Grau II';
    return 'Obesidade Grau III';
  },
};

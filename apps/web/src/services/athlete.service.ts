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
    profile: {
      name: string;
      phone?: string;
      avatar?: string;
    };
  };
  macronutrients?: {
    carbohydratesPercentage: number;
    proteinsPercentage: number;
    lipidsPercentage: number;
    dailyCalories?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateAthleteDTO {
  userId: string;
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
  async list(page: number = 1, limit: number = 10): Promise<AthletesResponse> {
    const response = await api.get<{ success: boolean; data: AthletesResponse }>(
      `/athletes?page=${page}&limit=${limit}`
    );
    return response.data.data;
  },

  /**
   * Buscar atletas por nome
   */
  async search(query: string): Promise<Athlete[]> {
    const response = await api.get<{ success: boolean; data: Athlete[] }>(
      `/athletes/search?q=${encodeURIComponent(query)}`
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

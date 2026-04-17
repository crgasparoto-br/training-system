import api from './api';

export interface Aluno {
  id: string;
  userId: string;
  professorId: string;
  schedulePlan: 'free' | 'fixed';
  systolicPressure?: number;
  diastolicPressure?: number;
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
      birthDate?: string;
      gender?: 'male' | 'female' | 'other';
    };
  };
  professor?: {
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
  intakeForm?: {
    assessmentDate?: string;
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
    };
  };
  lastPasswordResetAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAlunoResult {
  aluno: Aluno;
  tempPassword: string;
}

export interface CreateAlunoDTO {
  name: string;
  email: string;
  phone?: string;
  schedulePlan: 'free' | 'fixed';
  birthDate?: string;
  gender?: 'male' | 'female' | 'other';
  age: number;
  weight: number;
  height: number;
  bodyFatPercentage?: number;
  vo2Max: number;
  anaerobicThreshold: number;
  maxHeartRate: number;
  restingHeartRate: number;
  systolicPressure?: number;
  diastolicPressure?: number;
  macronutrients?: {
    carbohydratesPercentage?: number;
    proteinsPercentage?: number;
    lipidsPercentage?: number;
    dailyCalories?: number;
  };
  intakeForm?: {
    assessmentDate?: string;
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
    };
  };
}

export interface UpdateAlunoDTO {
  schedulePlan?: 'free' | 'fixed';
  birthDate?: string;
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
    assessmentDate?: string;
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
    };
  };
}

export interface AlunosResponse {
  alunos: Aluno[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const alunoService = {
  /**
   * Criar novo aluno
   */
  async create(data: CreateAlunoDTO): Promise<CreateAlunoResult> {
    const response = await api.post<{ success: boolean; data: CreateAlunoResult }>(
      '/alunos',
      data
    );
    return response.data.data;
  },

  /**
   * Listar alunos
   */
  async list(
    page: number = 1,
    limit: number = 10,
    professorId?: string,
    status: 'active' | 'inactive' | 'all' = 'active'
  ): Promise<AlunosResponse> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      status,
    });

    if (professorId) {
      params.set('professorId', professorId);
    }

    const response = await api.get<{ success: boolean; data: AlunosResponse }>(
      `/alunos?${params.toString()}`
    );
    return response.data.data;
  },

  /**
   * Buscar alunos por nome
   */
  async search(
    query: string,
    professorId?: string,
    status: 'active' | 'inactive' | 'all' = 'active'
  ): Promise<Aluno[]> {
    const params = new URLSearchParams({ q: query, status });
    if (professorId) {
      params.set('professorId', professorId);
    }

    const response = await api.get<{ success: boolean; data: Aluno[] }>(
      `/alunos/search?${params.toString()}`
    );
    return response.data.data;
  },

  /**
   * Obter aluno por ID
   */
  async getById(id: string): Promise<Aluno> {
    const response = await api.get<{ success: boolean; data: Aluno }>(`/alunos/${id}`);
    return response.data.data;
  },

  /**
   * Atualizar aluno
   */
  async update(id: string, data: UpdateAlunoDTO): Promise<Aluno> {
    const response = await api.put<{ success: boolean; data: Aluno }>(`/alunos/${id}`, data);
    return response.data.data;
  },

  /**
   * Excluir aluno
   */
  async delete(id: string): Promise<void> {
    await api.delete(`/alunos/${id}`);
  },

  /**
   * Inativar aluno
   */
  async deactivate(id: string): Promise<Aluno> {
    const response = await api.post<{ success: boolean; data: Aluno }>(
      `/alunos/${id}/deactivate`
    );
    return response.data.data;
  },

  /**
   * Reativar aluno
   */
  async activate(id: string): Promise<Aluno> {
    const response = await api.post<{ success: boolean; data: Aluno }>(
      `/alunos/${id}/activate`
    );
    return response.data.data;
  },

  /**
   * Resetar senha do aluno (gera senha temporaria)
   */
  async resetPassword(id: string): Promise<{ tempPassword: string }> {
    const response = await api.post<{ success: boolean; data: { tempPassword: string } }>(
      `/alunos/${id}/reset-password`
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
   * ClassificaÃ§Ã£o do IMC
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


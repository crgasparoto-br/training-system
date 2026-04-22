import api from './api';

export type ProfessorManualFormat =
  | 'dica_rapida'
  | 'alerta'
  | 'exemplo'
  | 'lembrete_metodo'
  | 'saiba_mais';

export type ProfessorManualContext =
  | 'avaliacao_fisica'
  | 'montagem_treino'
  | 'uso_sistema';

export interface ProfessorManualItem {
  id: string;
  contractId: string;
  code: string;
  title: string;
  content: string;
  format: ProfessorManualFormat;
  context: ProfessorManualContext;
  servicoContratado?: string | null;
  setor?: string | null;
  item?: string | null;
  frase?: string | null;
  productArea: string;
  productMoment?: string | null;
  linkLabel?: string | null;
  linkHref?: string | null;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProfessorManualPayload {
  code: string;
  title: string;
  content: string;
  format: ProfessorManualFormat;
  context: ProfessorManualContext;
  servicoContratado?: string | null;
  setor?: string | null;
  item?: string | null;
  frase?: string | null;
  productArea: string;
  productMoment?: string | null;
  linkLabel?: string | null;
  linkHref?: string | null;
  order?: number;
  isActive?: boolean;
}

type ProfessorManualResponse = {
  success: boolean;
  data: ProfessorManualItem[];
};

type ProfessorManualItemResponse = {
  success: boolean;
  data: ProfessorManualItem;
};

export const professorManualService = {
  async list(filters?: {
    context?: ProfessorManualContext;
    format?: ProfessorManualFormat;
    includeInactive?: boolean;
  }): Promise<ProfessorManualItem[]> {
    const response = await api.get<ProfessorManualResponse>('/professor-manual', {
      params: filters,
    });
    return response.data.data;
  },

  async create(payload: ProfessorManualPayload): Promise<ProfessorManualItem> {
    const response = await api.post<ProfessorManualItemResponse>('/professor-manual', payload);
    return response.data.data;
  },

  async update(id: string, payload: Partial<ProfessorManualPayload>): Promise<ProfessorManualItem> {
    const response = await api.put<ProfessorManualItemResponse>(`/professor-manual/${id}`, payload);
    return response.data.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/professor-manual/${id}`);
  },
};

import api from './api';
import type {
  CreateProfessorRequest,
  ProfessorSummary,
  UpdateProfessorRequest,
} from '@corrida/types';

export const professorService = {
  async list(status?: 'active' | 'inactive'): Promise<ProfessorSummary[]> {
    const response = await api.get<{ success: boolean; data: ProfessorSummary[] }>('/professores', {
      params: status ? { status } : undefined,
    });
    return response.data.data;
  },

  async create(data: CreateProfessorRequest): Promise<ProfessorSummary> {
    const response = await api.post<{ success: boolean; data: ProfessorSummary }>('/professores', data);
    return response.data.data;
  },

  async update(
    id: string,
    data: UpdateProfessorRequest
  ): Promise<ProfessorSummary> {
    const response = await api.put<{ success: boolean; data: ProfessorSummary }>(
      `/professores/${id}`,
      data
    );
    return response.data.data;
  },

  async uploadAvatar(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<{ success: boolean; data: { url: string } }>(
      '/professores/avatar-upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data.data.url;
  },

  async uploadSignedContract(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<{ success: boolean; data: { url: string } }>(
      '/professores/signed-contract-upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data.data.url;
  },

  async deactivate(id: string): Promise<void> {
    await api.post(`/professores/${id}/deactivate`);
  },

  async activate(id: string): Promise<void> {
    await api.post(`/professores/${id}/activate`);
  },

  async validateLegalFinancial(id: string): Promise<ProfessorSummary> {
    const response = await api.post<{ success: boolean; data: ProfessorSummary }>(
      `/professores/${id}/legal-financial/validate`
    );
    return response.data.data;
  },

  async resetPassword(id: string): Promise<{ tempPassword: string }> {
    const response = await api.post<{ success: boolean; data: { tempPassword: string } }>(
      `/professores/${id}/reset-password`
    );
    return response.data.data;
  },
};


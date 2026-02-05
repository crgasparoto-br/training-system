import api from './api';
import type { CreateEducatorRequest, EducatorSummary } from '@corrida/types';

export const educatorService = {
  async list(): Promise<EducatorSummary[]> {
    const response = await api.get<{ success: boolean; data: EducatorSummary[] }>('/educators');
    return response.data.data;
  },

  async create(data: CreateEducatorRequest): Promise<EducatorSummary> {
    const response = await api.post<{ success: boolean; data: EducatorSummary }>('/educators', data);
    return response.data.data;
  },

  async update(
    id: string,
    data: Partial<CreateEducatorRequest>
  ): Promise<EducatorSummary> {
    const response = await api.put<{ success: boolean; data: EducatorSummary }>(
      `/educators/${id}`,
      data
    );
    return response.data.data;
  },

  async deactivate(id: string): Promise<void> {
    await api.post(`/educators/${id}/deactivate`);
  },

  async resetPassword(id: string): Promise<{ tempPassword: string }> {
    const response = await api.post<{ success: boolean; data: { tempPassword: string } }>(
      `/educators/${id}/reset-password`
    );
    return response.data.data;
  },
};

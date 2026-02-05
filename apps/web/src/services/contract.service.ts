import api from './api';

export interface Contract {
  id: string;
  type: 'academy' | 'personal';
  document: string;
  name?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const contractService = {
  async getMe(): Promise<Contract> {
    const response = await api.get<{ success: boolean; data: Contract }>('/contracts/me');
    return response.data.data;
  },

  async updateMe(data: { name?: string; document?: string }): Promise<Contract> {
    const response = await api.put<{ success: boolean; data: Contract }>(
      '/contracts/me',
      data
    );
    return response.data.data;
  },
};

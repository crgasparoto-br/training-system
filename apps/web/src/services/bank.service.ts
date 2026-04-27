import api from './api';
import type { BankOption } from '@corrida/types';

export const bankService = {
  async list(): Promise<BankOption[]> {
    const response = await api.get<{ success: boolean; data: BankOption[] }>('/banks');
    return response.data.data;
  },

  async sync(): Promise<BankOption[]> {
    const response = await api.post<{ success: boolean; data: BankOption[] }>('/banks/sync');
    return response.data.data;
  },
};
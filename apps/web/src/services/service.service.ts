import api from './api';
import type { CreateServiceRequest, ServiceOption, UpdateServiceRequest } from '@corrida/types';

export const serviceCatalogService = {
  async list(includeInactive = false): Promise<ServiceOption[]> {
    const response = await api.get<{ success: boolean; data: ServiceOption[] }>(
      `/services${includeInactive ? '?includeInactive=true' : ''}`
    );
    return response.data.data;
  },

  async create(data: CreateServiceRequest): Promise<ServiceOption> {
    const response = await api.post<{ success: boolean; data: ServiceOption }>('/services', data);
    return response.data.data;
  },

  async update(id: string, data: UpdateServiceRequest): Promise<ServiceOption> {
    const response = await api.put<{ success: boolean; data: ServiceOption }>(`/services/${id}`, data);
    return response.data.data;
  },
};
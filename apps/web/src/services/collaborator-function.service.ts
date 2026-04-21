import api from './api';
import type {
  CollaboratorFunctionOption,
  CreateCollaboratorFunctionRequest,
  UpdateCollaboratorFunctionRequest,
} from '@corrida/types';

export const collaboratorFunctionService = {
  async list(): Promise<CollaboratorFunctionOption[]> {
    const response = await api.get<{ success: boolean; data: CollaboratorFunctionOption[] }>(
      '/collaborator-functions'
    );
    return response.data.data;
  },

  async create(data: CreateCollaboratorFunctionRequest): Promise<CollaboratorFunctionOption> {
    const response = await api.post<{ success: boolean; data: CollaboratorFunctionOption }>(
      '/collaborator-functions',
      data
    );
    return response.data.data;
  },

  async update(
    id: string,
    data: UpdateCollaboratorFunctionRequest
  ): Promise<CollaboratorFunctionOption> {
    const response = await api.put<{ success: boolean; data: CollaboratorFunctionOption }>(
      `/collaborator-functions/${id}`,
      data
    );
    return response.data.data;
  },
};
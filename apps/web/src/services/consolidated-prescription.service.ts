import type {
  CapacityPrescriptionView,
  ConsolidatedPrescriptionAssembly,
  ConsolidatedPrescriptionConflictReport,
  ConsolidatedPrescriptionHistory,
  ConsolidatedPrescriptionVersionCommand,
  CreateConsolidatedPrescriptionDraftPayload,
  CreateConsolidatedPrescriptionRevisionCommand,
  UpdateConsolidatedPrescriptionCompositionPayload,
} from '@corrida/types';
import api from './api';

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
};

async function postVersionCommand(
  alunoId: string,
  action: 'conflicts/recalculate' | 'send-for-review' | 'approve',
  command: ConsolidatedPrescriptionVersionCommand
): Promise<ConsolidatedPrescriptionAssembly> {
  const response = await api.post<ApiEnvelope<ConsolidatedPrescriptionAssembly>>(
    `/consolidated-prescriptions/alunos/${alunoId}/${action}`,
    command
  );
  return response.data.data;
}

export const consolidatedPrescriptionService = {
  async getCurrent(alunoId: string): Promise<ConsolidatedPrescriptionAssembly | null> {
    const response = await api.get<ApiEnvelope<ConsolidatedPrescriptionAssembly | null>>(
      `/consolidated-prescriptions/alunos/${alunoId}`
    );
    return response.data.data;
  },

  async listCapacities(alunoId: string): Promise<CapacityPrescriptionView[]> {
    const response = await api.get<ApiEnvelope<CapacityPrescriptionView[]>>(
      `/capacity-prescriptions/alunos/${alunoId}`
    );
    return response.data.data;
  },

  async createDraft(
    alunoId: string,
    payload: CreateConsolidatedPrescriptionDraftPayload
  ): Promise<ConsolidatedPrescriptionAssembly> {
    const response = await api.post<ApiEnvelope<ConsolidatedPrescriptionAssembly>>(
      `/consolidated-prescriptions/alunos/${alunoId}`,
      payload
    );
    return response.data.data;
  },

  async updateComposition(
    alunoId: string,
    payload: UpdateConsolidatedPrescriptionCompositionPayload
  ): Promise<ConsolidatedPrescriptionAssembly> {
    const response = await api.patch<ApiEnvelope<ConsolidatedPrescriptionAssembly>>(
      `/consolidated-prescriptions/alunos/${alunoId}/composition`,
      payload
    );
    return response.data.data;
  },

  async getConflicts(alunoId: string): Promise<ConsolidatedPrescriptionConflictReport> {
    const response = await api.get<ApiEnvelope<ConsolidatedPrescriptionConflictReport>>(
      `/consolidated-prescriptions/alunos/${alunoId}/conflicts`
    );
    return response.data.data;
  },

  async recalculateConflicts(
    alunoId: string,
    command: ConsolidatedPrescriptionVersionCommand
  ): Promise<ConsolidatedPrescriptionAssembly> {
    return postVersionCommand(alunoId, 'conflicts/recalculate', command);
  },

  async sendForReview(
    alunoId: string,
    command: ConsolidatedPrescriptionVersionCommand
  ): Promise<ConsolidatedPrescriptionAssembly> {
    return postVersionCommand(alunoId, 'send-for-review', command);
  },

  async approve(
    alunoId: string,
    command: ConsolidatedPrescriptionVersionCommand
  ): Promise<ConsolidatedPrescriptionAssembly> {
    return postVersionCommand(alunoId, 'approve', command);
  },

  async createRevision(
    alunoId: string,
    command: CreateConsolidatedPrescriptionRevisionCommand
  ): Promise<ConsolidatedPrescriptionAssembly> {
    const response = await api.post<ApiEnvelope<ConsolidatedPrescriptionAssembly>>(
      `/consolidated-prescriptions/alunos/${alunoId}/revisions`,
      command
    );
    return response.data.data;
  },

  async getHistory(alunoId: string): Promise<ConsolidatedPrescriptionHistory> {
    const response = await api.get<ApiEnvelope<ConsolidatedPrescriptionHistory>>(
      `/consolidated-prescriptions/alunos/${alunoId}/history`
    );
    return response.data.data;
  },
};

import type {
  CapacityPrescriptionView,
  ConsolidatedPrescriptionAssembly,
  ConsolidatedPrescriptionConflictReport,
  ConsolidatedPrescriptionHistory,
  ConsolidatedPrescriptionVersionCommand,
  CreateConsolidatedPrescriptionDraftPayload,
  CreateConsolidatedPrescriptionRevisionCommand,
  UnblockConsolidatedPrescriptionCommand,
  UpdateConsolidatedPrescriptionCompositionPayload,
} from '@corrida/types';
import api from './api';

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
};

async function postVersionCommand(
  alunoId: string,
  action: 'send-for-review' | 'approve',
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

  async getConflicts(
    alunoId: string
  ): Promise<ConsolidatedPrescriptionConflictReport | null> {
    const response = await api.get<ApiEnvelope<ConsolidatedPrescriptionConflictReport | null>>(
      `/consolidated-prescriptions/alunos/${alunoId}/conflicts`
    );
    return response.data.data;
  },

  async recalculateConflicts(
    alunoId: string,
    command: ConsolidatedPrescriptionVersionCommand
  ): Promise<{
    assembly: ConsolidatedPrescriptionAssembly;
    report: ConsolidatedPrescriptionConflictReport;
  }> {
    const response = await api.post<
      ApiEnvelope<{
        assembly: ConsolidatedPrescriptionAssembly;
        report: ConsolidatedPrescriptionConflictReport;
      }>
    >(`/consolidated-prescriptions/alunos/${alunoId}/conflicts/recalculate`, command);
    return response.data.data;
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

  async unblock(
    alunoId: string,
    command: UnblockConsolidatedPrescriptionCommand
  ): Promise<ConsolidatedPrescriptionAssembly> {
    const response = await api.post<ApiEnvelope<ConsolidatedPrescriptionAssembly>>(
      `/consolidated-prescriptions/alunos/${alunoId}/unblock`,
      command
    );
    return response.data.data;
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

  async getHistory(alunoId: string): Promise<ConsolidatedPrescriptionHistory | null> {
    const response = await api.get<ApiEnvelope<ConsolidatedPrescriptionHistory | null>>(
      `/consolidated-prescriptions/alunos/${alunoId}/history`
    );
    return response.data.data;
  },
};

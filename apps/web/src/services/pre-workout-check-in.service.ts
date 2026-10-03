import type { PreWorkoutCheckInView, UpsertPreWorkoutCheckInPayload } from '@corrida/types';
import api from './api';

type ApiEnvelope<T> = { success: boolean; data: T; message?: string };

export const preWorkoutCheckInService = {
  async saveForStudent(
    sessionId: string,
    payload: UpsertPreWorkoutCheckInPayload,
    options: { contractId?: string } = {}
  ): Promise<PreWorkoutCheckInView> {
    const response = await api.put<ApiEnvelope<PreWorkoutCheckInView>>(
      `/student/me/training-sessions/${encodeURIComponent(sessionId)}/check-in`,
      payload,
      options.contractId ? { headers: { 'x-contract-id': options.contractId } } : undefined
    );
    return response.data.data;
  },
};

export function getPreWorkoutCheckInSaveError(error: unknown): string {
  const status = (error as { response?: { status?: number; data?: { message?: string } } })?.response?.status;
  const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  if (status === 409) return message || 'O treino já foi iniciado. O check-in agora está somente leitura.';
  if (status === 400) return message || 'Revise os dados do check-in e tente novamente.';
  return 'Não foi possível salvar o check-in. Seus dados continuam nesta tela para você tentar novamente.';
}

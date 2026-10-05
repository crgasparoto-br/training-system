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

type SaveFailure = {
  kind: 'session-locked' | 'conflict' | 'invalid' | 'temporary';
  message: string;
};

type SaveErrorResponse = {
  response?: {
    status?: number;
    data?: { error?: unknown; message?: unknown; details?: { code?: unknown } };
  };
};

export function getPreWorkoutCheckInSaveFailure(error: unknown): SaveFailure {
  const response = (error as SaveErrorResponse | null)?.response;
  const body = response?.data;
  const code = body?.details?.code;
  const message = typeof body?.error === 'string'
    ? body.error.trim()
    : typeof body?.message === 'string' ? body.message.trim() : '';

  // Only the domain code proves that the session became immutable. A 409 alone
  // may be an idempotency conflict and must not manufacture a session state.
  if (response?.status === 409 && code === 'PRE_WORKOUT_CHECK_IN_LOCKED') {
    return { kind: 'session-locked', message: 'O treino já foi iniciado. O check-in agora está somente leitura.' };
  }
  if (response?.status === 409 && code === 'PRE_WORKOUT_CHECK_IN_IDEMPOTENCY_CONFLICT') {
    return { kind: 'conflict', message: 'Este envio conflitou com uma alteração anterior. Revise os dados antes de tentar novamente.' };
  }
  if (response?.status === 409) {
    return { kind: 'conflict', message: message || 'Não foi possível confirmar esta alteração. Revise os dados e tente novamente.' };
  }
  if (response?.status === 400) {
    return { kind: 'invalid', message: message || 'Revise os dados do check-in e tente novamente.' };
  }
  return { kind: 'temporary', message: 'Não foi possível salvar o check-in. Seus dados continuam nesta tela para você tentar novamente.' };
}

export function getPreWorkoutCheckInSaveError(error: unknown): string {
  return getPreWorkoutCheckInSaveFailure(error).message;
}

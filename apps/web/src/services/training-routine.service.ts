import type { TrainingRoutineView } from '@corrida/types';
import api from './api';

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message?: string;
};

/**
 * Leitura da rotina semanal e do Treino de hoje (#387).
 *
 * Este serviço é intencionalmente somente leitura: iniciar, pausar, concluir ou
 * registrar impossibilidade pertencem ao contrato canônico de execução (#389).
 */
export const trainingRoutineService = {
  async getForStudent(options: { date?: string; contractId?: string } = {}): Promise<TrainingRoutineView> {
    const response = await api.get<ApiEnvelope<TrainingRoutineView>>('/student/me/training-routine', {
      ...(options.date ? { params: { date: options.date } } : {}),
      ...(options.contractId ? { headers: { 'x-contract-id': options.contractId } } : {}),
    });
    return response.data.data;
  },

  async getForAluno(alunoId: string, options: { date?: string } = {}): Promise<TrainingRoutineView> {
    const response = await api.get<ApiEnvelope<TrainingRoutineView>>(
      `/alunos/${encodeURIComponent(alunoId)}/training-routine`,
      options.date ? { params: { date: options.date } } : undefined
    );
    return response.data.data;
  },
};

export type TrainingRoutineLoadErrorKind = 'access-denied' | 'contract-required' | 'error';

export function getTrainingRoutineErrorKind(error: unknown): TrainingRoutineLoadErrorKind {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 409) return 'contract-required';
  if (status === 401 || status === 403 || status === 404) return 'access-denied';
  return 'error';
}

/** Desloca uma data `YYYY-MM-DD` em dias, sem depender do fuso do navegador. */
export function shiftDateOnly(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

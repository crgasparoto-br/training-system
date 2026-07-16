import type { StudentContractActivationResponse } from '@corrida/types';
import api from './api';

export const STUDENT_CONTRACT_ACTIVATION_EVENT =
  'student-contract-activation:completed';

export async function activateStudentContractWithLifecycle(
  alunoId: string,
  studentContractId: string
): Promise<StudentContractActivationResponse> {
  const response = await api.post<{
    success: boolean;
    data: StudentContractActivationResponse;
  }>(`/alunos/${alunoId}/contracts/${studentContractId}/activate`);

  return response.data.data;
}

export function getStudentContractActivationMessage(
  result: StudentContractActivationResponse,
  locale = 'pt-BR'
) {
  if (result.reason === 'awaiting_signature') {
    return 'Substituição preparada. O contrato vigente permanece ativo até a assinatura do novo documento.';
  }

  if (result.reason === 'scheduled_start') {
    const effectiveDate = result.effectiveAt
      ? new Date(result.effectiveAt).toLocaleDateString(locale)
      : 'a data de início planejada';

    return `Contrato assinado e programado para ${effectiveDate}. O contrato vigente permanece ativo até essa data.`;
  }

  return 'Contrato assinado e colocado em vigor com sucesso.';
}

export function publishStudentContractActivation(
  result: StudentContractActivationResponse
) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<StudentContractActivationResponse>(
      STUDENT_CONTRACT_ACTIVATION_EVENT,
      { detail: result }
    )
  );
}

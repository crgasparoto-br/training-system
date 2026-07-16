import { describe, expect, it } from 'vitest';
import type { StudentContractActivationResponse } from '@corrida/types';
import { getStudentContractActivationMessage } from './student-contract-activation';
import { normalizeLegacyActivationFeedback } from './student-contract-activation-adapter';

const baseResponse: StudentContractActivationResponse = {
  studentContract: {
    id: 'link-1',
    alunoId: 'aluno-1',
    contractId: 'document-1',
    serviceId: null,
    status: 'draft',
    startDate: null,
    endDate: null,
    signedAt: null,
    canceledAt: null,
    cancellationReason: null,
    amount: null,
    paymentDay: null,
    notes: null,
    createdAt: '2026-07-13T10:00:00.000Z',
    updatedAt: '2026-07-13T10:00:00.000Z',
  },
  activationDeferred: true,
  reason: 'awaiting_signature',
};

describe('student contract activation feedback', () => {
  it('informa que a substituição aguarda assinatura sem encerrar o vigente', () => {
    const message = getStudentContractActivationMessage(baseResponse);

    expect(message).toContain('permanece ativo');
    expect(message).toContain('assinatura');
    expect(message).not.toContain('ativado com sucesso');
  });

  it('informa a data efetiva quando a vigência foi programada', () => {
    const message = getStudentContractActivationMessage({
      ...baseResponse,
      studentContract: {
        ...baseResponse.studentContract,
        status: 'pending_signature',
        startDate: '2026-08-01T00:00:00.000Z',
        signedAt: '2026-07-13T12:00:00.000Z',
      },
      reason: 'scheduled_start',
      effectiveAt: '2026-08-01T00:00:00.000Z',
    });

    expect(message).toContain('01/08/2026');
    expect(message).toContain('permanece ativo');
  });

  it('substitui feedback legado por mensagem coerente com o motivo retornado', () => {
    expect(
      normalizeLegacyActivationFeedback('Contrato ativado com sucesso.', baseResponse)
    ).toBe(getStudentContractActivationMessage(baseResponse));
  });
});

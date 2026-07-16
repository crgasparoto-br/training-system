import { describe, expect, it } from 'vitest';
import { resolveStudentContractDelivery } from './student-contract-delivery';

describe('resolveStudentContractDelivery', () => {
  it('exige geração antes de enviar um modelo', () => {
    expect(
      resolveStudentContractDelivery({ selectedContractId: 'template:model-1' })
    ).toMatchObject({
      canSend: false,
      actionLabel: 'Enviar para assinatura',
      requiresConfirmation: false,
    });
  });

  it('permite enviar um contrato gerado', () => {
    expect(
      resolveStudentContractDelivery({
        selectedContractId: 'contract-1',
        contract: { status: 'GENERATED' },
      })
    ).toMatchObject({
      canSend: true,
      actionLabel: 'Enviar para assinatura',
      requiresConfirmation: false,
    });
  });

  it('trata novo envio como substituição do link anterior', () => {
    expect(
      resolveStudentContractDelivery({
        selectedContractId: 'contract-1',
        contract: { status: 'VIEWED' },
      })
    ).toMatchObject({
      canSend: true,
      actionLabel: 'Gerar novo link',
      requiresConfirmation: true,
    });
  });

  it.each(['SIGNED', 'REJECTED', 'CANCELLED', 'EXPIRED'] as const)(
    'bloqueia envio quando o status é %s',
    (status) => {
      expect(
        resolveStudentContractDelivery({
          selectedContractId: 'contract-1',
          contract: { status },
        }).canSend
      ).toBe(false);
    }
  );

  it('orienta gerar novo documento depois da recusa', () => {
    expect(
      resolveStudentContractDelivery({
        selectedContractId: 'contract-1',
        contract: { status: 'REJECTED' },
      })
    ).toMatchObject({
      actionLabel: 'Contrato recusado',
      description: 'O aluno recusou este documento. Revise as condições e gere um novo contrato.',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { resolveStudentContractStatus } from './student-contract-status';

describe('resolveStudentContractStatus', () => {
  it('informa que um modelo ainda não foi aprovado', () => {
    expect(
      resolveStudentContractStatus({ selectedContractId: 'template:template-1' })
    ).toEqual(
      expect.objectContaining({
        label: 'Modelo selecionado — ainda não gerado',
        approvalLabel: 'Não',
        approved: false,
      })
    );
  });

  it('distingue contrato enviado de contrato aprovado', () => {
    expect(
      resolveStudentContractStatus({
        selectedContractId: 'contract-1',
        contract: { status: 'SENT', signedAt: null },
      })
    ).toEqual(
      expect.objectContaining({
        label: 'Enviado — aguardando assinatura',
        approvalLabel: 'Não',
        approved: false,
      })
    );
  });

  it('considera aprovado somente o documento assinado', () => {
    expect(
      resolveStudentContractStatus({
        selectedContractId: 'contract-1',
        contract: { status: 'SIGNED', signedAt: '2026-07-11T01:30:00.000Z' },
      })
    ).toEqual(
      expect.objectContaining({
        label: 'Aprovado e assinado',
        approvalLabel: 'Sim',
        approved: true,
        signedAt: '2026-07-11T01:30:00.000Z',
      })
    );
  });

  it('não confirma aprovação quando o status não pode ser consultado', () => {
    expect(
      resolveStudentContractStatus({ selectedContractId: 'contract-1', error: true })
    ).toEqual(
      expect.objectContaining({
        label: 'Status indisponível',
        approvalLabel: 'Não confirmado',
        approved: false,
      })
    );
  });
});

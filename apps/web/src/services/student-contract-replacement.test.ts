import { describe, expect, it } from 'vitest';
import { publishContractReplacementState } from './contract-replacement-coordination';
import {
  resolveStudentContractReplacement,
  shouldBypassLegacyContractReplacementConfirm,
} from './student-contract-replacement';

describe('resolveStudentContractReplacement', () => {
  it('não exige confirmação quando o contrato selecionado já é o ativo', () => {
    expect(
      resolveStudentContractReplacement({
        activeContractId: 'contract-1',
        selectedContractId: 'contract-1',
      })
    ).toEqual({ required: false, confirmed: false, canProceed: true });
  });

  it('bloqueia a troca até confirmar a seleção atual', () => {
    expect(
      resolveStudentContractReplacement({
        activeContractId: 'contract-1',
        selectedContractId: 'contract-2',
      })
    ).toEqual({ required: true, confirmed: false, canProceed: false });
  });

  it('aceita somente a confirmação vinculada ao novo contrato selecionado', () => {
    expect(
      resolveStudentContractReplacement({
        activeContractId: 'contract-1',
        selectedContractId: 'contract-2',
        confirmedForContractId: 'contract-2',
      })
    ).toEqual({ required: true, confirmed: true, canProceed: true });

    expect(
      resolveStudentContractReplacement({
        activeContractId: 'contract-1',
        selectedContractId: 'contract-3',
        confirmedForContractId: 'contract-2',
      }).canProceed
    ).toBe(false);
  });
});

describe('shouldBypassLegacyContractReplacementConfirm', () => {
  it('consome uma única vez o estado explícito, independentemente do texto', () => {
    publishContractReplacementState({
      activeContractId: 'contract-active',
      selectedContractId: 'contract-new',
      required: true,
      confirmed: true,
    });

    expect(
      shouldBypassLegacyContractReplacementConfirm(
        'Uma redação futura completamente diferente',
        true
      )
    ).toBe(true);
    expect(
      shouldBypassLegacyContractReplacementConfirm(
        'Outra confirmação que não deve ser liberada',
        true
      )
    ).toBe(false);

    publishContractReplacementState({
      activeContractId: 'contract-active',
      selectedContractId: 'contract-new',
      required: true,
      confirmed: false,
    });
    publishContractReplacementState({
      activeContractId: 'contract-active',
      selectedContractId: 'contract-new-2',
      required: true,
      confirmed: true,
    });

    expect(shouldBypassLegacyContractReplacementConfirm(undefined, true)).toBe(true);
  });

  it('não libera confirmação sem substituição explicitamente confirmada', () => {
    publishContractReplacementState({
      activeContractId: 'contract-active',
      selectedContractId: 'contract-new',
      required: true,
      confirmed: false,
    });

    expect(
      shouldBypassLegacyContractReplacementConfirm(
        'Este aluno já possui um contrato ativo.',
        false
      )
    ).toBe(false);
  });
});

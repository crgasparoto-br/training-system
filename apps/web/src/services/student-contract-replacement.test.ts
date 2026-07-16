import { describe, expect, it } from 'vitest';
import { resolveStudentContractReplacement } from './student-contract-replacement';

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
